# Release notes — v0.7.0 (letta-vision-client)

**Theme:** Multi-image chat attachments.

## Highlights

- **Up to 4 images per message** — file picker (multi-select), drag-drop, paste, and URL attach append until the cap; horizontal thumbnail strip with `n/4` count and per-image remove.
- **Pre-send size validation** — client rejects oversized payloads before POST; proxy default raised to **80 MiB** (`VISION_MAX_REQUEST_BYTES`) to align with letta-vision `max_message_bytes`.
- **Stream failure recovery** — all pending image blocks restore to the composer after a failed send (not just the first).

## Upgrade

```bash
git pull origin main
cd frontend && npm install && npm run build
# Or via letta-vision-deploy:
docker compose build letta-vision-client && docker compose up -d letta-vision-client
```

Optional: set `VISION_MAX_REQUEST_BYTES=83886080` in `.env` if you override the default.

## Verification

- Attach 4 images via multi-select picker; 5th attempt shows cap error; send delivers all four in history.
- Paste multiple clipboard images; drop a folder of images (first 4 kept, warning if more).
- URL attach appends; attach controls disabled at cap.
- Send with "preserve original" large images — pre-send error if aggregate exceeds limit.
- Fail a stream mid-send — composer restores text and all images.

## Tests

```bash
cd frontend && npm test
```
