import httpx
from fastapi import APIRouter, HTTPException
from letta_client.types import CreateBlockParam

from backend.config import get_letta_client, get_settings
from backend.context_refresh import recompile_agent_conversations
from backend.letta_lists import collect_sync_page
from backend.schemas import (
    AgentSummary,
    CreateAgentRequest,
    SaveAgentSystemRequest,
    UpdateAgentRequest,
    serialize,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _to_summary(agent) -> AgentSummary:
    created = agent.created_at
    return AgentSummary(
        id=agent.id,
        name=agent.name or "",
        model=agent.model,
        created_at=created.isoformat() if created else None,
    )


@router.get("")
def list_agents():
    client = get_letta_client()
    return [_to_summary(a) for a in collect_sync_page(client.agents.list())]


@router.get("/system-prompt-template/{key}")
def get_system_prompt_template(key: str):
    """Fetch a built-in system prompt template from the Letta server (e.g. letta_v1)."""
    settings = get_settings()
    url = f"{settings.letta_base_url.rstrip('/')}/v1/prompts/system/{key}"
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.get(
                url,
                headers={"Authorization": f"Bearer {settings.letta_server_password}"},
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail={"error": str(e)}) from e
    if res.status_code == 404:
        raise HTTPException(status_code=404, detail={"error": f"Unknown system prompt template: {key}"})
    if not res.is_success:
        raise HTTPException(status_code=502, detail={"error": res.text or res.reason_phrase})
    return res.json()


@router.get("/{agent_id}")
def get_agent(agent_id: str):
    client = get_letta_client()
    try:
        agent = client.agents.retrieve(agent_id, include=["agent.tools"])
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return serialize(agent)


@router.post("")
def create_agent(body: CreateAgentRequest):
    client = get_letta_client()
    memory_blocks = [
        CreateBlockParam(label="persona", value=body.persona),
        CreateBlockParam(label="human", value=body.human),
    ]
    create_kwargs: dict = {
        "name": body.name,
        "model": body.model,
        "embedding": body.embedding,
        "memory_blocks": memory_blocks,
        "tool_ids": body.tools if body.tools else None,
    }
    if body.context_window_limit is not None:
        create_kwargs["context_window_limit"] = body.context_window_limit
    if body.per_file_view_window_char_limit is not None:
        create_kwargs["per_file_view_window_char_limit"] = body.per_file_view_window_char_limit
    try:
        agent = client.agents.create(**create_kwargs)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(agent)


@router.patch("/{agent_id}")
def update_agent(agent_id: str, body: UpdateAgentRequest):
    client = get_letta_client()
    kwargs = {}
    if body.name is not None:
        kwargs["name"] = body.name
    if body.model is not None:
        kwargs["model"] = body.model
    if body.embedding is not None:
        kwargs["embedding"] = body.embedding
    if body.context_window_limit is not None:
        kwargs["context_window_limit"] = body.context_window_limit
    if body.per_file_view_window_char_limit is not None:
        kwargs["per_file_view_window_char_limit"] = body.per_file_view_window_char_limit
    if body.system is not None:
        kwargs["system"] = body.system
    if not kwargs:
        raise HTTPException(status_code=400, detail={"error": "No fields to update"})
    try:
        agent = client.agents.update(agent_id, **kwargs)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(agent)


@router.post("/{agent_id}/system/save")
def save_agent_system(agent_id: str, body: SaveAgentSystemRequest):
    """Persist agent.system and recompile conversation context for this agent."""
    client = get_letta_client()
    try:
        agent = client.agents.update(agent_id, system=body.system)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    recompiled = recompile_agent_conversations(client, agent_id)
    return {"agent": serialize(agent), "recompiled": recompiled}


@router.delete("/{agent_id}")
def delete_agent(agent_id: str):
    client = get_letta_client()
    try:
        client.agents.delete(agent_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return {"ok": True}
