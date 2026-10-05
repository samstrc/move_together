"""Budgets (one per category per move), expenses, and who owes what.

When an expense is logged, it's split into shares saved in expense_splits.
There are three ways to split it:
  - everyone (default): by each member's split_weight. Everyone has 1 unless
    an owner changes it, so this is an even split.
  - split_between: only these members, again by split_weight.
  - custom_splits: exact amounts per person, which must add up to the total.

Each person's balance = what they paid - their share of expenses
                        + payments they sent - payments they received.
Positive means the group owes them; negative means they owe. Payments
between people ("Caius paid Sam back $20") are stored in settlements.
All endpoints are members-only.
"""

from datetime import date
from decimal import ROUND_DOWN, Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection
from pydantic import BaseModel, Field

from auth import get_current_user, require_member
from db import get_db

router = APIRouter(prefix="/moves/{move_id}", tags=["budget"])

CENT = Decimal("0.01")


class BudgetIn(BaseModel):
    amount: Decimal = Field(ge=0, max_digits=10, decimal_places=2)


class SettlementIn(BaseModel):
    to_user: int
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    from_user: int | None = None  # defaults to the logged-in user


class CustomSplit(BaseModel):
    user_id: int
    amount: Decimal = Field(ge=0, max_digits=10, decimal_places=2)


