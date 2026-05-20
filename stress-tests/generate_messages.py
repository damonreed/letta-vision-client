#!/usr/bin/env python3
"""Create N user messages and verify bridge history returns all of them."""

from __future__ import annotations

import argparse
import os
import sys

import httpx
from letta_client import Letta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument(
        "--bridge-url",
        default=os.environ.get("BRIDGE_URL", "http://localhost:8284"),
    )
    parser.add_argument(
        "--letta-url",
        default=os.environ.get("LETTA_BASE_URL", "http://localhost:8283"),
    )
    args = parser.parse_args()

    password = os.environ.get("LETTA_SERVER_PASSWORD")
    if not password:
        print("LETTA_SERVER_PASSWORD is required", file=sys.stderr)
        return 1

    client = Letta(base_url=args.letta_url, api_key=password)
    conv = "default"

    print(f"Creating {args.count} user messages for agent {args.agent_id}...")
    for i in range(args.count):
        client.conversations.messages.create(
            conv,
            agent_id=args.agent_id,
            input=f"[stress-test] message {i + 1}/{args.count}",
            streaming=False,
        )
        if (i + 1) % 10 == 0:
            print(f"  sent {i + 1}/{args.count}")

    url = f"{args.bridge_url}/api/agents/{args.agent_id}/history"
    print(f"Fetching history from {url} ...")
    res = httpx.get(url, params={"conversation_id": conv}, timeout=120.0)
    res.raise_for_status()
    history = res.json()
    user_msgs = [m for m in history if m.get("message_type") == "user_message"]
    print(f"Bridge returned {len(history)} total messages ({len(user_msgs)} user messages)")
    if len(user_msgs) < args.count:
        print(
            f"FAIL: expected at least {args.count} user messages, got {len(user_msgs)}",
            file=sys.stderr,
        )
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
