import json
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from backend.config import get_letta_client, get_settings
from backend.schemas import (
    CheckProviderRequest,
    CreateProviderRequest,
    UpdateProviderRequest,
    serialize,
)

router = APIRouter(prefix="/api/providers", tags=["providers"])


def _parse_letta_error(text: str) -> str:
    try:
        data = json.loads(text)
        if isinstance(data, dict) and data.get("detail"):
            return str(data["detail"])
    except (json.JSONDecodeError, TypeError):
        pass
    return text


def _provider_error(e: Exception, status: int = 400) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": str(e)})


def _http_error(res: httpx.Response) -> HTTPException:
    body = res.text
    return HTTPException(
        status_code=res.status_code,
        detail={"error": _parse_letta_error(body)},
    )


def _letta_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.letta_server_password}",
        "Content-Type": "application/json",
    }


def _letta_url(path: str) -> str:
    settings = get_settings()
    return f"{settings.letta_base_url.rstrip('/')}{path}"


def _httpx_get(path: str, *, params: list[tuple[str, str]] | None = None) -> Any:
    settings = get_settings()
    timeout = httpx.Timeout(settings.letta_client_read_timeout_seconds, connect=10.0)
    with httpx.Client(timeout=timeout) as client:
        res = client.get(_letta_url(path), headers=_letta_headers(), params=params)
    if res.status_code >= 400:
        raise _http_error(res)
    return res.json()


def _httpx_request(method: str, path: str, *, json: dict | None = None) -> Any:
    settings = get_settings()
    timeout = httpx.Timeout(settings.letta_client_read_timeout_seconds, connect=10.0)
    with httpx.Client(timeout=timeout) as client:
        res = client.request(method, _letta_url(path), headers=_letta_headers(), json=json)
    if res.status_code >= 400:
        raise _http_error(res)
    if res.status_code == 204:
        return None
    return res.json()


@router.get("")
def list_providers(
    provider_category: list[str] | None = Query(
        None,
        description="Repeatable: base, byok. Default lists both when omitted.",
    ),
):
    """List Letta providers (built-in and BYOK)."""
    categories = provider_category or ["base", "byok"]
    params: list[tuple[str, str]] = []
    for cat in categories:
        params.append(("provider_category", cat))
    try:
        data = _httpx_get("/v1/providers/", params=params)
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e
    if isinstance(data, list):
        return data
    return data


@router.post("/check")
def check_provider(body: CheckProviderRequest):
    try:
        _httpx_request(
            "POST",
            "/v1/providers/check",
            json=body.model_dump(exclude_none=True),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e
    return {"message": "ok"}


@router.get("/{provider_id}/models")
def list_provider_models(provider_id: str):
    """LLM models for a provider (matched by provider name from Letta model list)."""
    try:
        provider = _httpx_get(f"/v1/providers/{provider_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e, 404) from e
    name = provider.get("name")
    client = get_letta_client()
    try:
        models = client.models.list()
    except Exception as e:
        raise _provider_error(e) from e
    rows = [serialize(m) for m in models]
    from backend.model_overrides import apply_model_row_overrides

    matched = [
        m
        for m in rows
        if m.get("provider_name") == name
        or (name and m.get("handle", "").startswith(f"{name}/"))
    ]
    return [apply_model_row_overrides(m) for m in matched]


@router.get("/{provider_id}")
def get_provider(provider_id: str):
    try:
        return _httpx_get(f"/v1/providers/{provider_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e, 404) from e


@router.post("")
def create_provider(body: CreateProviderRequest):
    try:
        return _httpx_request(
            "POST",
            "/v1/providers/",
            json=body.model_dump(exclude_none=True),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e


@router.patch("/{provider_id}")
def update_provider(provider_id: str, body: UpdateProviderRequest):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail={"error": "No fields to update"})
    try:
        return _httpx_request(
            "PATCH",
            f"/v1/providers/{provider_id}",
            json=payload,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e


@router.delete("/{provider_id}", status_code=204)
def delete_provider(provider_id: str):
    try:
        _httpx_request("DELETE", f"/v1/providers/{provider_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e


@router.post("/{provider_id}/check")
def check_existing_provider(provider_id: str):
    try:
        _httpx_request("POST", f"/v1/providers/{provider_id}/check")
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e
    return {"message": "ok"}


@router.post("/{provider_id}/refresh")
def refresh_provider(provider_id: str):
    try:
        return _httpx_request("PATCH", f"/v1/providers/{provider_id}/refresh")
    except HTTPException:
        raise
    except Exception as e:
        raise _provider_error(e) from e
