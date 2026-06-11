import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.config import get_letta_client, get_settings
from backend.letta_lists import collect_sync_page
from backend.schemas import HistoryResponse, SendMessageRequest, serialize
from backend.sse import stream_events

router = APIRouter(prefix="/api/agents", tags=["messages"])

DEFAULT_CONVERSATION_ID = "default"
HISTORY_DEFAULT_LIMIT = 50


def _conv_id(conversation_id: str | None) -> str:
    return conversation_id or DEFAULT_CONVERSATION_ID


def _normalize_input_content(content: str | list) -> str | list:
    """Map Letta history blocks (e.g. source.type=letta) to bridge send schema."""
    if isinstance(content, str):
        return content
    normalized: list[dict] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                normalized.append({"type": "text", "text": text})
            continue
        if block.get("type") == "image":
            src = block.get("source") or {}
            data = src.get("data")
            if not isinstance(data, str) or not data:
                continue
            media_type = src.get("media_type") or "image/png"
            normalized.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": data},
                }
            )
    if len(normalized) == 1 and normalized[0].get("type") == "text":
        return normalized[0]["text"]
    return normalized


def _messages_list_page(client, conv: str, agent_id: str, **kwargs) -> list:
    if conv == DEFAULT_CONVERSATION_ID:
        page = client.conversations.messages.list(
            DEFAULT_CONVERSATION_ID,
            agent_id=agent_id,
            **kwargs,
        )
    else:
        page = client.conversations.messages.list(conv, **kwargs)
    if hasattr(page, "items"):
        return list(page.items)
    return list(page)


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


def _fetch_history_window(
    client,
    conv: str,
    agent_id: str,
    *,
    limit: int,
    before: str | None = None,
) -> tuple[list, bool]:
    """Fetch a recent or older page (newest-first from API; client sorts chronologically)."""
    kwargs: dict = {"order": "desc", "limit": limit + 1}
    if before:
        kwargs["before"] = before
    items = _messages_list_page(client, conv, agent_id, **kwargs)
    has_more = len(items) > limit
    if has_more:
        items = items[:limit]
    return items, has_more


@router.post("/{agent_id}/messages")
def send_message(
    agent_id: str,
    body: SendMessageRequest,
    conversation_id: str | None = Query(None),
):
    settings = get_settings()
    payload = body.model_dump(mode="json")
    payload["content"] = _normalize_input_content(payload["content"])
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


@router.get("/{agent_id}/history", response_model=HistoryResponse)
def get_history(
    agent_id: str,
    conversation_id: str | None = Query(None),
    limit: int = Query(HISTORY_DEFAULT_LIMIT, ge=1, description="Page size for windowed history"),
    before: str | None = Query(None, description="Message ID cursor for loading older rows"),
    full: bool = Query(False, description="Return full history (all pages, ascending)"),
):
    client = get_letta_client()
    conv = _conv_id(conversation_id)
    try:
        if full:
            messages = _list_all_messages(client, conv, agent_id)
            has_more = False
        else:
            messages, has_more = _fetch_history_window(
                client, conv, agent_id, limit=limit, before=before
            )
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return HistoryResponse(
        messages=[serialize(m) for m in messages],
        has_more=has_more,
    )
