#!/usr/bin/env python3
"""Open an SSE stream via the bridge and verify it stays open past short proxy timeouts."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import httpx


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-id", required=True)
    parser.add_argument(
        "--bridge-url",
        default=os.environ.get("BRIDGE_URL", "http://localhost:8284"),
    )
    parser.add_argument(
        "--min-duration",
        type=float,
        default=90.0,
        help="Warn if stream ends before this many seconds (unless done/error)",
    )
    parser.add_argument(
        "--prompt",
        default="Please think step by step about a long topic and write a detailed multi-paragraph answer.",
    )
    args = parser.parse_args()

    url = f"{args.bridge_url}/api/agents/{args.agent_id}/messages"
    print(f"POST {url} (streaming, timeout=None)...")
    started = time.monotonic()
    events = 0
    done = False

    with httpx.Client(timeout=None) as client:
        with client.stream(
            "POST",
            url,
            json={"content": args.prompt},
            headers={"Content-Type": "application/json"},
        ) as res:
            res.raise_for_status()
            for line in res.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                events += 1
                try:
                    payload = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if payload.get("type") == "done":
                    done = True
                    break
                if payload.get("type") == "error":
                    print(f"Stream error: {payload}", file=sys.stderr)
                    return 1

    elapsed = time.monotonic() - started
    print(f"Stream finished: {events} events, {elapsed:.1f}s, done={done}")
    if not done:
        print("FAIL: stream ended without done event", file=sys.stderr)
        return 1
    if elapsed < args.min_duration:
        print(
            f"NOTE: stream completed in {elapsed:.1f}s (< {args.min_duration}s). "
            "Not a failure — use a slower model/tool to test long keepalive.",
        )
    else:
        print(f"OK: stream ran {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
