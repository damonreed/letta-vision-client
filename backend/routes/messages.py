import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.config import get_letta_client, get_settings
from backend.letta_lists import collect_sync_page
from backend.schemas import SendMessageRequest, serialize
from backend.sse import stream_events

router = APIRouter(prefix="/api/agents", tags=["messages"])

DEFAULT_CONVERSATION_ID = "default"


def _conv_id(conversation_id: str | None) -> str:
    return conversation_id or DEFAULT_CONVERSATION_ID


def _list_all_messages(client, conv: str, agent_id: str) -> list:
    """Return full conversation history (all pages, chronological)."""
    if conv == DEFAULT_CONVERSATION_ID:
        page = client.conversations.messages.list(
            DEFAULT_CONVERSATION_ID,
            agent_id=agent_id,
            order="asc",
        )
    else:
        page = client.conversations.messages.list(conv, order="asc")
    return collect_sync_page(page)


@router.post("/{agent_id}/messages")
def send_message(
    agent_id: str,
    body: SendMessageRequest,
    conversation_id: str | None = Query(None),
):
    settings = get_settings()
    payload = body.model_dump(mode="json")
    body_size = len(json.dumps(payload).encode("utf-8"))
    if body_size > settings.vision_max_request_bytes:
        raise HTTPException(
            status_code=413,
            detail={"error": f"Request body exceeds maximum size of {settings.vision_max_request_bytes} bytes."},
        )

    client = get_letta_client()
    conv = _conv_id(conversation_id)
    try:
        kwargs = {
            "streaming": True,
            "input": payload["content"],
            "include_pings": True,
            "stream_tokens": True,
        }
        if conv == DEFAULT_CONVERSATION_ID:
            stream = client.conversations.messages.create(
                DEFAULT_CONVERSATION_ID,
                agent_id=agent_id,
                **kwargs,
            )
        else:
            stream = client.conversations.messages.create(conv, **kwargs)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e

    return StreamingResponse(
        stream_events(stream),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{agent_id}/history")
def get_history(
    agent_id: str,
    conversation_id: str | None = Query(None),
):
    client = get_letta_client()
    conv = _conv_id(conversation_id)
    try:
        messages = _list_all_messages(client, conv, agent_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return [serialize(m) for m in messages]
