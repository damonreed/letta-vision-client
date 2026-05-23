"""Persist per-handle model capability overrides (vision) for the local UI."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

DEFAULT_PATH = Path(
    os.environ.get("MODEL_OVERRIDES_PATH", "/data/shared/model_overrides.json")
)


def _path() -> Path:
    return DEFAULT_PATH


def _load_raw() -> dict[str, Any]:
    path = _path()
    if not path.exists():
        return {"vision": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"vision": {}}
    if not isinstance(data, dict):
        return {"vision": {}}
    vision = data.get("vision")
    if not isinstance(vision, dict):
        data["vision"] = {}
    return data


def _save_raw(data: dict[str, Any]) -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def get_vision_override(handle: str | None) -> bool | None:
    if not handle:
        return None
    value = _load_raw().get("vision", {}).get(handle)
    if value is None:
        return None
    return bool(value)


def set_vision_override(handle: str, supports_vision: bool | None) -> bool | None:
    """Set override (True/False) or None to clear and use server auto-detection."""
    data = _load_raw()
    vision: dict[str, bool] = dict(data.get("vision", {}))
    if supports_vision is None:
        vision.pop(handle, None)
    else:
        vision[handle] = bool(supports_vision)
    data["vision"] = vision
    _save_raw(data)
    return get_vision_override(handle)


def apply_model_row_overrides(row: dict) -> dict:
    handle = row.get("handle")
    override = get_vision_override(handle)
    if override is not None:
        row = {**row, "supports_vision": override, "vision_override": override}
    else:
        row = {**row, "vision_override": None}
    return row
