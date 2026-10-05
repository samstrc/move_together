"""Move Together API (FastAPI).

Run it from this folder with:
    uvicorn main:app --reload

Then open http://localhost:8000/docs to see and test every endpoint.
The database must be running first (`docker compose up -d` from the repo root).
"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import Connection
from psycopg.errors import ForeignKeyViolation

from auth import router as auth_router
from budget import router as budget_router
from db import get_db, pool
from items import router as items_router
from moves import router as moves_router


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
app.include_router(moves_router)
app.include_router(items_router)
app.include_router(budget_router)


@app.exception_handler(ForeignKeyViolation)
def foreign_key_error(request: Request, exc: ForeignKeyViolation):
    """An ID in the request points to nothing (e.g. category_id 999)."""
    return JSONResponse(status_code=400, content={"detail": "Something you picked doesn't exist"})


@app.get("/")
def health_check(db: Connection = Depends(get_db)):
    """Quick way to check the server and database are running."""
    db.execute("SELECT 1")
    return {"status": "ok", "database": "ok"}
