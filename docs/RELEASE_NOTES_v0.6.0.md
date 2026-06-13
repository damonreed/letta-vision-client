# Release notes — v0.6.0 (letta-vision-client)

**Theme:** GA client shell — Images inspector, Chat-first navigation, unified-embedding UI cleanup.

## Highlights

- **Images tab (§12)** — list + detail shell matching Agents/Files/MCP: paginated browse rail, 1MP thumbnails, hybrid search with score overlays, inline caption/description/details edit, click-to-zoom, full metadata grid, re-enrich and delete.
- **Chat-first shell (§13)** — nav order Chat → Images → Files → Agents → MCP → Providers; Chat is default tab; mount-once (hidden CSS) so tab switches do not abort streams or lose drafts.
- **Chat performance** — windowed history (50 + load older); conversation sidebar without per-conversation message preview N+1; memory panel loads on open only.
- **Unified embedding UI** — removed per-agent and per-folder embedding pickers (deployment-global embedding on server).
- **Tool-result images** — `fetch_image` and MCP tool returns render in chat; dedupe by `file_id`; persisted `letta` image refs in history.
- **Files UX** — optimistic file delete with background server recompile (no hung UI).

## Upgrade from v0.5.0

Pair with **letta-vision v0.6.0** (unified embedding, object store, hybrid recall).

```bash
git checkout v0.6.0
cd frontend && npm install && npm run build
# Or via letta-vision-deploy:
cd ../letta-vision-deploy && git checkout v0.6.0
# Set LETTA_VERSION=0.6.0 in .env
docker compose up -d --build
```

Server migrations `v060`–`v063` run on first boot (or `docker compose run --rm letta-vision alembic upgrade head`).

## Verification

- **Images:** browse 100+ images with incremental rail load; search returns ranked results; inline metadata save round-trips; zoom dismiss on backdrop click.
- **Chat:** default tab on load; switch tabs mid-stream — stream continues; load older messages at thread top.
- **Conversations:** sidebar lists without long preview-fetch delay; synthetic default conversation hidden.
- **Files:** delete a file — row disappears immediately; folder recompile completes in background.
- **Vision attach:** non-vision OpenRouter models (e.g. deepseek-v4-pro) show attach disabled when server reports `supports_vision: false`.

## Documentation

- Server: [letta-vision RELEASE_NOTES_v0.6.0](../letta-vision/docs/RELEASE_NOTES_v0.6.0.md) (sibling repo).
- Deploy: [letta-vision-deploy RELEASE_NOTES_v0.6.0](../letta-vision-deploy/docs/RELEASE_NOTES_v0.6.0.md).
- `docs/ARCHITECTURE.md` — stack and proxy behavior.
