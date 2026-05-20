import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.config import get_letta_client, get_settings
from backend.schemas import CreateMcpServerRequest, McpRefreshRequest, UpdateMcpServerRequest, serialize

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _mcp_error(e: Exception, status: int = 400) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": str(e)})


@router.get("/servers")
def list_mcp_servers():
    client = get_letta_client()
    try:
        servers = client.mcp_servers.list()
    except Exception as e:
        raise _mcp_error(e) from e
    return [serialize(s) for s in servers]


@router.post("/servers")
def create_mcp_server(body: CreateMcpServerRequest):
    client = get_letta_client()
    try:
        server = client.mcp_servers.create(
            server_name=body.server_name,
            config=body.config.model_dump(mode="json", exclude_none=True),
        )
    except Exception as e:
        raise _mcp_error(e) from e
    return serialize(server)


@router.get("/servers/{mcp_server_id}")
def get_mcp_server(mcp_server_id: str):
    client = get_letta_client()
    try:
        server = client.mcp_servers.retrieve(mcp_server_id)
    except Exception as e:
        raise _mcp_error(e, 404) from e
    return serialize(server)


def _config_from_server(server: dict) -> dict:
    """Build update config dict from a serialized MCP server response."""
    t = server.get("mcp_server_type")
    if t == "stdio":
        return {
            "mcp_server_type": "stdio",
            "command": server["command"],
            "args": server.get("args") or [],
            "env": server.get("env"),
        }
    if t in ("sse", "streamable_http"):
        cfg = {
            "mcp_server_type": t,
            "server_url": server["server_url"],
            "auth_header": server.get("auth_header"),
            "auth_token": server.get("auth_token"),
            "custom_headers": server.get("custom_headers"),
        }
        return {k: v for k, v in cfg.items() if v is not None or k in ("mcp_server_type", "server_url")}
    raise HTTPException(status_code=400, detail={"error": f"Unknown MCP server type: {t}"})


@router.patch("/servers/{mcp_server_id}")
def update_mcp_server(mcp_server_id: str, body: UpdateMcpServerRequest):
    client = get_letta_client()
    if body.server_name is None and body.config is None:
        raise HTTPException(status_code=400, detail={"error": "No fields to update"})
    try:
        if body.config is not None:
            config = body.config.model_dump(mode="json", exclude_none=True)
        else:
            current = serialize(client.mcp_servers.retrieve(mcp_server_id))
            config = _config_from_server(current)
        update_kwargs = {"config": config}
        if body.server_name is not None:
            update_kwargs["server_name"] = body.server_name
        server = client.mcp_servers.update(mcp_server_id, **update_kwargs)
    except HTTPException:
        raise
    except Exception as e:
        raise _mcp_error(e) from e
    return serialize(server)


@router.delete("/servers/{mcp_server_id}", status_code=204)
def delete_mcp_server(mcp_server_id: str):
    client = get_letta_client()
    try:
        client.mcp_servers.delete(mcp_server_id)
    except Exception as e:
        raise _mcp_error(e) from e


@router.get("/servers/{mcp_server_id}/tools")
def list_mcp_server_tools(mcp_server_id: str):
    client = get_letta_client()
    try:
        tools = client.mcp_servers.tools.list(mcp_server_id)
    except Exception as e:
        raise _mcp_error(e) from e
    return [serialize(t) for t in tools]


@router.post("/servers/{mcp_server_id}/refresh")
def refresh_mcp_server_tools(
    mcp_server_id: str,
    body: McpRefreshRequest | None = None,
    agent_id: str | None = Query(None),
):
    client = get_letta_client()
    aid = (body.agent_id if body else None) or agent_id
    try:
        if aid:
            result = client.mcp_servers.refresh(mcp_server_id, agent_id=aid)
        else:
            result = client.mcp_servers.refresh(mcp_server_id)
    except Exception as e:
        raise _mcp_error(e) from e
    return serialize(result) if hasattr(result, "model_dump") else result


async def _stream_mcp_connect(mcp_server_id: str):
    settings = get_settings()
    url = f"{settings.letta_base_url.rstrip('/')}/v1/mcp-servers/connect/{mcp_server_id}"
    timeout = httpx.Timeout(settings.letta_client_read_timeout_seconds, connect=10.0)
    headers = {"Authorization": f"Bearer {settings.letta_server_password}"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("GET", url, headers=headers) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise HTTPException(
                    status_code=response.status_code,
                    detail={"error": body.decode("utf-8", errors="replace")},
                )
            async for chunk in response.aiter_bytes():
                if chunk:
                    yield chunk


@router.get("/servers/{mcp_server_id}/connect")
async def connect_mcp_server(mcp_server_id: str):
    """Proxy Letta MCP connect/OAuth SSE stream."""
    return StreamingResponse(
        _stream_mcp_connect(mcp_server_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
