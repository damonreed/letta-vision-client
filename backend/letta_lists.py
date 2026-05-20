"""Collect all items from Letta SDK paginated list endpoints."""

from typing import Any, TypeVar

T = TypeVar("T")


def collect_sync_page(page: Any) -> list[T]:
    """
    Fetch every page from a SyncArrayPage (or similar).

    The Letta SDK's list methods return pages that implement __iter__ and walk
    forward via cursor (`after`) until exhausted.
    """
    if hasattr(page, "iter_pages"):
        return list(page)
    if hasattr(page, "items"):
        return list(page.items)
    return list(page)
