import base64

import httpx
from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.schemas import FetchImageUrlRequest, FetchImageUrlResponse
from backend.url_fetch import fetch_image_bytes

router = APIRouter(prefix="/api/images", tags=["images"])

DEFAULT_MAX_IMAGE_FETCH_BYTES = 20 * 1024 * 1024
FETCH_TIMEOUT_SECONDS = 60.0


@router.post("/fetch-url", response_model=FetchImageUrlResponse)
async def fetch_image_url(body: FetchImageUrlRequest):
    """
    Fetch an image URL server-side so the browser avoids CORS blocks
    (e.g. x.ai temporary image hosts).
    """
    settings = get_settings()
    max_bytes = settings.vision_max_upload_bytes or DEFAULT_MAX_IMAGE_FETCH_BYTES
    try:
        media_type, raw = await fetch_image_bytes(
            body.url,
            max_bytes=max_bytes,
            timeout=FETCH_TIMEOUT_SECONDS,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e

    return FetchImageUrlResponse(
        media_type=media_type,
        data=base64.standard_b64encode(raw).decode("ascii"),
    )
