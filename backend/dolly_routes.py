"""API endpoints for chatting with Dolly, the AI assistant, about a move.

Dolly's persona and tools live in dolly_agent.py.

Members-only. Each chat is a row in ai_conversations and its messages are rows
in ai_messages. A chat belongs to the member who started it, so other members
can't see it. Dolly's tools work with the database directly through
DollyContext, so they only ever see the move checked here.

Each tool Dolly uses is saved as a 'tool' message (tool_name, tool_input). If
the tool made a card (a product, a list change), the card is saved as JSON in
that message's content, so the chat can show it again later.
"""

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator

import anyio
from agents import (ItemHelpers, MessageOutputItem, Runner, RunResultStreaming, ToolCallItem,
                    TResponseInputItem)
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai.types.responses import ResponseOutputItemAddedEvent, ResponseTextDeltaEvent
from psycopg import Connection
from psycopg.rows import DictRow
from pydantic import BaseModel, Field

from auth_routes import get_current_user, require_member
from db import get_db, pool
from dolly_agent import DollyContext, agent

router = APIRouter(tags=["assistant"])
log = logging.getLogger("uvicorn.error")

# Web search adds source links like "([target.com](https://...))" to replies.
# The chat shows plain text and the cards have the links, so drop them.
CITATION = re.compile(r"\s*\(\[[^\]]*\]\([^)]*\)\)")
MARKDOWN_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def clean_reply(text: str) -> str:
    return MARKDOWN_LINK.sub(r"\1", CITATION.sub("", text)).strip()

# How many earlier messages are sent to the model along with the new one.
# Longer chats would get slow and expensive otherwise.
HISTORY_LIMIT = 20


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


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
    db: Connection[DictRow] = Depends(get_db, scope="function"),
):
    """Your chats with Dolly in this move, most recently used first."""
    require_member(move_id, user, db)
    return db.execute(
        """
        SELECT c.conversation_id, c.title, c.created_at,
               COALESCE(MAX(m.created_at), c.created_at) AS last_used
        FROM ai_conversations c
        LEFT JOIN ai_messages m ON m.conversation_id = c.conversation_id
        WHERE c.move_id = %s AND c.started_by = %s
        GROUP BY c.conversation_id
        ORDER BY last_used DESC, c.conversation_id DESC
        """,
        (move_id, user["user_id"]),
    ).fetchall()


@router.post("/moves/{move_id}/assistant/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(
    move_id: int,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db, scope="function"),
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
    db: Connection[DictRow] = Depends(get_db, scope="function"),
):
    """Every message in a chat, oldest first. Tool actions are left out,
    except the cards they made, which come back as {"role": "tool", "card": {...}}.
    """
    require_member(move_id, user, db)
    get_conversation(move_id, conversation_id, user, db)
    rows = db.execute(
        """
        SELECT message_id, role, content, created_at
        FROM ai_messages
        WHERE conversation_id = %s
          AND (role IN ('user', 'assistant') OR (role = 'tool' AND content IS NOT NULL))
        ORDER BY created_at, message_id
        """,
        (conversation_id,),
    ).fetchall()
    for row in rows:
        if row["role"] == "tool":
            row["card"] = json.loads(row.pop("content"))
    return rows


def save_tool_calls(db: Connection[DictRow], conversation_id: int, items: list, cards: dict) -> list[dict]:
    """Save each tool Dolly used as a 'tool' message, with its card if it made
    one. Returns the cards in the order they were made.
    """
    shown = []
    for item in items:
        if not isinstance(item, ToolCallItem):
            continue
        raw = item.raw_item
        kind = getattr(raw, "type", None)
        if kind == "function_call":
            name, call_id = raw.name, raw.call_id
            try:
                tool_input = json.loads(raw.arguments or "{}")
            except ValueError:
                tool_input = {"arguments": raw.arguments}
        elif kind == "web_search_call":
            name, call_id = "web_search", None
            tool_input = {"query": getattr(getattr(raw, "action", None), "query", None)}
        else:
            continue
        card = cards.get(call_id) if call_id else None
        db.execute(
            """
            INSERT INTO ai_messages (conversation_id, role, content, tool_name, tool_input)
            VALUES (%s, 'tool', %s, %s, %s)
            """,
            (conversation_id, json.dumps(card, default=str) if card else None, name,
             json.dumps(tool_input, default=str)),
        )
        if card:
            shown.append(card)
    return shown


