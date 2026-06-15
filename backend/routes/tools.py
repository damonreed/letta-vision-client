import httpx
from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client, get_settings
from backend.letta_lists import collect_sync_page
from backend.schemas import AttachToolRequest, serialize

router = APIRouter(prefix="/api", tags=["tools"])

REQUIRED_BASE_TOOL_NAMES = {
    "send_message",
    "search_all",
    "image_fetch",
    "image_get_text",
    "image_edit_text",
    "image_search",
    "conversation_search",
    "archival_memory_insert",
    "archival_memory_search",
    "attach_folder",
    "detach_folder",
    "open_file",
    "close_file",
    "file_read_page",
    "file_read_next_page",
    "file_read_prev_page",
    "file_read_range",
    "file_grep",
    "update_file_headline",
    "write_file_archive",
    "file_archives_search",
    "file_contents_search",
}


def _sync_base_tools_if_needed() -> None:
    client = get_letta_client()
    tools = collect_sync_page(client.tools.list())
    names = {t.name for t in tools}
    if REQUIRED_BASE_TOOL_NAMES.issubset(names):
        return
    settings = get_settings()
    url = f"{settings.letta_base_url.rstrip('/')}/v1/tools/add-base-tools"
    headers = {"Authorization": f"Bearer {settings.letta_server_password}"}
    with httpx.Client(timeout=settings.letta_client_read_timeout_seconds) as http:
        res = http.post(url, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(status_code=res.status_code, detail={"error": res.text})


@router.get("/tools")
def list_tools():
    _sync_base_tools_if_needed()
    client = get_letta_client()
    return [serialize(t) for t in collect_sync_page(client.tools.list())]


@router.post("/agents/{agent_id}/tools")
def attach_tool(agent_id: str, body: AttachToolRequest):
    client = get_letta_client()
    try:
        agent = client.agents.tools.attach(body.tool_id, agent_id=agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(agent) if agent else {"ok": True}


@router.delete("/agents/{agent_id}/tools/{tool_id}")
def detach_tool(agent_id: str, tool_id: str):
    client = get_letta_client()
    try:
        agent = client.agents.tools.detach(tool_id, agent_id=agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(agent) if agent else {"ok": True}
