from fastapi import APIRouter, HTTPException

from backend.config import get_letta_client
from backend.model_overrides import apply_model_row_overrides
from backend.schemas import serialize

router = APIRouter(prefix="/api", tags=["models"])


def _serialize_models(models) -> list:
    if isinstance(models, list):
        rows = [serialize(m) for m in models]
    elif hasattr(models, "__iter__"):
        rows = [serialize(m) for m in models]
    else:
        rows = [serialize(models)]
    return [apply_model_row_overrides(row) for row in rows]


@router.get("/models")
def list_models():
    client = get_letta_client()
    try:
        models = client.models.list()
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)}) from e
    return _serialize_models(models)


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