# What the chat shows while Dolly uses each tool.
TOOL_STATUS = {
    "web_search": "Searching the web",
    "get_list": "Checking your list",
    "get_budget": "Checking the budget",
    "get_expenses": "Looking at expenses",
    "get_product_options": "Looking at saved products",
    "suggest_item": "Writing up a suggestion",
    "update_item": "Updating the list",
    "remove_item": "Updating the list",
    "save_product": "Saving the product",
}


def event(data: dict) -> str:
    """One Server-Sent Event: a "data: <json>" line and a blank line."""
    return f"data: {json.dumps(data, default=str)}\n\n"


def card_note(card: dict) -> str:
    """A short note about a card, added to Dolly's earlier reply in her
    history so she remembers it (and its IDs) in later messages."""
    if card["type"] == "product":
        what = (f"an option for item_id {card['item_id']} ({card['item_name']})" if card.get("item_id")
                else f"for {card['item_name']}, not on the list yet")
        return (f"[Card: product_id {card['product_id']}, {card['title']}, ${card['price']} at "
                f"{card['retailer']}, {what}]")
    if card["type"] == "suggested_item":
        return f"[Card: suggested {card['item']['name']} for the list]"
    if card["type"] == "item":
        return f"[Card: {card['action']} item_id {card['item']['item_id']}, {card['item']['name']}]"
    return ""


