"""Moves (shown as "groups" in the app): create, join, view, and edit.

Every endpoint needs a logged-in user. Endpoints for a specific move also
check that the user is a member of it (require_member).
"""

import secrets
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection
from psycopg.rows import DictRow
from pydantic import BaseModel, ConfigDict, Field

from auth_routes import get_current_user, require_member
from db import get_db

router = APIRouter(prefix="/moves", tags=["moves"])


class MoveIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    destination: str | None = Field(default=None, max_length=255)
    target_date: date | None = None


class MoveUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    destination: str | None = Field(default=None, max_length=255)
    target_date: date | None = None


class JoinIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)


class MemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    move_in_date: date | None = None
    split_weight: Decimal | None = Field(default=None, gt=0, max_digits=5, decimal_places=2)


# Letters and digits that are hard to mix up when read aloud (no 0/O, 1/I/L).
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_invite_code(db: Connection[DictRow]) -> str:
    """A random, unused code like MOVE-7KQ2."""
    while True:
        code = "MOVE-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
        taken = db.execute("SELECT 1 FROM invitations WHERE code = %s", (code,)).fetchone()
        if not taken:
            return code


def lock_move(move_id: int, db: Connection[DictRow]) -> None:
    """Lock the group row to serialize ownership and membership changes."""
    row = db.execute("SELECT move_id FROM moves WHERE move_id = %s FOR UPDATE", (move_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Move not found")


def require_owner(move_id: int, user: dict, db: Connection[DictRow]) -> None:
    """Raise 403 unless the user is still the owner, locking out concurrent transfers."""
    if require_member(move_id, user, db) != "owner":
        raise HTTPException(status_code=403, detail="Only the group's owner can do that")
    lock_move(move_id, db)
    if require_member(move_id, user, db) != "owner":
        raise HTTPException(status_code=403, detail="Only the group's owner can do that")


# ---------- Endpoints ----------

@router.get("")
def list_my_moves(user: dict = Depends(get_current_user), db: Connection[DictRow] = Depends(get_db)):
    """Every move the logged-in user belongs to, soonest move date first."""
    return db.execute(
        """
        SELECT m.move_id, m.name, m.destination, m.target_date, mm.role,
               (SELECT COUNT(*) FROM move_members x WHERE x.move_id = m.move_id) AS member_count
        FROM moves m
        JOIN move_members mm ON mm.move_id = m.move_id
        WHERE mm.user_id = %s
        ORDER BY m.target_date NULLS LAST, m.move_id
        """,
        (user["user_id"],),
    ).fetchall()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_move(
    body: MoveIn,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Create a move. The creator becomes its owner, and it gets an invite code."""
    move = db.execute(
        """
        INSERT INTO moves (name, destination, target_date, created_by)
        VALUES (%s, %s, %s, %s)
        RETURNING move_id, name, destination, target_date
        """,
        (body.name.strip(), body.destination, body.target_date, user["user_id"]),
    ).fetchone()
    assert move is not None  # INSERT ... RETURNING always returns the row
    db.execute(
        "INSERT INTO move_members (move_id, user_id, role) VALUES (%s, %s, 'owner')",
        (move["move_id"], user["user_id"]),
    )
    db.execute(
        "INSERT INTO invitations (move_id, invited_by, code) VALUES (%s, %s, %s)",
        (move["move_id"], user["user_id"], new_invite_code(db)),
    )
    return move


@router.post("/join")
def join_move(
    body: JoinIn,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Join a move with its invite code (e.g. MOVE-4821)."""
    invite = db.execute(
        """
        SELECT move_id FROM invitations
        WHERE code = %s
          AND status = 'pending'
          AND (expires_at IS NULL OR expires_at > now())
          AND (invited_email IS NULL OR invited_email = %s)
        """,
        (body.code.strip().upper(), user["email"]),
    ).fetchone()
    if invite is None:
        raise HTTPException(status_code=404, detail="That invite code isn't valid")

    joined = db.execute(
        """
        INSERT INTO move_members (move_id, user_id, role) VALUES (%s, %s, 'member')
        ON CONFLICT (move_id, user_id) DO NOTHING
        RETURNING move_id
        """,
        (invite["move_id"], user["user_id"]),
    ).fetchone()
    if joined is None:
        raise HTTPException(status_code=409, detail="You're already in this group")
    return {"move_id": invite["move_id"]}


@router.get("/{move_id}")
def get_move(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Move details, its members, and the code for inviting people."""
    role = require_member(move_id, user, db)
    move = db.execute(
        "SELECT move_id, name, destination, target_date FROM moves WHERE move_id = %s",
        (move_id,),
    ).fetchone()
    assert move is not None  # require_member already found the move
    move["my_role"] = role
    move["members"] = db.execute(
        """
        SELECT u.user_id, u.name, u.email, mm.role, mm.move_in_date, mm.split_weight
        FROM move_members mm
        JOIN users u ON u.user_id = mm.user_id
        WHERE mm.move_id = %s
        ORDER BY mm.role = 'owner' DESC, u.name
        """,
        (move_id,),
    ).fetchall()
    # The newest open code that anyone can use (not tied to one email).
    invite = db.execute(
        """
        SELECT code FROM invitations
        WHERE move_id = %s AND invited_email IS NULL AND status = 'pending'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (move_id,),
    ).fetchone()
    move["invite_code"] = invite["code"] if invite else None
    return move


@router.patch("/{move_id}")
def update_move(
    move_id: int,
    body: MoveUpdate,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Edit the move's name, destination, or date. Any member can do this.

    Fields you leave out stay the same. Send null to clear destination or date.
    """
    require_member(move_id, user, db)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("name") is None:
        changes.pop("name", None)  # name can't be cleared
    current = db.execute(
        "SELECT name, destination, target_date FROM moves WHERE move_id = %s", (move_id,)
    ).fetchone()
    assert current is not None  # require_member already found the move
    new = {**current, **changes}
    return db.execute(
        """
        UPDATE moves SET name = %s, destination = %s, target_date = %s
        WHERE move_id = %s
        RETURNING move_id, name, destination, target_date
        """,
        (new["name"].strip(), new["destination"], new["target_date"], move_id),
    ).fetchone()


@router.delete("/{move_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_move(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Delete the whole group and everything in it. Owners only."""
    require_owner(move_id, user, db)
    db.execute("DELETE FROM moves WHERE move_id = %s", (move_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{move_id}/invite-code")
def new_code(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Replace the invite code (the old one stops working). Owners only."""
    require_owner(move_id, user, db)
    db.execute(
        """
        UPDATE invitations SET status = 'expired'
        WHERE move_id = %s AND invited_email IS NULL AND status = 'pending'
        """,
        (move_id,),
    )
    code = new_invite_code(db)
    db.execute(
        "INSERT INTO invitations (move_id, invited_by, code) VALUES (%s, %s, %s)",
        (move_id, user["user_id"], code),
    )
    return {"invite_code": code}


@router.patch("/{move_id}/members/{member_id}")
def update_member(
    move_id: int,
    member_id: int,
    body: MemberUpdate,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Change a member's move-in date or share (split_weight).

    The owner can change anyone's share or move-in date. Members can only
    change their own move-in date. Send null to clear the move-in date.
    """
    require_member(move_id, user, db)
    lock_move(move_id, db)
    my_role = require_member(move_id, user, db)
    target = db.execute(
        "SELECT role, move_in_date, split_weight FROM move_members WHERE move_id = %s AND user_id = %s",
        (move_id, member_id),
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="That person isn't in this group")

    changes = body.model_dump(exclude_unset=True)
    if changes.get("split_weight") is None:
        changes.pop("split_weight", None)

    if my_role != "owner":
        if member_id != user["user_id"] or set(changes) - {"move_in_date"}:
            raise HTTPException(
                status_code=403,
                detail="Only the owner can change shares or other people's details",
            )

    new = {**target, **changes}
    return db.execute(
        """
        UPDATE move_members SET move_in_date = %s, split_weight = %s
        WHERE move_id = %s AND user_id = %s
        RETURNING user_id, role, move_in_date, split_weight
        """,
        (new["move_in_date"], new["split_weight"], move_id, member_id),
    ).fetchone()


@router.post("/{move_id}/members/{member_id}/make-owner")
def transfer_ownership(
    move_id: int,
    member_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Transfer ownership to a current member as one serialized transaction."""
    require_owner(move_id, user, db)
    if member_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Choose another group member")

    target = db.execute(
        "SELECT user_id, role FROM move_members WHERE move_id = %s AND user_id = %s FOR UPDATE",
        (move_id, member_id),
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="That person isn't in this group")
    if target["role"] == "owner":
        raise HTTPException(status_code=409, detail="That person is already the owner")

    owners = db.execute(
        "SELECT user_id FROM move_members WHERE move_id = %s AND role = 'owner' FOR UPDATE",
        (move_id,),
    ).fetchall()
    if len(owners) != 1 or owners[0]["user_id"] != user["user_id"]:
        raise HTTPException(status_code=409, detail="This group must have exactly one owner to transfer ownership")

    demoted = db.execute(
        """
        UPDATE move_members SET role = 'member'
        WHERE move_id = %s AND user_id = %s AND role = 'owner'
        RETURNING user_id
        """,
        (move_id, user["user_id"]),
    ).fetchone()
    promoted = db.execute(
        """
        UPDATE move_members SET role = 'owner'
        WHERE move_id = %s AND user_id = %s AND role = 'member'
        RETURNING user_id
        """,
        (move_id, member_id),
    ).fetchone()
    if demoted is None or promoted is None:
        raise HTTPException(status_code=409, detail="Ownership transfer could not be completed")

    return {
        "move_id": move_id,
        "owner_user_id": promoted["user_id"],
        "previous_owner_user_id": demoted["user_id"],
    }


@router.delete("/{move_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    move_id: int,
    member_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Leave the group (your own user_id) or remove someone (the owner only).

    Their past expenses stay, so the budget's "who owes what" still adds up.
    Items they were getting go back to "Anyone".
    """
    require_member(move_id, user, db)
    lock_move(move_id, db)
    my_role = require_member(move_id, user, db)
    leaving = member_id == user["user_id"]
    if not leaving and my_role != "owner":
        raise HTTPException(status_code=403, detail="Only the group's owner can remove people")

    target = db.execute(
        "SELECT role FROM move_members WHERE move_id = %s AND user_id = %s", (move_id, member_id)
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="That person isn't in this group")

    row = db.execute(
        "SELECT COUNT(*) AS n FROM move_members WHERE move_id = %s", (move_id,)
    ).fetchone()
    assert row is not None  # COUNT(*) always returns a row
    if row["n"] == 1:
        raise HTTPException(
            status_code=400, detail="You're the only member. Delete the group instead."
        )
    if target["role"] == "owner":
        raise HTTPException(
            status_code=400, detail="Transfer ownership before leaving. A group needs exactly one owner."
        )

    db.execute(
        "UPDATE items SET responsible_user_id = NULL WHERE move_id = %s AND responsible_user_id = %s",
        (move_id, member_id),
    )
    db.execute("DELETE FROM move_members WHERE move_id = %s AND user_id = %s", (move_id, member_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
