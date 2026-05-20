import json
from typing import Any, Iterator


def sse_event(event_type: str, data: dict[str, Any]) -> str:
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


def _dump_chunk(chunk: Any) -> dict[str, Any]:
    if hasattr(chunk, "model_dump"):
        return chunk.model_dump(mode="json")
    if isinstance(chunk, dict):
        return chunk
    return {}


def _map_terminal_chunk(dumped: dict[str, Any]) -> str | None:
    """Map non-delta stream chunks to bridge SSE events."""
    message_type = dumped.get("message_type")

    if message_type == "assistant_message":
        return sse_event("message", dumped)
    if message_type == "tool_return_message":
        return sse_event("tool_result", dumped)
    if message_type == "stop_reason":
        return sse_event("done", dumped)
    if message_type == "error_message":
        return sse_event("error", dumped)
    if message_type in ("ping", "usage_statistics", "user_message", "system_message"):
        return None
    if message_type in ("approval_request_message", "approval_response_message"):
        return sse_event("message", dumped)
    if message_type:
        return sse_event("message", dumped)
    return None


def _reasoning_text(dumped: dict[str, Any]) -> str:
    return dumped.get("reasoning") or dumped.get("hidden_reasoning") or ""


def _tool_call_key(dumped: dict[str, Any]) -> str | None:
    tc = dumped.get("tool_call") or {}
    if isinstance(tc, dict) and tc.get("tool_call_id"):
        return tc["tool_call_id"]
    return dumped.get("id")


class StreamCoalescer:
    """Accumulate streaming tool_call and reasoning deltas before emitting SSE."""

    def __init__(self) -> None:
        self._tool_calls: dict[str, dict[str, Any]] = {}
        self._active_tool_id: str | None = None
        self._reasoning: dict[str, dict[str, Any]] = {}
        self._active_reasoning_id: str | None = None

    def push(self, chunk: Any) -> list[str]:
        dumped = _dump_chunk(chunk)
        message_type = dumped.get("message_type")
        out: list[str] = []

        if message_type == "tool_call_message":
            out.extend(self._flush_reasoning())
            key = _tool_call_key(dumped)
            if not key:
                out.append(sse_event("tool_call", dumped))
                return out

            tc = dumped.get("tool_call") or {}
            if self._active_tool_id and self._active_tool_id != key:
                out.extend(self._flush_tool_call(self._active_tool_id))

            acc = self._tool_calls.setdefault(
                key,
                {"base": dumped, "name": None, "arguments": ""},
            )
            acc["base"] = dumped
            if isinstance(tc, dict):
                if tc.get("name"):
                    acc["name"] = tc["name"]
                if tc.get("arguments"):
                    acc["arguments"] += tc["arguments"]
            self._active_tool_id = key
            return out

        if message_type in ("reasoning_message", "hidden_reasoning_message"):
            out.extend(self._flush_tool_calls())
            msg_id = dumped.get("id")
            if not msg_id:
                out.append(sse_event("reasoning", dumped))
                return out

            fragment = _reasoning_text(dumped)
            if self._active_reasoning_id and self._active_reasoning_id != msg_id:
                out.extend(self._flush_reasoning(self._active_reasoning_id))

            acc = self._reasoning.setdefault(
                msg_id,
                {"base": dumped, "text": "", "message_type": message_type},
            )
            acc["base"] = dumped
            acc["message_type"] = message_type
            acc["text"] += fragment
            self._active_reasoning_id = msg_id
            return out

        out.extend(self._flush_all())
        mapped = _map_terminal_chunk(dumped)
        if mapped:
            out.append(mapped)
        return out

    def finish(self) -> list[str]:
        return self._flush_all()

    def _flush_all(self) -> list[str]:
        out: list[str] = []
        out.extend(self._flush_tool_calls())
        out.extend(self._flush_reasoning())
        return out

    def _flush_tool_calls(self) -> list[str]:
        out: list[str] = []
        if self._active_tool_id:
            out.extend(self._flush_tool_call(self._active_tool_id))
        return out

    def _flush_tool_call(self, tool_call_id: str) -> list[str]:
        acc = self._tool_calls.pop(tool_call_id, None)
        if self._active_tool_id == tool_call_id:
            self._active_tool_id = None
        if not acc:
            return []

        base = dict(acc["base"])
        base["message_type"] = "tool_call_message"
        base["tool_call"] = {
            "tool_call_id": tool_call_id,
            "name": acc.get("name") or "",
            "arguments": acc.get("arguments") or "",
        }
        return [sse_event("tool_call", base)]

    def _flush_reasoning(self, reasoning_id: str | None = None) -> list[str]:
        if reasoning_id is None:
            if not self._active_reasoning_id:
                return []
            reasoning_id = self._active_reasoning_id

        acc = self._reasoning.pop(reasoning_id, None)
        if self._active_reasoning_id == reasoning_id:
            self._active_reasoning_id = None
        if not acc or not acc.get("text"):
            return []

        base = dict(acc["base"])
        base["message_type"] = acc.get("message_type") or "reasoning_message"
        if base["message_type"] == "hidden_reasoning_message":
            base["hidden_reasoning"] = acc["text"]
        else:
            base["reasoning"] = acc["text"]
        return [sse_event("reasoning", base)]


def stream_events(chunks: Iterator[Any]) -> Iterator[str]:
    coalescer = StreamCoalescer()
    for chunk in chunks:
        for event in coalescer.push(chunk):
            yield event
    for event in coalescer.finish():
        yield event
