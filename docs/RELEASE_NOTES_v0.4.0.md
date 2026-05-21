# Release notes — v0.4.0 (letta-vision-client)

**Theme:** Tool images, MCP management, and dependable SSE error reporting.

## Highlights

- **Tool images in chat** — Generated or edited images from tool results render in the thread alongside reasoning content.
- **MCP tab** — Org-scoped MCP server CRUD, OAuth connect, tool refresh, attach tools to agents.
- **SSE stability** — Upstream errors surface with context; summary messages; fewer opaque stream failures.

## Upgrade from v0.3.0

Pair with **letta-vision v0.4.0** (cross-turn image context on the server).

```bash
git checkout v0.4.0
cd frontend && npm install && npm run build
# Or via letta-vision-deploy:
cd ../letta-vision-deploy && docker compose up -d --build
```

## Verification

- Multi-turn chat: attach image, send, follow up with text — image still visible in history.
- MCP: add a server, refresh tools, attach to an agent, run a generation tool.
- Provoke an upstream error (e.g. OpenRouter timeout) — chat shows a readable error, not a blank stall.

## Documentation

- `docs/ARCHITECTURE.md` — stack and proxy behavior.
- Server: [letta-vision RELEASE_NOTES_v0.4.0](../letta-vision/docs/RELEASE_NOTES_v0.4.0.md) (sibling repo).
