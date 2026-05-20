# Release notes — v0.3.0 (letta-vision-client)

**Theme:** Web UI for multimodal chat (images in composer and history).

## Highlights

- **Image attach** — file picker, drag-drop, clipboard paste, URL fetch.
- **Browser pipeline** — `imagePipeline.ts` downscales/re-encodes before send.
- **Content blocks** — proxy accepts `content` as string or `[{type: text|image}, ...]`; passes through to Letta `input`.
- **Rendering** — `ImageViewer`, `AttachmentThumbnail`, `contentBlocks.js`; optimistic image in user bubble on send.
- **Capability UX** — Vision badge on agents; attach disabled for non-vision models.
- **Proxy guard** — `VISION_MAX_REQUEST_BYTES` (default 25 MiB).

## Upgrade from v0.2.0

Pair with **letta-vision v0.3.0** (server must expose `supports_vision`).

```bash
git checkout v0.3.0
cd frontend && npm install && npm run build
# Or via letta-vision-deploy:
cd ../letta-vision-deploy && docker compose up -d --build
```

## Verification

- Open http://localhost:8284, select a vision-capable agent, attach an image, send.
- `GET /api/models` should show `supports_vision: true` for Kimi K2.6.

## Documentation

- `docs/ARCHITECTURE.md` — Vision support section.
- Server report: [letta-vision IMPLEMENTATION_REPORT_v0.3.0](../letta-vision/docs/IMPLEMENTATION_REPORT_v0.3.0_vision-support.md) (sibling repo).
