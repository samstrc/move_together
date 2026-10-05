"""The shared item list for a move, plus the category list.

All item endpoints are members-only.
"""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection, sql
from pydantic import BaseModel, Field

from auth import get_current_user, require_member
from db import get_db

router = APIRouter(tags=["items"])

# Every column an item response includes. Names (category, responsible, ...)
# are for showing; the *_id columns are for editing.
ITEM_SELECT = """
    SELECT i.item_id,
           i.name,
           i.category_id,
           c.name  AS category,
           i.room_id,
           r.name  AS room,
           i.quantity,
           i.est_cost,
           i.status,
           i.responsible_user_id,
           ru.name AS responsible,
           i.added_by AS added_by_id,
           au.name AS added_by,
           i.notes,
           i.created_at
    FROM items i
    LEFT JOIN categories c ON c.category_id = i.category_id
    LEFT JOIN rooms r      ON r.room_id     = i.room_id
    LEFT JOIN users ru     ON ru.user_id    = i.responsible_user_id
    LEFT JOIN users au     ON au.user_id    = i.added_by
"""


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    category_id: int | None = None
    room_id: int | None = None
    quantity: int = Field(default=1, gt=0)
    est_cost: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    responsible_user_id: int | None = None
    notes: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    category_id: int | None = None
    room_id: int | None = None
    quantity: int | None = Field(default=None, gt=0)
    est_cost: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    status: Literal["needed", "bought"] | None = None
    responsible_user_id: int | None = None
    notes: str | None = None


def check_references(move_id: int, fields: dict, db: Connection) -> None:
    """Make sure a room or responsible person belongs to this same move.

    (Foreign keys only check that the row exists somewhere, not that it's
    part of this move.)
    """
    if fields.get("room_id") is not None:
        ok = db.execute(
            "SELECT 1 FROM rooms WHERE room_id = %s AND move_id = %s",
            (fields["room_id"], move_id),
        ).fetchone()
        if not ok:
            raise HTTPException(status_code=400, detail="That room isn't part of this group")
    if fields.get("responsible_user_id") is not None:
        ok = db.execute(
            "SELECT 1 FROM move_members WHERE user_id = %s AND move_id = %s",
            (fields["responsible_user_id"], move_id),
        ).fetchone()
        if not ok:
            raise HTTPException(status_code=400, detail="That person isn't in this group")


def get_item(move_id: int, item_id: int, db: Connection) -> dict:
    item = db.execute(
        ITEM_SELECT + " WHERE i.move_id = %s AND i.item_id = %s", (move_id, item_id)
    ).fetchone()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


# ---------- Endpoints ----------

@router.get("/categories")
def list_categories(db: Connection = Depends(get_db)):
    """The fixed category list (Kitchen, Furniture, ...), for dropdowns."""
    return db.execute("SELECT category_id, name FROM categories ORDER BY name").fetchall()


@router.get("/moves/{move_id}/items")
def list_items(
    move_id: int,
    q: str | None = None,
    status: Literal["needed", "bought"] | None = None,
    category_id: int | None = None,
    responsible_user_id: int | None = None,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """The shared list, newest first. All filters are optional:

    - q: search names and notes. Matches word forms ("pan" finds "pans")
      through full-text search, and partial words through ILIKE.
    - status, category_id, responsible_user_id: exact filters.
    """
    require_member(move_id, user, db)

    conditions = [sql.SQL("i.move_id = %s")]
    params: list = [move_id]
    if q and q.strip():
        conditions.append(sql.SQL(
            "(to_tsvector('english', i.name || ' ' || coalesce(i.notes, ''))"
            " @@ plainto_tsquery('english', %s) OR i.name ILIKE %s)"
        ))
        params += [q.strip(), f"%{q.strip()}%"]
    if status:
        conditions.append(sql.SQL("i.status = %s"))
        params.append(status)
    if category_id is not None:
        conditions.append(sql.SQL("i.category_id = %s"))
        params.append(category_id)
    if responsible_user_id is not None:
        conditions.append(sql.SQL("i.responsible_user_id = %s"))
        params.append(responsible_user_id)

    query = sql.SQL(ITEM_SELECT + " WHERE {} ORDER BY i.created_at DESC, i.item_id DESC").format(
        sql.SQL(" AND ").join(conditions)
    )
    return db.execute(query, params).fetchall()


@router.post("/moves/{move_id}/items", status_code=status.HTTP_201_CREATED)
def add_item(
    move_id: int,
    body: ItemIn,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Add an item to the list. added_by is set to the logged-in user."""
    require_member(move_id, user, db)
    check_references(move_id, body.model_dump(), db)
    row = db.execute(
        """
        INSERT INTO items (move_id, name, category_id, room_id, quantity, est_cost,
                           responsible_user_id, added_by, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING item_id
        """,
        (move_id, body.name.strip(), body.category_id, body.room_id, body.quantity,
         body.est_cost, body.responsible_user_id, user["user_id"], body.notes),
    ).fetchone()
    return get_item(move_id, row["item_id"], db)


@router.patch("/moves/{move_id}/items/{item_id}")
def update_item(
    move_id: int,
    item_id: int,
    body: ItemUpdate,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Change any of an item's fields, e.g. {"status": "bought"}.

    Fields you leave out stay the same. Send null to clear an optional field.
    """
    require_member(move_id, user, db)
    get_item(move_id, item_id, db)  # 404 if it isn't in this move

    changes = body.model_dump(exclude_unset=True)
    for required in ("name", "quantity", "status"):  # these can't be cleared
        if changes.get(required) is None:
            changes.pop(required, None)
    if not changes:
        return get_item(move_id, item_id, db)
    check_references(move_id, changes, db)

    # Column names come from the ItemUpdate fields above, never from the
    # request itself, and sql.Identifier quotes them safely.
    assignments = sql.SQL(", ").join(
        sql.SQL("{} = %s").format(sql.Identifier(column)) for column in changes
    )
    db.execute(
        sql.SQL("UPDATE items SET {} WHERE item_id = %s AND move_id = %s").format(assignments),
        [*changes.values(), item_id, move_id],
    )
    return get_item(move_id, item_id, db)


@router.delete("/moves/{move_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    move_id: int,
    item_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Remove an item. Expenses that pointed to it are kept (item_id becomes NULL)."""
    require_member(move_id, user, db)
    deleted = db.execute(
        "DELETE FROM items WHERE item_id = %s AND move_id = %s RETURNING item_id",
        (item_id, move_id),
    ).fetchone()
    if deleted is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
