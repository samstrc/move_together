"""Moves (shown as "groups" in the app): create, join, view, and edit.

Every endpoint needs a logged-in user. Endpoints for a specific move also
check that the user is a member of it (require_member).
"""

import secrets
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection
from pydantic import BaseModel, Field

from auth import get_current_user, require_member
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
    move_in_date: date | None = None
    split_weight: Decimal | None = Field(default=None, gt=0, max_digits=5, decimal_places=2)
    role: Literal["owner", "member"] | None = None


# Letters and digits that are hard to mix up when read aloud (no 0/O, 1/I/L).
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_invite_code(db: Connection) -> str:
    """A random, unused code like MOVE-7KQ2."""
    while True:
        code = "MOVE-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
        taken = db.execute("SELECT 1 FROM invitations WHERE code = %s", (code,)).fetchone()
        if not taken:
            return code


def require_owner(move_id: int, user: dict, db: Connection) -> None:
    """Raise 403 unless the user is an owner of the move (404 if not a member)."""
    if require_member(move_id, user, db) != "owner":
        raise HTTPException(status_code=403, detail="Only the group's owners can do that")


def count_owners(move_id: int, db: Connection) -> int:
    return db.execute(
        "SELECT COUNT(*) AS n FROM move_members WHERE move_id = %s AND role = 'owner'", (move_id,)
    ).fetchone()["n"]


# ---------- Endpoints ----------

@router.get("")
def list_my_moves(user: dict = Depends(get_current_user), db: Connection = Depends(get_db)):
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
    db: Connection = Depends(get_db),
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
    db: Connection = Depends(get_db),
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
    db: Connection = Depends(get_db),
):
    """Move details, its members, and the code for inviting people."""
    role = require_member(move_id, user, db)
    move = db.execute(
        "SELECT move_id, name, destination, target_date FROM moves WHERE move_id = %s",
        (move_id,),
    ).fetchone()
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
    db: Connection = Depends(get_db),
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
    db: Connection = Depends(get_db),
):
    """Delete the whole group and everything in it. Owners only."""
    require_owner(move_id, user, db)
    db.execute("DELETE FROM moves WHERE move_id = %s", (move_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{move_id}/invite-code")
def new_code(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
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
    db: Connection = Depends(get_db),
):
    """Change a member's move-in date, share (split_weight), or role.

    Owners can change anything for anyone. Members can only change their own
    move-in date. Send null to clear the move-in date.
    """
    my_role = require_member(move_id, user, db)
    target = db.execute(
        "SELECT role, move_in_date, split_weight FROM move_members WHERE move_id = %s AND user_id = %s",
        (move_id, member_id),
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="That person isn't in this group")

    changes = body.model_dump(exclude_unset=True)
    for required in ("split_weight", "role"):  # these can't be cleared
        if changes.get(required) is None:
            changes.pop(required, None)

    if my_role != "owner":
        if member_id != user["user_id"] or set(changes) - {"move_in_date"}:
            raise HTTPException(
                status_code=403,
                detail="Only owners can change shares, roles, or other people's details",
            )
    if changes.get("role") == "member" and target["role"] == "owner" and count_owners(move_id, db) == 1:
        raise HTTPException(status_code=400, detail="A group needs at least one owner")

    new = {**target, **changes}
    return db.execute(
        """
        UPDATE move_members SET role = %s, move_in_date = %s, split_weight = %s
        WHERE move_id = %s AND user_id = %s
        RETURNING user_id, role, move_in_date, split_weight
        """,
        (new["role"], new["move_in_date"], new["split_weight"], move_id, member_id),
    ).fetchone()


@router.delete("/{move_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    move_id: int,
    member_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Leave the group (your own user_id) or remove someone (owners only).

    Their past expenses stay, so the budget's "who owes what" still adds up.
    Items they were getting go back to "Anyone".
    """
    my_role = require_member(move_id, user, db)
    leaving = member_id == user["user_id"]
    if not leaving and my_role != "owner":
        raise HTTPException(status_code=403, detail="Only the group's owners can remove people")

    target = db.execute(
        "SELECT role FROM move_members WHERE move_id = %s AND user_id = %s", (move_id, member_id)
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="That person isn't in this group")

    member_count = db.execute(
        "SELECT COUNT(*) AS n FROM move_members WHERE move_id = %s", (move_id,)
    ).fetchone()["n"]
    if member_count == 1:
        raise HTTPException(
            status_code=400, detail="You're the only member. Delete the group instead."
        )
    if target["role"] == "owner" and count_owners(move_id, db) == 1:
        raise HTTPException(
            status_code=400, detail="Make someone else an owner first. A group needs at least one owner."
        )

    db.execute(
        "UPDATE items SET responsible_user_id = NULL WHERE move_id = %s AND responsible_user_id = %s",
        (move_id, member_id),
    )
    db.execute("DELETE FROM move_members WHERE move_id = %s AND user_id = %s", (move_id, member_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
