"""Tests for windowed chat history helper."""

from unittest.mock import MagicMock

from backend.routes.messages import _fetch_history_window


def test_fetch_history_window_has_more_when_extra_row():
    client = MagicMock()
    page = MagicMock()
    page.items = [f"msg-{i}" for i in range(4)]
    client.conversations.messages.list.return_value = page

    items, has_more = _fetch_history_window(
        client, "conv-1", "agent-1", limit=3
    )

    assert has_more is True
    assert len(items) == 3
    client.conversations.messages.list.assert_called_once_with(
        "conv-1", order="desc", limit=4
    )


def test_fetch_history_window_passes_before_cursor():
    client = MagicMock()
    page = MagicMock()
    page.items = ["msg-a"]
    client.conversations.messages.list.return_value = page

    items, has_more = _fetch_history_window(
        client,
        "default",
        "agent-1",
        limit=50,
        before="message-old",
    )

    assert items == ["msg-a"]
    assert has_more is False
    client.conversations.messages.list.assert_called_once_with(
        "default",
        agent_id="agent-1",
        order="desc",
        limit=51,
        before="message-old",
    )