class ExpenseIn(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    category_id: int | None = None
    item_id: int | None = None
    paid_by: int | None = None  # defaults to the logged-in user
    expense_date: date | None = None  # defaults to today
    # How to split it (leave both out to split between everyone):
    split_between: list[int] | None = None  # only these user_ids
    custom_splits: list[CustomSplit] | None = None  # exact amounts


def split_amount(amount: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """Split an amount by weight, in whole cents, so the shares add up exactly.

    e.g. $25.00 three ways -> [8.34, 8.33, 8.33]
    """
    total_weight = sum(weights)
    shares = [(amount * w / total_weight).quantize(CENT, rounding=ROUND_DOWN) for w in weights]
    leftover_cents = int((amount - sum(shares)) / CENT)
    for i in range(leftover_cents):
        shares[i % len(shares)] += CENT
    return shares


def suggest_payments(members: list[dict]) -> list[dict]:
    """The fewest payments that bring everyone's balance to zero.

    Repeatedly has the person who owes the most pay the person owed the most,
    as much as one of them needs, until everything is settled.
    e.g. balances Sam +20, Caius -15, Qiaozhi -5
         -> Caius pays Sam 15, Qiaozhi pays Sam 5
    """
    owed = [[m["balance"], m] for m in members if m["balance"] >= CENT]    # creditors
    owing = [[-m["balance"], m] for m in members if m["balance"] <= -CENT]  # debtors
    payments = []
    while owed and owing:
        owed.sort(key=lambda x: x[0], reverse=True)
        owing.sort(key=lambda x: x[0], reverse=True)
        amount = min(owed[0][0], owing[0][0])
        payer, payee = owing[0][1], owed[0][1]
        payments.append({
            "from_user": payer["user_id"], "from_name": payer["name"],
            "to_user": payee["user_id"], "to_name": payee["name"],
            "amount": amount,
        })
        owed[0][0] -= amount
        owing[0][0] -= amount
        owed = [x for x in owed if x[0] >= CENT]
        owing = [x for x in owing if x[0] >= CENT]
    return payments


def work_out_splits(body: ExpenseIn, members: list[dict]) -> list[tuple[int, Decimal]]:
    """Turn the expense's split option into (user_id, amount owed) pairs."""
    member_ids = {m["user_id"] for m in members}
    if body.split_between is not None and body.custom_splits is not None:
        raise HTTPException(status_code=400, detail="Choose one way to split the expense")

    if body.custom_splits is not None:
        ids = [s.user_id for s in body.custom_splits]
        if not ids or len(ids) != len(set(ids)):
            raise HTTPException(status_code=400, detail="List each person once")
        if not set(ids) <= member_ids:
            raise HTTPException(status_code=400, detail="Everyone in the split must be in this group")
        if sum(s.amount for s in body.custom_splits) != body.amount:
            raise HTTPException(
                status_code=400,
                detail=f"The amounts must add up to the total ({body.amount})",
            )
        return [(s.user_id, s.amount) for s in body.custom_splits if s.amount > 0]

    chosen = members
    if body.split_between is not None:
        wanted = set(body.split_between)
        if not wanted:
            raise HTTPException(status_code=400, detail="Pick at least one person to split with")
        if not wanted <= member_ids:
            raise HTTPException(status_code=400, detail="Everyone in the split must be in this group")
        chosen = [m for m in members if m["user_id"] in wanted]
    shares = split_amount(body.amount, [m["split_weight"] for m in chosen])
    return [(m["user_id"], share) for m, share in zip(chosen, shares)]


# ---------- Endpoints ----------

@router.get("/budget")
def budget_summary(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Everything the Budget page needs:

    - categories: budget vs. spent for each category that has either
    - totals: overall budget and spending
    - members: what each person paid, their share, and their balance
      (positive = the group owes them, negative = they owe the group)
    """
    require_member(move_id, user, db)
    params = {"move_id": move_id}

    categories = db.execute(
        """
        SELECT c.category_id, c.name, b.amount AS budget, COALESCE(s.spent, 0) AS spent
        FROM categories c
        LEFT JOIN budgets b
               ON b.category_id = c.category_id AND b.move_id = %(move_id)s
        LEFT JOIN (SELECT category_id, SUM(amount) AS spent
                   FROM expenses WHERE move_id = %(move_id)s
                   GROUP BY category_id) s
               ON s.category_id = c.category_id
        WHERE b.amount IS NOT NULL OR s.spent IS NOT NULL
        ORDER BY c.name
        """,
        params,
    ).fetchall()

    totals = db.execute(
        """
        SELECT (SELECT COALESCE(SUM(amount), 0) FROM budgets  WHERE move_id = %(move_id)s) AS budget,
               (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE move_id = %(move_id)s) AS spent
        """,
        params,
    ).fetchone()

    # Current members, plus anyone who left but still paid or owes something,
    # so the balances always add up to zero.
    members = db.execute(
        """
        WITH people AS (
            SELECT user_id FROM move_members WHERE move_id = %(move_id)s
            UNION
            SELECT paid_by FROM expenses WHERE move_id = %(move_id)s
            UNION
            SELECT s.user_id FROM expense_splits s
            JOIN expenses e ON e.expense_id = s.expense_id
            WHERE e.move_id = %(move_id)s
            UNION
            SELECT from_user FROM settlements WHERE move_id = %(move_id)s
            UNION
            SELECT to_user FROM settlements WHERE move_id = %(move_id)s
        )
        SELECT u.user_id, u.name,
               EXISTS (SELECT 1 FROM move_members mm
                       WHERE mm.move_id = %(move_id)s AND mm.user_id = u.user_id) AS is_member,
               COALESCE((SELECT SUM(e.amount) FROM expenses e
                         WHERE e.move_id = %(move_id)s AND e.paid_by = u.user_id), 0) AS paid,
               COALESCE((SELECT SUM(s.amount_owed) FROM expense_splits s
                         JOIN expenses e ON e.expense_id = s.expense_id
                         WHERE e.move_id = %(move_id)s AND s.user_id = u.user_id), 0) AS share,
               COALESCE((SELECT SUM(amount) FROM settlements
                         WHERE move_id = %(move_id)s AND from_user = u.user_id), 0) AS sent,
               COALESCE((SELECT SUM(amount) FROM settlements
                         WHERE move_id = %(move_id)s AND to_user = u.user_id), 0) AS received
        FROM people p
        JOIN users u ON u.user_id = p.user_id
        ORDER BY is_member DESC, u.name
        """,
        params,
    ).fetchall()
    for m in members:
        m["balance"] = m["paid"] - m["share"] + m["sent"] - m["received"]

    return {
        "categories": categories,
        "totals": totals,
        "members": members,
        "settle_up": suggest_payments(members),
    }


@router.put("/budgets/{category_id}")
def set_budget(
    move_id: int,
    category_id: int,
    body: BudgetIn,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Set (or replace) the budget for one category."""
    require_member(move_id, user, db)
    return db.execute(
        """
        INSERT INTO budgets (move_id, category_id, amount) VALUES (%s, %s, %s)
        ON CONFLICT (move_id, category_id) DO UPDATE SET amount = EXCLUDED.amount
        RETURNING move_id, category_id, amount
        """,
        (move_id, category_id, body.amount),
    ).fetchone()


@router.delete("/budgets/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_budget(
    move_id: int,
    category_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Remove a category's budget (its expenses are kept)."""
    require_member(move_id, user, db)
    db.execute(
        "DELETE FROM budgets WHERE move_id = %s AND category_id = %s", (move_id, category_id)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/expenses")
def list_expenses(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """All expenses for the move, newest first."""
    require_member(move_id, user, db)
    return db.execute(
        """
        SELECT e.expense_id, e.description, e.amount, e.expense_date,
               e.category_id, c.name AS category,
               e.item_id, i.name AS item,
               e.paid_by AS paid_by_id, u.name AS paid_by,
               (SELECT json_agg(json_build_object('user_id', s.user_id, 'name', su.name,
                                                  'amount', s.amount_owed)
                                ORDER BY su.name)
                FROM expense_splits s
                JOIN users su ON su.user_id = s.user_id
                WHERE s.expense_id = e.expense_id) AS splits
        FROM expenses e
        LEFT JOIN categories c ON c.category_id = e.category_id
        LEFT JOIN items i      ON i.item_id     = e.item_id
        JOIN users u           ON u.user_id     = e.paid_by
        WHERE e.move_id = %s
        ORDER BY e.expense_date DESC, e.expense_id DESC
        """,
        (move_id,),
    ).fetchall()


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def log_expense(
    move_id: int,
    body: ExpenseIn,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Log an expense and split it (see the top of this file for the options)."""
    require_member(move_id, user, db)

    members = db.execute(
        "SELECT user_id, split_weight FROM move_members WHERE move_id = %s ORDER BY user_id",
        (move_id,),
    ).fetchall()
    member_ids = {m["user_id"] for m in members}
    paid_by = body.paid_by if body.paid_by is not None else user["user_id"]
    if paid_by not in member_ids:
        raise HTTPException(status_code=400, detail="That person isn't in this group")
    splits = work_out_splits(body, members)
    if body.item_id is not None:
        ok = db.execute(
            "SELECT 1 FROM items WHERE item_id = %s AND move_id = %s", (body.item_id, move_id)
        ).fetchone()
        if not ok:
            raise HTTPException(status_code=400, detail="That item isn't part of this group")

    expense = db.execute(
        """
        INSERT INTO expenses (move_id, item_id, category_id, description, amount, paid_by, expense_date)
        VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, CURRENT_DATE))
        RETURNING expense_id
        """,
        (move_id, body.item_id, body.category_id, body.description.strip(),
         body.amount, paid_by, body.expense_date),
    ).fetchone()

    with db.cursor() as cur:
        cur.executemany(
            "INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES (%s, %s, %s)",
            [(expense["expense_id"], user_id, share) for user_id, share in splits],
        )
    return {"expense_id": expense["expense_id"]}


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    move_id: int,
    expense_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Delete an expense (its splits are deleted with it)."""
    require_member(move_id, user, db)
    deleted = db.execute(
        "DELETE FROM expenses WHERE expense_id = %s AND move_id = %s RETURNING expense_id",
        (expense_id, move_id),
    ).fetchone()
    if deleted is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/settlements")
def list_settlements(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Payments recorded between people, newest first."""
    require_member(move_id, user, db)
    return db.execute(
        """
        SELECT st.settlement_id, st.amount, st.settled_at,
               st.from_user, fu.name AS from_name,
               st.to_user, tu.name AS to_name,
               rb.name AS recorded_by
        FROM settlements st
        JOIN users fu      ON fu.user_id = st.from_user
        JOIN users tu      ON tu.user_id = st.to_user
        LEFT JOIN users rb ON rb.user_id = st.recorded_by
        WHERE st.move_id = %s
        ORDER BY st.settled_at DESC, st.settlement_id DESC
        """,
        (move_id,),
    ).fetchall()


@router.post("/settlements", status_code=status.HTTP_201_CREATED)
def record_settlement(
    move_id: int,
    body: SettlementIn,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Record that one person paid another back (e.g. after "Mark as paid").

    Only the person who paid or the person who got paid can record it.
    """
    require_member(move_id, user, db)
    from_user = body.from_user if body.from_user is not None else user["user_id"]
    if user["user_id"] not in (from_user, body.to_user):
        raise HTTPException(
            status_code=403, detail="Only the people paying or getting paid can record a payment"
        )
    if from_user == body.to_user:
        raise HTTPException(status_code=400, detail="Pick two different people")
    # Both people must be in the group, or have left with money still involved.
    involved = db.execute(
        """
        SELECT user_id FROM move_members WHERE move_id = %(m)s
        UNION SELECT paid_by FROM expenses WHERE move_id = %(m)s
        UNION SELECT s.user_id FROM expense_splits s
              JOIN expenses e ON e.expense_id = s.expense_id WHERE e.move_id = %(m)s
        """,
        {"m": move_id},
    ).fetchall()
    involved_ids = {row["user_id"] for row in involved}
    if from_user not in involved_ids or body.to_user not in involved_ids:
        raise HTTPException(status_code=400, detail="That person isn't part of this group")
    row = db.execute(
        """
        INSERT INTO settlements (move_id, from_user, to_user, amount, recorded_by)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING settlement_id
        """,
        (move_id, from_user, body.to_user, body.amount, user["user_id"]),
    ).fetchone()
    return row


@router.delete("/settlements/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_settlement(
    move_id: int,
    settlement_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Undo a recorded payment. Only the payer or the person paid can undo it."""
    require_member(move_id, user, db)
    payment = db.execute(
        "SELECT from_user, to_user FROM settlements WHERE settlement_id = %s AND move_id = %s",
        (settlement_id, move_id),
    ).fetchone()
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if user["user_id"] not in (payment["from_user"], payment["to_user"]):
        raise HTTPException(
            status_code=403, detail="Only the people paying or getting paid can undo a payment"
        )
    db.execute("DELETE FROM settlements WHERE settlement_id = %s", (settlement_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
