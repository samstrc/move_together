"""Sign up, log in, and "who is making this request?".

How it works:
  1. Sign up / log in returns an access token (a JWT): a signed note saying
     "this is user 3, valid until tomorrow". Only the server can sign one,
     because it needs SECRET_KEY from .env.
  2. The frontend sends that token with every request in a header:
         Authorization: Bearer <token>
  3. Endpoints that need a logged-in user add `Depends(get_current_user)`.

Passwords are never stored. We store an Argon2 hash (pwdlib adds a random
salt to each one), and check login attempts against it.

To try it in /docs: call /auth/login, copy the access_token, click
"Authorize" at the top of the page, and paste it in.
"""

import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import Connection
from psycopg.errors import UniqueViolation
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field

from db import get_db

load_dotenv()

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY == "change-me":
    raise RuntimeError(
        "Set SECRET_KEY in backend/.env to a long random string. "
        "Generate one with: openssl rand -hex 32"
    )

ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=1)

password_hash = PasswordHash.recommended()  # Argon2

# Checked against when the email doesn't exist, so a wrong email takes as
# long as a wrong password and response times don't reveal who has an account.
DUMMY_HASH = password_hash.hash("not-a-real-password")

# auto_error=False so a missing header gets our 401 below instead of FastAPI's default.
bearer_scheme = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------- Request / response shapes ----------

class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    user_id: int
    name: str
    email: str


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Helpers ----------

def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_LIFETIME}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Connection = Depends(get_db),
) -> dict:
    """Dependency: the logged-in user, or a 401 error.

    Use it like:
        def my_endpoint(user = Depends(get_current_user)):
            user["user_id"], user["name"], user["email"]
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not logged in, or your session expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        # Rejects tokens that are expired, tampered with, or signed with another key.
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise unauthorized

    user = db.execute(
        "SELECT user_id, name, email FROM users WHERE user_id = %s", (user_id,)
    ).fetchone()
    if user is None:  # account was deleted after the token was issued
        raise unauthorized
    return user


def require_member(move_id: int, user: dict, db: Connection) -> str:
    """Raise 404 unless the user belongs to the move; otherwise return their
    role ('owner' or 'member').

    404 rather than 403 so outsiders can't tell which move IDs exist.
    """
    row = db.execute(
        "SELECT role FROM move_members WHERE move_id = %s AND user_id = %s",
        (move_id, user["user_id"]),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Move not found")
    return row["role"]


# ---------- Endpoints ----------

@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: Connection = Depends(get_db)):
    """Create an account and log in right away."""
    try:
        user = db.execute(
            """
            INSERT INTO users (name, email, password_hash)
            VALUES (%s, %s, %s)
            RETURNING user_id, name, email
            """,
            (body.name.strip(), body.email.lower(), password_hash.hash(body.password)),
        ).fetchone()
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )
    return {"access_token": create_token(user["user_id"]), "user": user}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Connection = Depends(get_db)):
    """Check email + password and return an access token."""
    row = db.execute(
        "SELECT user_id, name, email, password_hash FROM users WHERE email = %s",
        (body.email.lower(),),
    ).fetchone()

    # Same error either way, so nobody can probe which emails have accounts.
    if row is None:
        password_hash.verify(body.password, DUMMY_HASH)
        valid = False
    else:
        valid = password_hash.verify(body.password, row["password_hash"])
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user = {k: row[k] for k in ("user_id", "name", "email")}
    return {"access_token": create_token(user["user_id"]), "user": user}


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    """The logged-in user. Handy for checking a saved token still works."""
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Change your name and/or email. Leave a field out to keep it."""
    name = body.name.strip() if body.name is not None else user["name"]
    email = body.email.lower() if body.email is not None else user["email"]
    try:
        return db.execute(
            """
            UPDATE users SET name = %s, email = %s
            WHERE user_id = %s
            RETURNING user_id, name, email
            """,
            (name, email, user["user_id"]),
        ).fetchone()
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Change your password. Requires the current one."""
    row = db.execute(
        "SELECT password_hash FROM users WHERE user_id = %s", (user["user_id"],)
    ).fetchone()
    if not password_hash.verify(body.current_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    db.execute(
        "UPDATE users SET password_hash = %s WHERE user_id = %s",
        (password_hash.hash(body.new_password), user["user_id"]),
    )
