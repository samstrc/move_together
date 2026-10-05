"""Move Together API (FastAPI).

Run it from this folder with:
    uvicorn main:app --reload

Then open http://localhost:8000/docs to see and test every endpoint.
The database must be running first (`docker compose up -d` from the repo root).
"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from psycopg import Connection

from auth import get_current_user, require_member
from auth import router as auth_router
from db import get_db, pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open the database connection pool on startup, close it on shutdown."""
    pool.open()
    yield
    pool.close()


app = FastAPI(title="Move Together API", lifespan=lifespan)

# Let the React app (running on localhost:5173) call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/")
def health_check(db: Connection = Depends(get_db)):
    """Quick way to check the server and database are running."""
    db.execute("SELECT 1")
    return {"status": "ok", "database": "ok"}


@app.get("/moves/{move_id}/items")
def list_items(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """The shared item list for one move, newest first. Members only."""
    require_member(move_id, user, db)
    return db.execute(
        """
        SELECT i.item_id,
               i.name,
               c.name  AS category,
               r.name  AS room,
               i.quantity,
               i.est_cost,
               i.status,
               ru.name AS responsible,
               au.name AS added_by
        FROM items i
        LEFT JOIN categories c  ON c.category_id = i.category_id
        LEFT JOIN rooms r       ON r.room_id     = i.room_id
        LEFT JOIN users ru      ON ru.user_id    = i.responsible_user_id
        LEFT JOIN users au      ON au.user_id    = i.added_by
        WHERE i.move_id = %s
        ORDER BY i.created_at DESC, i.item_id DESC
        """,
        (move_id,),
    ).fetchall()
