"""Tests for pagination helper."""

from unittest.mock import MagicMock

from backend.letta_lists import collect_sync_page


def test_collect_sync_page_uses_iter():
    class FakePage:
        def __iter__(self):
            yield from ["a", "b", "c"]

        def iter_pages(self):
            return iter([self])

    assert collect_sync_page(FakePage()) == ["a", "b", "c"]


def test_collect_sync_page_items_fallback():
    page = MagicMock(spec=["items"])
    page.items = ["x", "y"]
    assert collect_sync_page(page) == ["x", "y"]
