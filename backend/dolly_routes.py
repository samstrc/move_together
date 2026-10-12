"""API endpoint for chatting with Dolly, the AI assistant, about a move.

Dolly's persona and tools live in dolly_agent.py.

Members-only. Dolly's tools work with the database directly through
DollyContext, so they only ever see the move checked here.
"""

from agents import Runner
from fastapi import APIRouter, Depends
from psycopg import Connection
from pydantic import BaseModel, Field

from auth_routes import get_current_user, require_member
from db import get_db
from dolly_agent import DollyContext, agent

router = APIRouter(tags=["assistant"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    reply: str


@router.post("/moves/{move_id}/assistant", response_model=ChatOut)
def chat(
    move_id: int,
    body: ChatIn,
    user: dict = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Send Dolly a message and get its reply.

    Each message is answered on its own for now; earlier messages in the chat
    aren't sent along yet.
    """
    require_member(move_id, user, db)
    context = DollyContext(db=db, move_id=move_id, user=user)
    # run_sync is fine here: FastAPI runs plain `def` endpoints in a worker
    # thread, and it keeps the database calls in Dolly's tools synchronous.
    result = Runner.run_sync(agent, body.message, context=context)
    return ChatOut(reply=result.final_output)
