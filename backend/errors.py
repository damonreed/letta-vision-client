"""Map exceptions to HTTP responses without leaking unnecessary internals."""

from fastapi import HTTPException


def http_error_from_exception(
    exc: Exception,
    *,
    status_code: int,
    public_message: str | None = None,
) -> HTTPException:
    """Use Letta/SDK error text for 4xx; keep 5xx messages generic."""
    if status_code >= 500:
        detail = public_message or "Upstream service error"
    else:
        detail = str(exc) or public_message or "Request failed"
    return HTTPException(status_code=status_code, detail={"error": detail})
