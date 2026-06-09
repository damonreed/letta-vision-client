import base64

import httpx
from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.routes.providers import _httpx_get, _httpx_request
from backend.schemas import FetchImageUrlRequest, FetchImageUrlResponse
from backend.url_fetch import fetch_image_bytes

router = APIRouter(prefix="/api/images", tags=["images"])


@router.get("")
def list_images(limit: int = 50, enrichment_status: str | None = None):
    params = f"?limit={limit}"
    if enrichment_status:
        params += f"&enrichment_status={enrichment_status}"
    return _httpx_get(f"/v1/images{params}")


@router.get("/{image_id}")
def get_image(image_id: str):
    return _httpx_get(f"/v1/images/{image_id}")


@router.delete("/{image_id}")
def delete_image(image_id: str):
    return _httpx_request("DELETE", f"/v1/images/{image_id}")


@router.post("/{image_id}/re-enrich")
def re_enrich_image(image_id: str):
    return _httpx_request("POST", f"/v1/images/{image_id}/re-enrich")


@router.get("/{image_id}/url")
def get_image_url(image_id: str):
    return _httpx_get(f"/v1/images/{image_id}/url")

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
