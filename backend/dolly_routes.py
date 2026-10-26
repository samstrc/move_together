"""API endpoints for chatting with Dolly, the AI assistant, about a move.

Dolly's persona and tools live in dolly_agent.py.

Members-only. Each chat is a row in ai_conversations and its messages are rows
in ai_messages. A chat belongs to the member who started it, so other members
can't see it. Dolly's tools work with the database directly through
DollyContext, so they only ever see the move checked here.
"""

from agents import Runner, TResponseInputItem
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection
from psycopg.rows import DictRow
from pydantic import BaseModel, Field

from auth_routes import get_current_user, require_member
from db import get_db
from dolly_agent import DollyContext, agent

router = APIRouter(tags=["assistant"])

# How many earlier messages are sent to the model along with the new one.
# Longer chats would get slow and expensive otherwise.
HISTORY_LIMIT = 20


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    reply: str


def get_conversation(move_id: int, conversation_id: int, user: dict, db: Connection[DictRow]) -> dict:
    """Return the conversation, or 404 if it isn't this user's chat in this move."""
    conversation = db.execute(
        """
        SELECT conversation_id, title, created_at
        FROM ai_conversations
        WHERE conversation_id = %s AND move_id = %s AND started_by = %s
        """,
        (conversation_id, move_id, user["user_id"]),
    ).fetchone()
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


@router.get("/moves/{move_id}/assistant/conversations")
def list_conversations(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Your chats with Dolly in this move, newest first."""
    require_member(move_id, user, db)
    return db.execute(
        """
        SELECT conversation_id, title, created_at
        FROM ai_conversations
        WHERE move_id = %s AND started_by = %s
        ORDER BY created_at DESC, conversation_id DESC
        """,
        (move_id, user["user_id"]),
    ).fetchall()


@router.post("/moves/{move_id}/assistant/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Start a new, empty chat. Its title is set from the first message."""
    require_member(move_id, user, db)
    return db.execute(
        """
        INSERT INTO ai_conversations (move_id, started_by)
        VALUES (%s, %s)
        RETURNING conversation_id, title, created_at
        """,
        (move_id, user["user_id"]),
    ).fetchone()


@router.get("/moves/{move_id}/assistant/conversations/{conversation_id}/messages")
def list_messages(
    move_id: int,
    conversation_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Every message in a chat, oldest first. Tool actions are left out."""
    require_member(move_id, user, db)
    get_conversation(move_id, conversation_id, user, db)
    return db.execute(
        """
        SELECT message_id, role, content, created_at
        FROM ai_messages
        WHERE conversation_id = %s AND role IN ('user', 'assistant')
        ORDER BY created_at, message_id
        """,
        (conversation_id,),
    ).fetchall()


@router.post(
    "/moves/{move_id}/assistant/conversations/{conversation_id}/messages",
    response_model=ChatOut,
)
def send_message(
    move_id: int,
    conversation_id: int,
    body: ChatIn,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db),
):
    """Send Dolly a message and get her reply. Both are saved to the chat.

    If Dolly fails, the whole request rolls back, so the chat never keeps a
    question without an answer.
    """
    require_member(move_id, user, db)
    get_conversation(move_id, conversation_id, user, db)

    # The newest HISTORY_LIMIT messages, flipped back to oldest first. Tool rows
    # are left out: they aren't chat messages.
    rows = db.execute(
        """
        SELECT role, content FROM (
            SELECT role, content, created_at, message_id
            FROM ai_messages
            WHERE conversation_id = %s AND role IN ('user', 'assistant')
            ORDER BY created_at DESC, message_id DESC
            LIMIT %s
        ) recent
        ORDER BY created_at, message_id
        """,
        (conversation_id, HISTORY_LIMIT),
    ).fetchall()
    # The Agents SDK takes messages as {"role": ..., "content": ...}.
    messages: list[TResponseInputItem] = [
        {"role": row["role"], "content": row["content"]} for row in rows
    ]
    messages.append({"role": "user", "content": body.message})

    db.execute(
        "INSERT INTO ai_messages (conversation_id, role, content) VALUES (%s, 'user', %s)",
        (conversation_id, body.message),
    )

    context = DollyContext(db=db, move_id=move_id, user=user)
    # run_sync is fine here: FastAPI runs plain `def` endpoints in a worker
    # thread, and it keeps the database calls in Dolly's tools synchronous.
    result = Runner.run_sync(agent, messages, context=context)
    reply = result.final_output

    db.execute(
        "INSERT INTO ai_messages (conversation_id, role, content) VALUES (%s, 'assistant', %s)",
        (conversation_id, reply),
    )
    db.execute(
        "UPDATE ai_conversations SET title = %s WHERE conversation_id = %s AND title IS NULL",
        (body.message[:150], conversation_id),
    )
    return ChatOut(reply=reply)