def start_turn(db: Connection[DictRow], conversation_id: int, message: str) -> list[TResponseInputItem]:
    """Save the user's message and return what to send Dolly: the newest
    HISTORY_LIMIT messages, oldest first, then the new one.

    Tool rows aren't chat messages, so they're left out, but the cards they
    made are added to Dolly's reply as notes (see card_note): without them,
    "add that one to the list" wouldn't know which product "that one" is.
    """
    rows = db.execute(
        """
        SELECT role, content, message_id FROM (
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
    cards = db.execute(
        """
        SELECT message_id, content FROM ai_messages
        WHERE conversation_id = %s AND role = 'tool' AND content IS NOT NULL AND message_id > %s
        ORDER BY message_id
        """,
        (conversation_id, rows[0]["message_id"] if rows else 0),
    ).fetchall()
    db.execute(
        "INSERT INTO ai_messages (conversation_id, role, content) VALUES (%s, 'user', %s)",
        (conversation_id, message),
    )
    # The Agents SDK takes messages as {"role": ..., "content": ...}. Each
    # card goes on the last reply before it (cards are saved after replies).
    messages: list[TResponseInputItem] = []
    contents: list[str] = []
    for row in rows:
        notes = [card_note(json.loads(c["content"])) for c in cards
                 if row["role"] == "assistant" and c["message_id"] > row["message_id"]
                 and not any(r["message_id"] > row["message_id"] and r["message_id"] < c["message_id"]
                             for r in rows)]
        contents.append("\n".join([row["content"] or "", *filter(None, notes)]))
        messages.append({"role": row["role"], "content": contents[-1]})
    messages.append({"role": "user", "content": message})
    return messages


def finish_turn(db: Connection[DictRow], conversation_id: int, message: str,
                reply: str, result: RunResultStreaming, context: DollyContext) -> list[dict]:
    """Save Dolly's reply and the tools she used, then commit the whole turn.
    Returns the cards to show under the reply.
    """
    db.execute(
        "INSERT INTO ai_messages (conversation_id, role, content) VALUES (%s, 'assistant', %s)",
        (conversation_id, reply),
    )
    # After the reply, so the cards show up under it.
    cards = save_tool_calls(db, conversation_id, result.new_items, context.cards)
    db.execute(
        "UPDATE ai_conversations SET title = %s WHERE conversation_id = %s AND title IS NULL",
        (message[:150], conversation_id),
    )
    db.commit()
    return cards


async def stream_reply(move_id: int, conversation_id: int, user: dict, message: str) -> AsyncIterator[str]:
    """Run Dolly and yield her reply as Server-Sent Events while she writes it:

        {"type": "status", "text": "Searching the web"}   she's using a tool
        {"type": "delta", "text": "Found "}                more of her reply
        {"type": "done", "reply": "...", "cards": [...]}   finished and saved
        {"type": "error", "message": "..."}                failed; nothing saved

    Uses its own connection rather than get_db, because the request's
    dependencies can finish before a streamed response does. The whole turn
    is committed at the end, so a failure (or the user leaving) saves nothing:
    the chat never keeps a question without an answer.

    This runs on the server's event loop, so the (synchronous) database work
    goes to worker threads with asyncio.to_thread, like the SDK does for
    Dolly's tools, and other requests aren't held up meanwhile.
    """
    db = await asyncio.to_thread(pool.getconn)
    try:
        messages = await asyncio.to_thread(start_turn, db, conversation_id, message)
        context = DollyContext(db=db, move_id=move_id, user=user)
        result = Runner.run_streamed(agent, messages, context=context, max_turns=20)
        wrote_text = False
        try:
            async for item in result.stream_events():
                if item.type != "raw_response_event":
                    continue
                if isinstance(item.data, ResponseTextDeltaEvent):
                    wrote_text = True
                    yield event({"type": "delta", "text": item.data.delta})
                # The model started a tool call (sent before the tool runs, so
                # the status shows while it's working).
                elif isinstance(item.data, ResponseOutputItemAddedEvent):
                    output = item.data.item
                    # A new piece of text after earlier text (e.g. "Let me
                    # check." -> tool -> answer): start it on a new paragraph.
                    if output.type == "message" and wrote_text:
                        yield event({"type": "delta", "text": "\n\n"})
                    elif output.type == "web_search_call":
                        yield event({"type": "status", "text": TOOL_STATUS["web_search"]})
                    elif output.type == "function_call":
                        yield event({"type": "status", "text": TOOL_STATUS.get(output.name, "Working")})
        finally:
            result.cancel()  # stops Dolly if the user left mid-reply
        # Everything she wrote, not just the last piece (final_output), so the
        # saved reply matches what streamed in.
        reply = clean_reply("\n\n".join(
            ItemHelpers.text_message_output(i) for i in result.new_items if isinstance(i, MessageOutputItem)
        ))
        cards = await asyncio.to_thread(finish_turn, db, conversation_id, message, reply, result, context)
        yield event({"type": "done", "reply": reply, "cards": cards})
    except Exception:
        log.exception("Dolly failed")
        yield event({"type": "error", "message": "Dolly couldn't answer right now. Try again."})
    finally:
        # Undo anything not committed (a failure, or the user leaving) and
        # give the connection back. Shielded: when the user leaves, the server
        # cancels this request, and without the shield the cancel would also
        # stop this cleanup, leaving the connection checked out for good.
        with anyio.CancelScope(shield=True):
            await asyncio.to_thread(db.rollback)
            await asyncio.to_thread(pool.putconn, db)


@router.post("/moves/{move_id}/assistant/conversations/{conversation_id}/messages")
def send_message(
    move_id: int,
    conversation_id: int,
    body: ChatIn,
    user: dict = Depends(get_current_user),
    db: Connection[DictRow] = Depends(get_db, scope="function"),
):
    """Send Dolly a message. Her reply streams back as Server-Sent Events
    (see stream_reply), and both are saved to the chat once she's done.

    A plain `def`, so the login and membership checks (synchronous database
    calls) run in a worker thread. The streaming itself runs on the event loop.
    """
    require_member(move_id, user, db)
    get_conversation(move_id, conversation_id, user, db)
    return StreamingResponse(
        stream_reply(move_id, conversation_id, user, body.message),
        media_type="text/event-stream",
        # Don't let anything in between hold the events back.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
