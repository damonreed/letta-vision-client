import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.config import get_settings

router = APIRouter(prefix="/api", tags=["file-memory"])


def _letta_request(method: str, path: str, **kwargs):
    settings = get_settings()
    url = f"{settings.letta_base_url.rstrip('/')}/v1/file-memory{path}"
    headers = {"Authorization": f"Bearer {settings.letta_server_password}"}
    with httpx.Client(timeout=settings.letta_client_read_timeout_seconds) as client:
        res = client.request(method, url, headers=headers, **kwargs)
    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail={"error": res.text})
    if res.status_code == 204:
        return None
    return res.json()


class PatchFileCoreRequest(BaseModel):
    summary: str = Field(..., min_length=1)


class ArchiveSearchRequest(BaseModel):
    query: str
    agent_id: str
    file_id: str | None = None
    tags: list[str] | None = None
    limit: int = 10


@router.get("/files/{file_id}/core")
def get_file_core(file_id: str):
    return _letta_request("GET", f"/files/{file_id}/core")


@router.patch("/files/{file_id}/core")
def patch_file_core(file_id: str, body: PatchFileCoreRequest):
    return _letta_request("PATCH", f"/files/{file_id}/core", json=body.model_dump())


@router.get("/agents/{agent_id}/open-files")
def list_open_files(agent_id: str):
    return _letta_request("GET", f"/agents/{agent_id}/open-files")


@router.post("/agents/{agent_id}/open-files/{file_id}/close")
def close_open_file(agent_id: str, file_id: str):
    settings = get_settings()
    url = f"{settings.letta_base_url.rstrip('/')}/v1/agents/{agent_id}/files/{file_id}/close"
    headers = {"Authorization": f"Bearer {settings.letta_server_password}"}
    with httpx.Client(timeout=settings.letta_client_read_timeout_seconds) as client:
        res = client.patch(url, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail={"error": res.text})
    return res.json() if res.content else {"ok": True}


@router.get("/files/{file_id}/archives")
def list_file_archives(file_id: str):
    return _letta_request("GET", f"/files/{file_id}/archives")


@router.post("/file-archives/search")
def search_archives(body: ArchiveSearchRequest):
    return _letta_request("POST", "/archives/search", json=body.model_dump())
