from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.letta_lists import collect_sync_page
from backend.schemas import CreateBlockRequest, UpdateBlockRequest, serialize

router = APIRouter(prefix="/api/agents", tags=["memory"])


def _find_block_id(agent_id: str, label: str) -> str:
    client = get_letta_client()
    blocks = collect_sync_page(client.agents.blocks.list(agent_id))
    for block in blocks:
        if block.label == label:
            return block.id
    raise HTTPException(status_code=404, detail={"error": f"Block '{label}' not found"})


@router.get("/{agent_id}/blocks")
def list_blocks(agent_id: str):
    client = get_letta_client()
    try:
        blocks = collect_sync_page(client.agents.blocks.list(agent_id))
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return [serialize(b) for b in blocks]


@router.post("/{agent_id}/blocks/attach/{block_id}")
def attach_block(agent_id: str, block_id: str):
    client = get_letta_client()
    try:
        client.agents.blocks.attach(block_id, agent_id=agent_id)
        block = client.blocks.retrieve(block_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(block)


@router.patch("/{agent_id}/blocks/{label}")
def update_block(agent_id: str, label: str, body: UpdateBlockRequest):
    client = get_letta_client()
    try:
        block = client.agents.blocks.update(
            label, agent_id=agent_id, value=body.value
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(block)


@router.post("/{agent_id}/blocks")
def create_block(agent_id: str, body: CreateBlockRequest):
    """Legacy: create block and attach in one step."""
    client = get_letta_client()
    try:
        block = client.blocks.create(
            label=body.label,
            value=body.value,
            description=body.description,
            limit=body.limit,
            read_only=body.read_only,
        )
        client.agents.blocks.attach(block.id, agent_id=agent_id)
        attached = client.agents.blocks.retrieve(body.label, agent_id=agent_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(attached)


@router.delete("/{agent_id}/blocks/{block_id}")
def detach_block(agent_id: str, block_id: str):
    client = get_letta_client()
    try:
        if not block_id.startswith("block-"):
            block_id = _find_block_id(agent_id, block_id)
        client.agents.blocks.detach(block_id, agent_id=agent_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return {"ok": True}
