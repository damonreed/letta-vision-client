"""Validate and fetch remote image URLs for the browser proxy (avoids CORS)."""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

_BLOCKED_HOSTNAMES = frozenset({"localhost", "metadata.google.internal"})
_BLOCKED_SUFFIXES = (".local", ".localdomain", ".home.arpa", ".svc", ".cluster.local")

ALLOWED_IMAGE_MEDIA_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


def _normalize_hostname(hostname: str) -> str:
    return hostname.rstrip(".").lower()


def _is_blocked_hostname(hostname: str) -> bool:
    normalized = _normalize_hostname(hostname)
    if normalized in _BLOCKED_HOSTNAMES:
        return True
    return any(normalized.endswith(suffix) for suffix in _BLOCKED_SUFFIXES)


def _resolve_public_host(hostname: str, port: int) -> None:
    try:
        parsed_ip = ipaddress.ip_address(hostname)
    except ValueError:
        parsed_ip = None
    if parsed_ip is not None:
        if not parsed_ip.is_global:
            raise ValueError(f"Non-public IP not allowed: {hostname}")
        return
    try:
        infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname: {hostname}") from exc
    for _, _, _, _, sockaddr in infos:
        if not ipaddress.ip_address(sockaddr[0]).is_global:
            raise ValueError(f"Hostname resolves to non-public IP: {sockaddr[0]}")


def validate_image_fetch_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http:// and https:// image URLs are supported")
    if not parsed.hostname:
        raise ValueError("URL must include a hostname")
    hostname = _normalize_hostname(parsed.hostname)
    if _is_blocked_hostname(hostname):
        raise ValueError(f"Blocked hostname: {parsed.hostname}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    _resolve_public_host(parsed.hostname, port)
    return url.strip()


async def fetch_image_bytes(url: str, *, max_bytes: int, timeout: float) -> tuple[str, bytes]:
    validate_image_fetch_url(url)
    timeout_cfg = httpx.Timeout(timeout, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout_cfg, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            if response.status_code >= 400:
                raise ValueError(f"Failed to fetch image: HTTP {response.status_code}")
            media_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
            if not media_type.startswith("image/"):
                raise ValueError(f"URL did not return an image (content-type: {media_type or 'unknown'})")
            if media_type not in ALLOWED_IMAGE_MEDIA_TYPES:
                raise ValueError(f"Unsupported image type: {media_type}")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if max_bytes and total > max_bytes:
                    raise ValueError(f"Image exceeds maximum size ({max_bytes} bytes)")
                chunks.append(chunk)
            return media_type, b"".join(chunks)
