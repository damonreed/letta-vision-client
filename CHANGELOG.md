# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-06-13

### Added

- Images tab GA inspector: list+detail shell, paginated browse, hybrid search, inline metadata PATCH, click-to-zoom.
- Images API proxy: list with cursor, search, get, delete, re-enrich, content variants.
- Chat windowed history (`has_more`, load older); conversation sidebar without N+1 preview fetch.
- Tool-result image rendering and `file_id` dedupe; `letta` image refs in chat history.
- `docs/RELEASE_NOTES_v0.6.0.md`.

### Changed

- Nav order Chat-first; Chat default tab; mount-once (tab switches preserve stream/draft).
- Deferred memory panel load until panel open.
- Tool catalog synced for hybrid search tools (`search_all`, `image_fetch`, layer tools).
- Removed per-agent and per-folder embedding UI pickers.

### Fixed

- Files tab optimistic delete (background recompile; no UI hang).
- Images browse pagination cursor datetime encoding.
- Hide synthetic default conversation from Chat sidebar.
- Agent markdown when opening stage directions are indented.
- `fetch_image` display and conversation ID copy on HTTP errors.

## [0.5.0] - 2026-06-01

### Added

- File memory API bridge (`backend/routes/file_memory.py`) and UI: open files panel, system context modal.
- Chat stream recovery (`chatStreamRecovery.js`): stall watchdog, keepalive SSE, post-stream history sync.
- Providers tab (`Providers.svelte`) with server `/v1/providers` proxy.
- Text file creation from Files UI (`CreateTextFileRequest`, folder text-files endpoint).
- `FileViewerModal` for in-browser file preview.
- Agent system prompt editor with save + bulk conversation recompile (`context_refresh.py`).
- Master-detail tool selector and Agents subtabs for memory/tools organization.

### Changed

- SSE keepalive forwarding for Letta `ping` chunks; coalescing tests extended.
- Tool-result image rendering prioritizes inline base64; reasoning content display improved.

### Fixed

- Chat freeze on abrupt SSE disconnect; cancel and refresh controls on error banner.
- Tab-hidden and network-offline recovery while streaming.

## [0.4.0] - 2026-05-21

### Added

- MCP server management tab: list, connect (OAuth SSE), refresh tools, per-agent tool attach (`Mcp.svelte`, `mcpHelpers.js`).
- SSE summary message mapping and display in chat.
- Tool-result and reasoning rendering in chat, including images returned from tools.

### Changed

- SSE error handling: upstream error context, legacy injected-JSON compatibility, clearer error detail in `Chat.svelte`.
- Backend SSE coalescing and error propagation tests extended.

### Fixed

- Stream error logging and user-facing feedback for common upstream failure modes.

## [0.3.0] - 2026-05-20

### Added

- Vision UI: image attach (file, drag-drop, paste, URL), `imagePipeline.ts`, content-block proxy.
- `ImageViewer`, `AttachmentThumbnail`, optimistic user-bubble images, history image rendering.
- Vision badge on agents; attach disabled for non-vision models (`supports_vision` from API).
- `docs/RELEASE_NOTES_v0.3.0.md`; Vision section in `docs/ARCHITECTURE.md`.

### Changed

- `POST /api/agents/{id}/messages` accepts multimodal `content` (string or block array).

## [0.2.0] - 2026-05-20

Pre-vision baseline: text chat bridge; smoke script for multimodal API only.

### Added

- DOMPurify sanitization for agent markdown in chat.
- Optional `VISION_MAX_UPLOAD_BYTES` upload cap; security response headers.
- Bounded chunked upload reads; basename-only upload filenames.

### Fixed

- Conversation list now paginates through all Letta conversations.
- `duplicate_handling` query param restricted to SDK-allowed values.

### Changed

- Renamed project from `letta-bridge` to `letta-vision-client`.
- Replaced editable Python package install with `requirements.txt`.
- Consolidated versioned specs into `docs/ARCHITECTURE.md`.

## [0.1.0] - 2026-05-20

### Added

- FastAPI backend proxying the Letta Python SDK (`letta-client`).
- Svelte 5 frontend: agents, multi-conversation chat (SSE), memory blocks, tools, models, folders/files.
- Docker image and standalone `docker-compose.yml`.
- Stress-test scripts for empirical limit discovery.

[Unreleased]: https://github.com/damonreed/letta-vision-client/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.6.0
[0.5.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.5.0
[0.4.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.4.0
[0.3.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.3.0
[0.2.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.2.0
[0.1.0]: https://github.com/damonreed/letta-vision-client/releases/tag/v0.1.0
