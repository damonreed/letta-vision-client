# Release notes — v0.5.0 (letta-vision-client)

**Theme:** File memory visibility, chat stream recovery, provider management, operator tooling.

## Highlights

- **File memory panel** — open files, headlines, archives via `/api/file-memory/*` bridge.
- **System context inspector** — view compiled system prompt from chat header; refreshes after streams.
- **Chat stream recovery** — stall watchdog, keepalive forwarding, post-stream history sync; no full reload on SSE death.
- **Providers tab** — org-scoped LLM provider CRUD paired with server `/v1/providers`.
- **Text file creation** — create files in folders from the Files UI (`POST /api/folders/{id}/text-files`).
- **Agent system editor** — save `agent.system` and bulk recompile conversations from Agents view.

## Upgrade from v0.4.0

Pair with **letta-vision v0.5.0** (three-tier memory on the server).

```bash
git checkout v0.5.0
cd frontend && npm install && npm run build
# Or via letta-vision-deploy:
cd ../letta-vision-deploy && docker compose up -d --build
```

## Verification

- Attach a folder to an agent; open a file; confirm headline appears in system context modal.
- Start a long file-tool run; confirm chat recovers if stream stalls (or use Cancel).
- Create a text file from Files tab; confirm it appears in agent directory listing after attach.
- Save agent system prompt; confirm recompile count toast and updated context in chat.

## Documentation

- Server: [letta-vision RELEASE_NOTES_v0.5.0](../letta-vision/docs/RELEASE_NOTES_v0.5.0.md) (sibling repo).
- `docs/ARCHITECTURE.md` — stack and proxy behavior.
