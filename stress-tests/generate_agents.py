#!/usr/bin/env python3
"""Create N agents and verify bridge /api/agents lists all of them."""

from __future__ import annotations

import argparse
import os
import sys

import httpx
from letta_client import Letta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--model", default=os.environ.get("STRESS_MODEL", "openrouter/google/gemini-2.0-flash-001"))
    parser.add_argument("--embedding", default=os.environ.get("STRESS_EMBEDDING", "openrouter/google/text-embedding-004"))
    parser.add_argument(
        "--bridge-url",
        default=os.environ.get("BRIDGE_URL", "http://localhost:8284"),
    )
    parser.add_argument(
        "--letta-url",
        default=os.environ.get("LETTA_BASE_URL", "http://localhost:8283"),
    )
    parser.add_argument("--prefix", default="stress-agent")
    args = parser.parse_args()

    password = os.environ.get("LETTA_SERVER_PASSWORD")
    if not password:
        print("LETTA_SERVER_PASSWORD is required", file=sys.stderr)
        return 1

    client = Letta(base_url=args.letta_url, api_key=password)
    created_ids: list[str] = []

    print(f"Creating {args.count} agents...")
    for i in range(args.count):
        agent = client.agents.create(
            name=f"{args.prefix}-{i + 1}",
            model=args.model,
            embedding=args.embedding,
        )
        created_ids.append(agent.id)
        print(f"  {agent.id}")

    res = httpx.get(f"{args.bridge_url}/api/agents", timeout=60.0)
    res.raise_for_status()
    listed = res.json()
    listed_ids = {a["id"] for a in listed}
    missing = [aid for aid in created_ids if aid not in listed_ids]
    print(f"Bridge lists {len(listed)} agents")
    if missing:
        print(f"FAIL: {len(missing)} created agents missing from bridge list", file=sys.stderr)
        for aid in missing[:5]:
            print(f"  missing: {aid}", file=sys.stderr)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
