from urllib.parse import unquote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.model_overrides import apply_model_row_overrides, get_vision_override, set_vision_override

router = APIRouter(prefix="/api/models", tags=["model-overrides"])


class VisionOverrideBody(BaseModel):
    supports_vision: bool | None = None


@router.patch("/{handle:path}/vision")
def patch_model_vision(handle: str, body: VisionOverrideBody):
    """Set manual vision override for a model handle (null = auto-detect from server)."""
    decoded = unquote(handle).strip()
    if not decoded:
        raise HTTPException(status_code=400, detail={"error": "handle is required"})
    value = set_vision_override(decoded, body.supports_vision)
    return {
        "handle": decoded,
        "supports_vision": value,
        "vision_override": value,
        "auto": value is None,
    }


@router.get("/{handle:path}/vision")
def get_model_vision(handle: str):
    decoded = unquote(handle).strip()
    if not decoded:
        raise HTTPException(status_code=400, detail={"error": "handle is required"})
    value = get_vision_override(decoded)
    return {"handle": decoded, "vision_override": value, "auto": value is None}
