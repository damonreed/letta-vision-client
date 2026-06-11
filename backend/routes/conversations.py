from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.context_refresh import recompile_conversation
from backend.letta_lists import collect_sync_page
from backend.schemas import (
    ConversationSummary,
    CreateConversationRequest,
    UpdateConversationRequest,
    serialize,
)

router = APIRouter(prefix="/api", tags=["conversations"])

DEFAULT_CONVERSATION_ID = "default"


def _to_summary(conv, *, is_default: bool = False) -> ConversationSummary:
    data = serialize(conv)
    conv_id = DEFAULT_CONVERSATION_ID if is_default else data.get("id", "")
    agent_id = data.get("agent_id", "")
    name = data.get("summary") or None
    last_at = data.get("last_message_at")
    if isinstance(last_at, datetime):
        last_at = last_at.isoformat()
    return ConversationSummary(
        id=conv_id,
        agent_id=agent_id,
        name=name,
        is_default=is_default,
        last_message_at=last_at,
        last_message_preview=None,
        created_at=(
            data.get("created_at").isoformat()
            if isinstance(data.get("created_at"), datetime)
            else data.get("created_at")
        ),
    )


def _default_summary(agent_id: str) -> ConversationSummary:
    return ConversationSummary(
        id=DEFAULT_CONVERSATION_ID,
        agent_id=agent_id,
        name="Default conversation",
        is_default=True,
        last_message_at=None,
        last_message_preview=None,
        created_at=None,
    )


@router.get("/agents/{agent_id}/conversations")
def list_conversations(agent_id: str):
    client = get_letta_client()
    try:
        items = collect_sync_page(
            client.conversations.list(
                agent_id=agent_id,
                order="desc",
                order_by="last_message_at",
            )
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e

    return [_to_summary(conv) for conv in items]


@router.post("/agents/{agent_id}/conversations")
def create_conversation(agent_id: str, body: CreateConversationRequest):
    client = get_letta_client()
    name = (body.name or "").strip()
    if not name:
        name = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    try:
        conv = client.conversations.create(agent_id=agent_id, summary=name)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return _to_summary(conv)


@router.patch("/conversations/{conversation_id}")
def update_conversation(conversation_id: str, body: UpdateConversationRequest):
    if conversation_id == DEFAULT_CONVERSATION_ID:
        raise HTTPException(
            status_code=400,
            detail={"error": "Cannot rename the default conversation"},
        )
    client = get_letta_client()
    try:
        conv = client.conversations.update(
            conversation_id, summary=body.name.strip()
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return _to_summary(conv)


@router.post("/agents/{agent_id}/conversations/{conversation_id}/recompile-context")
def recompile_conversation_context(agent_id: str, conversation_id: str):
    """Recompile this conversation's system message (directories, file cores, blocks)."""
    client = get_letta_client()
    try:
        content = recompile_conversation(client, conversation_id, agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"content": content}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    if conversation_id == DEFAULT_CONVERSATION_ID:
        raise HTTPException(
            status_code=400,
            detail={"error": "Cannot delete the default conversation"},
        )
    client = get_letta_client()
    try:
        client.conversations.delete(conversation_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return {"ok": True}
