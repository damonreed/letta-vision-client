import base64
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from backend.config import get_settings
from backend.routes.providers import _httpx_get, _httpx_request, _http_error, _letta_headers, _letta_url
from backend.schemas import FetchImageUrlRequest, FetchImageUrlResponse
from backend.url_fetch import fetch_image_bytes

router = APIRouter(prefix="/api/images", tags=["images"])


class ImageSearchRequest(BaseModel):
    query: str
    limit: int = 10


@router.get("")
def list_images(
    limit: int | None = None,
    enrichment_status: str | None = None,
    after_created_at: datetime | None = None,
    after_id: str | None = None,
):
    query: list[str] = []
    if limit is not None:
        query.append(f"limit={limit}")
    if enrichment_status:
        query.append(f"enrichment_status={enrichment_status}")
    if after_created_at is not None:
        query.append(f"after_created_at={after_created_at.isoformat()}")
    if after_id:
        query.append(f"after_id={after_id}")
    suffix = f"?{'&'.join(query)}" if query else ""
    return _httpx_get(f"/v1/images{suffix}")


@router.post("/search")
def search_images(body: ImageSearchRequest):
    return _httpx_request("POST", "/v1/images/search", json=body.model_dump())


@router.get("/{image_id}")
def get_image(image_id: str):
    return _httpx_get(f"/v1/images/{image_id}")


@router.patch("/{image_id}")
def update_image(image_id: str, body: dict):
    return _httpx_request("PATCH", f"/v1/images/{image_id}", json=body)


@router.delete("/{image_id}")
def delete_image(image_id: str):
    return _httpx_request("DELETE", f"/v1/images/{image_id}")


@router.post("/{image_id}/re-enrich")
def re_enrich_image(image_id: str):
    return _httpx_request("POST", f"/v1/images/{image_id}/re-enrich")


@router.get("/{image_id}/url")
def get_image_url(image_id: str):
    return _httpx_get(f"/v1/images/{image_id}/url")


@router.get("/{image_id}/content")
def get_image_content(image_id: str, variant: str = "full"):
    settings = get_settings()
    timeout = httpx.Timeout(settings.letta_client_read_timeout_seconds, connect=10.0)
    with httpx.Client(timeout=timeout) as client:
        res = client.get(
            _letta_url(f"/v1/images/{image_id}/content"),
            headers=_letta_headers(),
            params={"variant": variant},
        )
    if res.status_code >= 400:
        raise _http_error(res)
    media_type = res.headers.get("content-type", "application/octet-stream")
    return Response(content=res.content, media_type=media_type)


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
