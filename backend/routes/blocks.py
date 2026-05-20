from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.letta_lists import collect_sync_page
from backend.schemas import GlobalCreateBlockRequest, GlobalUpdateBlockRequest, serialize

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


@router.get("")
def list_all_blocks():
    client = get_letta_client()
    try:
        blocks = collect_sync_page(client.blocks.list())
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return [serialize(b) for b in blocks]


@router.post("")
def create_block(body: GlobalCreateBlockRequest):
    client = get_letta_client()
    try:
        block = client.blocks.create(
            label=body.label,
            value=body.value,
            description=body.description,
            limit=body.limit,
            read_only=body.read_only,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(block)


@router.get("/{block_id}")
def get_block(block_id: str):
    client = get_letta_client()
    try:
        block = client.blocks.retrieve(block_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail={"error": str(e)}) from e
    return serialize(block)


@router.patch("/{block_id}")
def update_block(block_id: str, body: GlobalUpdateBlockRequest):
    client = get_letta_client()
    kwargs = body.model_dump(exclude_unset=True)
    if not kwargs:
        raise HTTPException(status_code=400, detail={"error": "No fields to update"})
    try:
        block = client.blocks.update(block_id, **kwargs)
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return serialize(block)


@router.get("/{block_id}/agents")
def list_block_agents(block_id: str):
    client = get_letta_client()
    try:
        agents = collect_sync_page(client.blocks.agents.list(block_id))
    except Exception as e:
        raise HTTPException(status_code=400, detail={"error": str(e)}) from e
    return [serialize(a) for a in agents]
