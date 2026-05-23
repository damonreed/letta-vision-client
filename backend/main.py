from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.routes import (
    agents,
    blocks,
    conversations,
    folders,
    file_memory,
    images,
    mcp,
    memory,
    messages,
    model_overrides,
    models,
    providers,
    tools,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="letta-vision-client")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.include_router(agents.router)
app.include_router(folders.router)
app.include_router(file_memory.router)
app.include_router(blocks.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(memory.router)
app.include_router(tools.router)
app.include_router(models.router)
app.include_router(model_overrides.router)
app.include_router(mcp.router)
app.include_router(providers.router)
app.include_router(images.router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(status_code=exc.status_code, content={"error": str(detail)})


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
