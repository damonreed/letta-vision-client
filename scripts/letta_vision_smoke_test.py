#!/usr/bin/env python3
"""
letta_vision_smoke_test.py — verify image content-block pass-through to a vision-capable agent.

Reads LETTA_BASE_URL and LETTA_SERVER_PASSWORD from scripts/.env (or ../.env).
Shell env vars override .env when set.

Usage:
    python letta_vision_smoke_test.py                       # base64 mode, ./sample.png
    python letta_vision_smoke_test.py --mode url            # url mode, Wikipedia ant
    python letta_vision_smoke_test.py --image other.jpg     # different image
    python letta_vision_smoke_test.py --prompt "What color is the largest object?"
"""

import argparse
import base64
import sys
import time
from pathlib import Path

import httpx
from letta_client import Letta
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

_SCRIPT_DIR = Path(__file__).resolve().parent

URL_TEST_IMAGE = "https://picsum.photos/id/26/4209/2769"


class SmokeTestSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            _SCRIPT_DIR.parent / ".env",
            _SCRIPT_DIR / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    letta_base_url: str = "http://localhost:8283"
    letta_server_password: str
    # letta-client defaults to 60s read; vision runs often exceed that.
    letta_client_read_timeout_seconds: float = 600.0


DEFAULT_AGENT_ID = "agent-f7daa227-a804-4a0f-b3d2-84afd0b92616"

DEGRADATION_MARKERS = (
    "no image",
    "cannot see",
    "can't see",
    "don't see an image",
    "no attached image",
    "image was mentioned",
    "unable to view",
    "i cannot view images",
    "image is not visible",
    "i don't have access to",
    "as a text-based",
)

MEDIA_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
}


def encode_image(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower().lstrip(".")
    media_type = MEDIA_TYPES.get(suffix)
    if not media_type:
        raise ValueError(f"Unsupported image extension: .{suffix}")
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8"), media_type


def _block_text(block) -> str | None:
    """Pull text out of a content block whether it's a pydantic object or dict."""
    if isinstance(block, dict):
        return block.get("text")
    return getattr(block, "text", None)


def extract_messages(response):
    """Return list of (message_type, text) tuples from a Letta response."""
    out = []
    for msg in getattr(response, "messages", []) or []:
        mtype = getattr(msg, "message_type", None) or "?"
        content = getattr(msg, "content", None)
        # assistant/user content can be str or list of blocks
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = "\n".join(t for t in (_block_text(b) for b in content) if t)
        else:
            text = getattr(msg, "reasoning", None) or ""
        out.append((mtype, text.strip()))
    return out


def diagnose(assistant_text: str, reasoning_text: str) -> str:
    blob = (assistant_text + "\n" + reasoning_text).lower()
    if not assistant_text.strip():
        return "EMPTY — no assistant text. Check the message stream summary below."
    if any(m in blob for m in DEGRADATION_MARKERS):
        return (
            "DEGRADED — language suggests the model did not actually receive the image."
        )
    if len(assistant_text) < 60:
        return f"AMBIGUOUS — response is short ({len(assistant_text)} chars). Inspect manually."
    return "LIKELY OK — response is substantive and free of degradation markers. Confirm against the actual image contents."


def build_image_block(args) -> dict:
    if args.mode == "base64":
        path = Path(args.image)
        if not path.exists():
            sys.exit(f"ERROR: image not found: {path}")
        data, media_type = encode_image(path)
        print(f"Image file   : {path} ({media_type}, {len(data):,} base64 chars)")
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        }
    print(f"Image URL    : {args.url}")
    return {"type": "image", "source": {"type": "url", "url": args.url}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default="sample.png")
    ap.add_argument("--agent", default=DEFAULT_AGENT_ID)
    ap.add_argument("--mode", choices=("base64", "url"), default="base64")
    ap.add_argument(
        "--url",
        default=URL_TEST_IMAGE,
    )
    ap.add_argument(
        "--prompt",
        default="Describe this image in detail. What objects, colors, and composition do you see?",
    )
    args = ap.parse_args()

    try:
        settings = SmokeTestSettings()
    except ValidationError:
        sys.exit(
            "ERROR: LETTA_SERVER_PASSWORD is required "
            "(set in scripts/.env or the environment)."
        )

    base_url = settings.letta_base_url
    token = settings.letta_server_password

    print(f"Letta server : {base_url}")
    print(f"Agent ID     : {args.agent}")
    print(f"Mode         : {args.mode}")

    client = Letta(
        base_url=base_url,
        api_key=token,
        timeout=httpx.Timeout(
            settings.letta_client_read_timeout_seconds,
            connect=5.0,
        ),
        # Avoid a second full agent run (and second OpenRouter bill) after read timeout.
        max_retries=0,
    )
    image_block = build_image_block(args)

    print("\n→ Sending message …")
    t0 = time.time()
    try:
        response = client.agents.messages.create(
            agent_id=args.agent,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": args.prompt},
                        image_block,
                    ],
                }
            ],
        )
    except Exception as e:
        print(f"\n❌ Request failed: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    elapsed = time.time() - t0
    print(f"  ← {elapsed:.2f}s")

    messages = extract_messages(response)
    assistant_text = "\n".join(
        t for mt, t in messages if mt == "assistant_message" and t
    )
    reasoning_text = "\n".join(
        t for mt, t in messages if mt == "reasoning_message" and t
    )

    print("\n── Reasoning (if present) ──")
    print(reasoning_text or "(none)")

    print("\n── Assistant response ──")
    print(assistant_text or "(no assistant_message text extracted)")

    print("\n── Diagnosis ──")
    print(diagnose(assistant_text, reasoning_text))

    print("\n── Message stream summary ──")
    for mt, t in messages:
        preview = (t[:80] + "…") if len(t) > 80 else t
        print(f"  - {mt:25s} {preview}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
