"""Unit tests for SSE stream delta coalescing."""

import json
import unittest

from backend.sse import StreamCoalescer, stream_events


def _parse_sse(raw: str) -> dict:
    line = raw.strip().split("\n")[0]
    return json.loads(line.removeprefix("data: "))


class StreamCoalescerTests(unittest.TestCase):
    def test_coalesces_tool_call_argument_deltas(self):
        coalescer = StreamCoalescer()
        tid = "call-abc"
        chunks = [
            {
                "message_type": "tool_call_message",
                "id": "m1",
                "tool_call": {"tool_call_id": tid, "name": "memory", "arguments": '{"label"'},
            },
            {
                "message_type": "tool_call_message",
                "id": "m2",
                "tool_call": {"tool_call_id": tid, "arguments": ': "human", "value": "x"}'},
            },
            {"message_type": "stop_reason", "stop_reason": "end_turn"},
        ]
        events = []
        for chunk in chunks:
            events.extend(coalescer.push(chunk))
        events.extend(coalescer.finish())

        tool_events = [e for e in events if _parse_sse(e)["type"] == "tool_call"]
        self.assertEqual(len(tool_events), 1)
        tc = _parse_sse(tool_events[0])["tool_call"]
        self.assertEqual(tc["tool_call_id"], tid)
        self.assertEqual(tc["name"], "memory")
        self.assertEqual(tc["arguments"], '{"label": "human", "value": "x"}')

    def test_coalesces_reasoning_deltas(self):
        coalescer = StreamCoalescer()
        rid = "reason-1"
        chunks = [
            {
                "message_type": "reasoning_message",
                "id": rid,
                "reasoning": "The user ",
            },
            {
                "message_type": "reasoning_message",
                "id": rid,
                "reasoning": "wants help.",
            },
            {
                "message_type": "assistant_message",
                "id": "a1",
                "content": "Sure.",
            },
        ]
        events = []
        for chunk in chunks:
            events.extend(coalescer.push(chunk))
        events.extend(coalescer.finish())

        reasoning = [e for e in events if _parse_sse(e)["type"] == "reasoning"]
        self.assertEqual(len(reasoning), 1)
        self.assertEqual(_parse_sse(reasoning[0])["reasoning"], "The user wants help.")

    def test_summary_message_maps_to_assistant_sse(self):
        events = list(
            stream_events(
                iter(
                    [
                        {
                            "message_type": "summary_message",
                            "id": "s1",
                            "summary": "Provider failed after 3 attempts.",
                        }
                    ]
                )
            )
        )
        msg_events = [e for e in events if _parse_sse(e)["type"] == "message"]
        self.assertEqual(len(msg_events), 1)
        parsed = _parse_sse(msg_events[0])
        self.assertEqual(parsed["content"], "Provider failed after 3 attempts.")
        self.assertEqual(parsed["message_type"], "assistant_message")

    def test_stream_events_maps_client_error_to_sse(self):
        class FakeStreamError(Exception):
            def __init__(self):
                super().__init__("Upstream idle timeout exceeded")
                self.body = {
                    "message_type": "error_message",
                    "message": "An error occurred during agent execution.",
                    "detail": "INVALID_ARGUMENT: OpenAI API error: Upstream idle timeout exceeded",
                    "error_type": "llm_api_error",
                    "run_id": "run-123",
                }

        def _chunks():
            yield {"message_type": "assistant_message", "id": "a1", "content": "Hi"}
            raise FakeStreamError()

        events = list(stream_events(_chunks()))
        err_events = [e for e in events if _parse_sse(e)["type"] == "error"]
        self.assertEqual(len(err_events), 1)
        payload = _parse_sse(err_events[0])
        self.assertIn("timed out", payload["message"].lower())
        self.assertTrue(payload.get("detail"))

    def test_stream_events_maps_openrouter_sse_json_error(self):
        class FakeStreamError(Exception):
            def __init__(self):
                super().__init__("JSON error injected into SSE stream")
                self.body = {
                    "message_type": "error_message",
                    "message": "INVALID_ARGUMENT: OpenAI API error: JSON error injected into SSE stream",
                    "detail": "INVALID_ARGUMENT: OpenAI API error: JSON error injected into SSE stream",
                    "error_type": "llm_api_error",
                    "run_id": "run-456",
                }

        class ErrIter:
            def __iter__(self):
                yield {"message_type": "assistant_message", "id": "a1", "content": "x"}
                raise FakeStreamError()

        events = list(stream_events(ErrIter()))
        err = _parse_sse([e for e in events if _parse_sse(e)["type"] == "error"][0])
        self.assertIn("broken streaming response", err["message"])
        self.assertNotEqual(err.get("message"), err.get("detail"))

    def test_stream_events_wrapper(self):
        chunks = [
            {
                "message_type": "tool_call_message",
                "id": "m1",
                "tool_call": {"tool_call_id": "c1", "name": "t", "arguments": "ab"},
            },
            {
                "message_type": "tool_call_message",
                "id": "m2",
                "tool_call": {"tool_call_id": "c1", "arguments": "cd"},
            },
        ]
        events = list(stream_events(iter(chunks)))
        tool_events = [e for e in events if _parse_sse(e)["type"] == "tool_call"]
        self.assertEqual(len(tool_events), 1)
        self.assertEqual(_parse_sse(tool_events[0])["tool_call"]["arguments"], "abcd")


if __name__ == "__main__":
    unittest.main()
