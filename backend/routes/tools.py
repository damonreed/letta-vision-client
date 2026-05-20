from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.letta_lists import collect_sync_page
from backend.schemas import AttachToolRequest, serialize

router = APIRouter(prefix="/api", tags=["tools"])


@router.get("/tools")
def list_tools():
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
