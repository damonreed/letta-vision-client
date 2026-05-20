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
