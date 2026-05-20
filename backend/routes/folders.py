import os
from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from backend.config import get_letta_client, get_settings
from backend.errors import http_error_from_exception
from backend.letta_lists import collect_sync_page
from backend.schemas import CreateFolderRequest, serialize

DuplicateHandling = Literal["skip", "error", "suffix", "replace"]
UPLOAD_CHUNK_SIZE = 1024 * 1024

router = APIRouter(prefix="/api", tags=["folders"])


@router.get("/folders")
def list_folders():
    client = get_letta_client()
    try:
        folders = collect_sync_page(client.folders.list())
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)}) from e
    return [serialize(f) for f in folders]


@router.post("/folders")
def create_folder(body: CreateFolderRequest):
    client = get_letta_client()
    try:
        folder = client.folders.create(
            name=body.name,
            description=body.description or None,
            embedding=body.embedding,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(folder)


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str):
    client = get_letta_client()
    try:
        client.folders.delete(folder_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"ok": True}


@router.get("/folders/{folder_id}/files")
def list_folder_files(folder_id: str):
    client = get_letta_client()
    try:
        files = collect_sync_page(client.folders.files.list(folder_id))
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return [serialize(f) for f in files]


async def _read_upload_bounded(upload: UploadFile) -> bytes:
    max_bytes = get_settings().vision_max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if max_bytes > 0 and total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail={
                    "error": f"Upload exceeds VISION_MAX_UPLOAD_BYTES ({max_bytes})",
                },
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/folders/{folder_id}/files")
async def upload_folder_file(
    folder_id: str,
    upload: UploadFile = File(...),
    duplicate_handling: DuplicateHandling = Query("replace"),
):
    client = get_letta_client()
    content = await _read_upload_bounded(upload)
    filename = os.path.basename(upload.filename or "upload") or "upload"
    content_type = upload.content_type or "application/octet-stream"
    try:
        result = client.folders.files.upload(
            folder_id,
            file=(filename, content, content_type),
            duplicate_handling=duplicate_handling,
        )
    except Exception as e:
        raise http_error_from_exception(e, status_code=400) from e
    return serialize(result)


@router.delete("/folders/{folder_id}/files/{file_id}")
def delete_folder_file(folder_id: str, file_id: str):
    client = get_letta_client()
    try:
        client.folders.files.delete(file_id, folder_id=folder_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"ok": True}


@router.get("/agents/{agent_id}/folders")
def list_agent_folders(agent_id: str):
    client = get_letta_client()
    try:
        folders = collect_sync_page(client.agents.folders.list(agent_id))
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return [serialize(f) for f in folders]


@router.post("/agents/{agent_id}/folders/{folder_id}/attach")
def attach_folder_to_agent(agent_id: str, folder_id: str):
    client = get_letta_client()
    try:
        client.agents.folders.attach(folder_id, agent_id=agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"ok": True}


@router.delete("/agents/{agent_id}/folders/{folder_id}/detach")
def detach_folder_from_agent(agent_id: str, folder_id: str):
    client = get_letta_client()
    try:
        client.agents.folders.detach(folder_id, agent_id=agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"ok": True}
