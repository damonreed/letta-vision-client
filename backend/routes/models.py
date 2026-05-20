from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.schemas import serialize

router = APIRouter(prefix="/api", tags=["models"])


@router.get("/models")
def list_models():
    client = get_letta_client()
    try:
        models = client.models.list()
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)}) from e
    if isinstance(models, list):
        return [serialize(m) for m in models]
    return [serialize(m) for m in models] if hasattr(models, "__iter__") else serialize(models)


@router.get("/embeddings")
def list_embeddings():
    client = get_letta_client()
    try:
        embeddings = client.models.embeddings.list()
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)}) from e
    if isinstance(embeddings, list):
        return [serialize(m) for m in embeddings]
    return [serialize(m) for m in embeddings] if hasattr(embeddings, "__iter__") else serialize(embeddings)
