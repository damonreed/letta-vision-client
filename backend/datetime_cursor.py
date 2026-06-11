"""Helpers for image-list cursor datetimes in query strings."""

from __future__ import annotations

import re

_ISO_OFFSET_SPACE_RE = re.compile(r"^(?P<head>.+T\d{2}:\d{2}:\d{2}(?:\.\d+)?) (?P<tz>\d{2}:\d{2})$")


def repair_iso_datetime_query_cursor(value: str) -> str:
    """Repair UTC offsets where '+' was decoded as a space in a query string."""
    text = value.strip()
    match = _ISO_OFFSET_SPACE_RE.match(text)
    if match:
        return f"{match.group('head')}+{match.group('tz')}"
    return text
