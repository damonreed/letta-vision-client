from fastapi import APIRouter, HTTPException
from letta_client.types import CreateBlockParam

from backend.config import get_letta_client
from backend.letta_lists import collect_sync_page
from backend.schemas import AgentSummary, CreateAgentRequest, UpdateAgentRequest, serialize

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
    if not kwargs:
        raise HTTPException(status_code=400, detail={"error": "No fields to update"})
    try:
        agent = client.agents.update(agent_id, **kwargs)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(agent)


@router.delete("/{agent_id}")
def delete_agent(agent_id: str):
    client = get_letta_client()
    try:
        client.agents.delete(agent_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return {"ok": True}
