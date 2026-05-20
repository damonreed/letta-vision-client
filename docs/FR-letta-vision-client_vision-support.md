# FR: Vision Support — letta-vision-client

**Author:** Ada (with Damon)
**Date:** 2026-05-20
**Status:** Draft — for Cursor implementation
**Repository:** `damonreed/letta-vision-client`
**Companion:** `FR-letta-vision-server.md`

---

## 1. Problem

The Letta server fork supports vision capability and the K2.6 OpenRouter path is empirically validated. The client UI currently has no image input or display surface. Users cannot attach images to messages, cannot paste image URLs from external sources, and the chat renderer would dump base64 payloads as text if a stored image-bearing turn appeared in history.

This FR specifies the v1 client surface for image input and rendering, paired with the server FR that defines the API contract. The intent is to ship a usable visual workflow without simulation or CLI scaffolding — the client should be the testbed for vision features going forward.

---

## 2. Goals

1. **Three input modes converging on one outbound shape** — file picker, drag-and-drop, clipboard paste, all producing the same base64 image content block.
2. **Browser-side URL fetching** — paste a URL, browser fetches and converts to base64 before sending. Surfaces fetch failures at the UI layer where they're fixable.
3. **Capability-aware UI** — the agent picker shows which models support vision; image attachment is hard-disabled for text-only agents.
4. **Image rendering in chat history** — content blocks of type `image` render as `<img>` tags, never as visible text or base64 strings.
5. **Pre-send normalization** — downscale and re-encode in the browser before sending, capping payload size while preserving visual fidelity for the model.

v1 stretch goal (conditional on server-side investigation):

6. **MCP server management** — UI to configure MCP server connections per agent.
7. **Tool-result image rendering** — tool-call results carrying images render inline in chat alongside the assistant turn that invoked them.

Explicit non-goals for v1:

- Video upload/display (Letta schema doesn't support it).
- Multi-image selection in a single message turn (defer until single-image works cleanly).
- Image annotation, cropping, or in-client editing.
- Lazy fetching from `file_id` references (v2; v1 renders `source.data` inline).

---

## 3. The Pre-Send Pipeline

Every image input mode produces the same shape via the same pipeline. The shape going to the FastAPI proxy:

```typescript
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg" | "image/png",  // post-normalization output
    data: "<base64-encoded-bytes>"
  }
}
```

### 3.1 Pipeline Stages

1. **Acquire raw bytes** — from File object (picker, drop, paste) or fetch response (URL paste).
2. **Decode to ImageBitmap** — via `createImageBitmap()` for orientation handling and format-agnostic loading.
3. **Downscale if oversized** — if max edge > configured threshold (default 1920 px), resize via `OffscreenCanvas` preserving aspect ratio.
4. **Re-encode** — to JPEG quality 0.85 by default; PNG if source had transparency. This is the format normalization point.
5. **Convert to base64** — `FileReader.readAsDataURL` or equivalent, strip the data URI prefix to get raw base64.
6. **Attach to outgoing message** as a content block.

### 3.2 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `imageMaxEdgePx` | `1920` | Maximum width or height after downscale |
| `imageJpegQuality` | `0.85` | JPEG encode quality |
| `imagePreserveOriginal` | `false` | Skip downscale/re-encode, send raw |
| `imageMaxUploadBytes` | `20971520` (20 MiB) | Reject inputs larger than this before any processing |

Configuration lives in client settings (localStorage prefix `letta-vision-client/`). Per-message override via a toggle in the attachment UI: *"Send original resolution."*

### 3.3 Acceptance Criteria

- [ ] A 4000×3000 photo from a phone camera downscales to ≤1920 px on the long edge before sending.
- [ ] A PNG with transparency stays PNG; a JPEG photo stays JPEG.
- [ ] A 25 MiB file is rejected with a clear error message before any encoding starts.
- [ ] The "send original resolution" toggle bypasses downscale but still respects the size cap.

---

## 4. Input Mode 1: File Picker

### 4.1 UX

An attachment button in the chat composer (paperclip icon or similar). Click opens a native file picker filtered to image types.

The picker accepts: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

Multiple selection is **disabled** in v1 — one image per message.

### 4.2 Behavior

Selected file flows through the pre-send pipeline (§3). A thumbnail appears in the composer above the text input, with a remove (×) button. The text input remains active — user can add a prompt alongside the image.

**The thumbnail shows the post-pipeline (downscaled, re-encoded) image** — what will actually be sent, not the original. This gives the user a chance to notice if downscaling lost detail that matters before they hit send. Clicking the thumbnail opens it in the shared image viewer (§9.5) at the downscaled image's full resolution.

### 4.3 Acceptance Criteria

- [ ] Click attach button → native picker opens with image filter.
- [ ] Selecting a JPEG produces a thumbnail in the composer.
- [ ] The thumbnail shows the downscaled bytes that will be sent, not the original file.
- [ ] Clicking the thumbnail opens the image viewer at full resolution of the downscaled image.
- [ ] Remove (×) clears the attachment.
- [ ] Send button submits the message with both text and image content blocks.

---

## 5. Input Mode 2: Drag and Drop

### 5.1 UX

Dragging an image file over the chat area shows a drop overlay ("Drop image to attach"). Dropping flows through the pre-send pipeline identically to the picker path.

Dragging non-image files shows the overlay with an error tint and rejects on drop.

### 5.2 Acceptance Criteria

- [ ] Dragging a PNG over the chat shows the drop overlay.
- [ ] Dropping the PNG attaches it as a thumbnail.
- [ ] Dragging a `.pdf` shows the overlay in an error state and does not attach on drop.

---

## 6. Input Mode 3: Clipboard Paste

### 6.1 UX

Pasting (Ctrl+V / Cmd+V) into the chat composer with image data on the clipboard attaches the image and shows the thumbnail. This is the highest-leverage UX path — it matches how Letta Code handles images and how users naturally share screenshots.

Pasting text content keeps existing text-paste behavior unchanged.

### 6.2 Behavior

The paste handler inspects `ClipboardEvent.clipboardData.items` for image MIME types. If found, intercepts the paste, runs the pipeline. If not, lets the default paste proceed.

### 6.3 Acceptance Criteria

- [ ] Take a screenshot, click in composer, paste → image attaches as thumbnail.
- [ ] Pasting plain text into the composer still works normally.
- [ ] Pasting an image while text is selected does not delete the selected text — image attaches separately.

---

## 7. Input Mode 4: URL Paste

### 7.1 Problem

Users will paste image URLs from external sources ("show me what this Wikipedia photo looks like"). Server-side URL handling is fragile — empirical testing showed Wikipedia's CDN returns 400 to whatever fetcher Letta uses upstream, while Picsum works fine. The robust path is browser-side fetching, where cookies, user-agent, and CORS errors are visible and recoverable.

### 7.2 UX

Pasting a URL into the composer that ends in an image extension (or returns an image content-type on HEAD) triggers a detection prompt: *"Treat as image? [Attach] [Keep as text]."*

Or, more aggressively, a dedicated "attach from URL" entry in the attachment menu that accepts a URL field and fetches on submit.

I recommend the explicit "attach from URL" path for v1 — clearer intent, no false positives on text URLs that happen to look like images.

### 7.3 Fetch Behavior

1. Browser-side `fetch()` of the URL.
2. On CORS failure, show a clear error: *"That URL doesn't allow cross-origin fetching. Try downloading and attaching the file."*
3. On HTTP error, show the status: *"Failed to fetch image: 403 Forbidden."*
4. On success, validate content-type is an image; pipeline as normal.

### 7.4 Acceptance Criteria

- [ ] Attach-from-URL with a Picsum URL completes and renders thumbnail.
- [ ] Attach-from-URL with a CORS-blocked URL shows a user-readable error, not a console-only failure.
- [ ] Attach-from-URL with a 404 URL shows "Failed to fetch image: 404 Not Found."

---

## 8. Capability-Aware Agent Picker

### 8.1 Problem

Without capability awareness, a user can attach an image to an agent backed by a text-only model. Per the server FR, that now produces a 422 — but the failure happens at send time, after the user has prepared the attachment. Better UX is to surface capability at agent-pick time and disable attachment when it doesn't apply.

### 8.2 UX

In the agent list / picker UI, each agent's row shows a small "👁 Vision" badge when its configured model has `supports_vision: true`. Tooltip: *"This agent's model can see images."*

In the chat composer, when the active agent is text-only, the attach button is disabled with a tooltip: *"This agent's model can't see images. Switch to a vision-capable agent to attach."*

### 8.3 Data Source

The `/api/models` response now includes `supports_vision` per the server FR. The client fetches the model list at agent-load time, looks up the active agent's model, and toggles UI state from the result.

### 8.4 Acceptance Criteria

- [ ] Agent picker shows the Vision badge on agents using K2.6 (and other vision-capable models).
- [ ] Switching to a text-only agent disables the attach button.
- [ ] Tooltip on disabled attach button explains why.
- [ ] No 422 should occur in normal use — the client prevents the attempt.

---

## 9. Image Rendering in Chat History

### 9.1 Problem

The current chat renderer assumes `message.content` is a string. Image-bearing messages have `content` as an array of content blocks. Rendering the array as text would dump megabytes of base64 into the UI.

### 9.2 Required Change

The chat message component must handle both content shapes:

```typescript
// Existing
type MessageContent = string;

// New
type MessageContent = string | ContentBlock[];

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource };

type ImageSource = {
  type: "base64" | "letta" | "url";
  media_type?: string;
  data?: string;
  url?: string;
  file_id?: string;
};
```

For each block:
- `type: "text"` → render through the existing markdown pipeline (DOMPurify sanitization preserved).
- `type: "image"` → render an `<img>` tag with `src` constructed as:
  ```
  data:${source.media_type};base64,${source.data}
  ```
  Falls through to `source.url` if `data` is absent. Falls through to a placeholder if neither is present (v2 will fetch via `file_id`).

Images render at a maximum display width (e.g., 480 px) with click-to-expand for full size. Use `loading="lazy"` to defer offscreen images.

### 9.3 Constraints

- Never render base64 strings as visible text, even in error states.
- Never include base64 strings in error logs or telemetry.
- `<img>` tags use `decoding="async"` and `loading="lazy"`.
- Apply `referrerpolicy="no-referrer"` so URL-form images don't leak chat context to third parties.

### 9.5 Shared Image Viewer

A single `ImageViewer.svelte` component handles full-resolution display for every clickable image in the UI — composer attachment thumbnails (§4.2), history images (§9.2), and tool-result images (§13 stretch). One component, consistent interaction surface.

Behavior:

- Opens as a modal overlay on click, displaying the image at its native resolution or constrained to viewport with `object-fit: contain`.
- Closes on: clicking the backdrop, pressing Escape, or clicking an explicit close (×) control.
- For images larger than the viewport, supports pan via drag and zoom via scroll or pinch (post-v1 polish if it complicates v1).
- For images embedded as `data:` URIs, no network fetch occurs.
- Keyboard accessible: focus trap inside the modal, Escape closes, focus returns to the triggering element.
- Source priority matches `<img>` rendering: `source.data` → `source.url` → placeholder.

### 9.6 Acceptance Criteria

- [ ] A message history containing the example block from §6.4 of the server FR renders as a visible image, not as text.
- [ ] Image blocks with `source.type = "letta"` render correctly using `data` + `media_type`.
- [ ] Image blocks with `source.type = "base64"` (just-sent messages) render identically.
- [ ] Clicking any image (composer thumbnail or history) opens the shared `ImageViewer` at full resolution.
- [ ] Escape and backdrop click both close the viewer.
- [ ] Base64 strings appear nowhere in the rendered DOM as visible text.

---

## 10. SSE Streaming with Image-Bearing Turns

### 10.1 Verification

The existing chat component uses SSE for token streaming. Image-bearing turns should work without changes — the user message is sent in one request, and only the assistant response streams. The image is delivered as part of the request body, not streamed.

### 10.2 Acceptance Criteria

- [ ] Sending an image-bearing message produces normal token-by-token assistant streaming.
- [ ] The reasoning block (from K2.6's thinking mode) streams visibly during the wait.
- [ ] If the SSE connection drops mid-stream after image upload, the user can retry without re-uploading (per existing conversation retry semantics).

---

## 11. FastAPI Proxy Changes

### 11.1 Accept Content Blocks

The current `POST /api/agents/{id}/messages` proxy accepts `content` as a string. Extend it to accept an array of content blocks.

```python
class MessageRequest(BaseModel):
    role: str = "user"
    content: Union[str, List[ContentBlock]]
```

`letta-client` accepts this shape directly; the proxy passes through with no transformation.

### 11.2 Size Guard

Apply an early-fail size check in the proxy before forwarding to Letta. The server enforces its own limits per the server FR — this guard prevents wasting bandwidth on requests that will be rejected.

```python
MAX_REQUEST_BYTES = int(os.getenv("VISION_MAX_REQUEST_BYTES", 25 * 1024 * 1024))
```

Default 25 MiB (slightly above the per-image 20 MiB to allow for text + small overhead). Configurable, but never higher than the server's `LETTA_MAX_MESSAGE_BYTES`.

### 11.3 Acceptance Criteria

- [ ] Sending a string content (existing flow) still works.
- [ ] Sending a content block array proxies through to Letta without transformation.
- [ ] Sending a request over 25 MiB returns 413 from the proxy without contacting Letta.

---

## 12. MCP Server Management (v1 Stretch)

### 12.1 Scope

UI for adding, removing, and inspecting MCP server connections — both globally (available to all agents) and per-agent (attached to a specific agent). This is the prerequisite for the tool-result image flow described in the server FR §7.

### 12.2 UX Sketch

A new "MCP Servers" tab (peer to Agents, Chat, Files). Lists configured servers with name, URL, status (connected/disconnected). Add button opens a form: name, URL, authentication. Once added, the server's tools appear in the agent tools picker.

### 12.3 Data Source

Letta already supports MCP tools server-side. The client work is surfacing the existing API:

- `GET /api/mcp/servers` — list configured servers
- `POST /api/mcp/servers` — register a new server
- `DELETE /api/mcp/servers/{name}` — remove
- `GET /api/mcp/servers/{name}/tools` — list tools exposed by that server

The proxy passes these through to Letta. Exact route names depend on Letta's current MCP API surface — Cursor should verify against the running server.

### 12.4 Acceptance Criteria (Stretch)

- [ ] An operator can add the ZapImage MCP server through the UI without editing config files.
- [ ] Once added, ZapImage's tools appear in the agent tools picker.
- [ ] Attaching ZapImage tools to a K2.6 agent allows that agent to call them.

---

## 13. Tool-Result Image Rendering (v1 Stretch)

### 13.1 Scope

When a tool call's result contains image content (per the server FR §7 work), the client renders it inline in the chat — visible to the user, attributed to the tool, not as raw text.

### 13.2 UX

Tool-result messages already render in the chat with their existing styling (tool name, collapsed/expanded view). Extend the renderer to handle content blocks the same way as user/assistant messages (§9). An image returned by a tool renders inline within the tool-result block.

### 13.3 Acceptance Criteria (Stretch)

- [ ] User asks K2.6 to generate an image via ZapImage; the resulting image renders inline in the tool-result message.
- [ ] The same image is visible to the model on its next turn (verified via "Describe what you just generated" follow-up).
- [ ] Tool results that don't contain images render as before — no regression on existing tool-result UX.

---

## 14. Implementation

### 14.1 File Changes

| File | Change |
|------|--------|
| `frontend/src/lib/imagePipeline.ts` | **New.** Acquire → decode → downscale → re-encode → base64 |
| `frontend/src/lib/components/Composer.svelte` | Add attach button, drop overlay, paste handler, URL-paste menu |
| `frontend/src/lib/components/AttachmentThumbnail.svelte` | **New.** Composer thumbnail with remove control |
| `frontend/src/lib/components/ImageViewer.svelte` | **New.** Shared full-resolution modal viewer (used by composer thumbnail, history images, and tool-result images) |
| `frontend/src/lib/components/Message.svelte` | Handle `content` as string-or-blocks; render image blocks via `<img>` |
| `frontend/src/lib/components/AgentPicker.svelte` | Render Vision badge from `supports_vision` flag |
| `frontend/src/lib/api.js` | Extend message-send to accept content-block array; fetch + parse `/api/models` capability flags |
| `frontend/src/lib/stores.js` | Cache models list with capability flags |
| `backend/routes/messages.py` | Accept `Union[str, List[ContentBlock]]` for `content`; size guard |
| `backend/schemas.py` | Add `ContentBlock`, `ImageSource` Pydantic models |
| `backend/routes/mcp.py` | **New, stretch.** Proxy Letta's MCP server management endpoints |
| `frontend/src/routes/mcp.svelte` | **New, stretch.** MCP servers tab |
| `docs/ARCHITECTURE.md` | Add Vision section documenting client behavior |
| `.env.example` | Add `VISION_MAX_REQUEST_BYTES` |
| `stress-tests/` | New script: send progressively larger images, observe failure point |

### 14.2 Dependencies

No new npm dependencies expected — `createImageBitmap` and `OffscreenCanvas` are available in modern browsers. If `OffscreenCanvas` is missing in any target environment, fall back to a regular `<canvas>` element. No new Python dependencies.

### 14.3 Configuration Summary

| Variable | Default | Required |
|----------|---------|----------|
| `VISION_MAX_REQUEST_BYTES` | `26214400` (25 MiB) | No |
| `VISION_MAX_UPLOAD_BYTES` | (unchanged, default `0` = unlimited) | No — but operators should set this to ~20 MiB |

Client-side localStorage settings (no env var):

| Key | Default |
|-----|---------|
| `letta-vision-client/image-max-edge` | `1920` |
| `letta-vision-client/image-jpeg-quality` | `0.85` |
| `letta-vision-client/image-preserve-original` | `false` |

---

## 15. Testing Plan

### 15.1 Manual UX Verification

- [ ] Attach a phone photo via picker → thumbnail appears → send → image visible in user message → assistant describes it
- [ ] Drag a PNG from desktop onto chat → drop overlay → attached
- [ ] Screenshot, then paste into composer → attached
- [ ] Paste a Picsum URL via "attach from URL" → fetched → attached
- [ ] Paste a Wikipedia image URL → CORS error surfaces clearly
- [ ] Switch to a text-only agent → attach button disabled with tooltip
- [ ] Reload an existing image-bearing conversation → images render, no base64 visible

### 15.2 Automated Tests

- Pipeline tests: 4000×3000 input downscales to 1920 px; PNG with alpha stays PNG; quality target hit
- Composer tests: paste handler intercepts image MIME, ignores text-only
- Message renderer tests: string content renders as text; block array renders text+image correctly; no base64 in serialized DOM
- Proxy tests: string content passes through; block array passes through; oversize rejected with 413

### 15.3 Stress Tests

Add to `stress-tests/`:

- Send progressively larger images (256 KiB → 25 MiB) and record which sizes succeed
- Send images of varying aspect ratios (square, portrait, ultrawide) and verify aspect preservation through downscale
- Send 10 image-bearing turns in sequence and verify context retention across turns

---

## 16. Phase Plan

**v1 (this FR):**
- §3 pipeline
- §4 picker, §5 drop, §6 paste
- §7 URL-paste with browser-side fetch
- §8 capability-aware agent picker
- §9 history rendering
- §10 SSE verification
- §11 proxy contract changes
- §12, §13 — stretch, ship if server-side work clears the path

**v2 (separate FR):**
- Multi-image messages
- Lazy fetch via `file_id` references (paired with server v2)
- Inline image annotation / crop / mark
- Image search across history
- Video upload (paired with Letta schema work)

---

## 17. Open Questions

1. **Where exactly does the existing chat renderer assume `content: string`?** Cursor should map this on first read to scope the change in §9.
2. **Does Letta's API return content-block arrays consistently, or only when image blocks are present?** If only the latter, the client renderer needs to handle both cases — a string for text-only turns, an array for any turn that ever had an image.
3. **What's the right error-message tone for capability mismatch?** Default proposal: *"This agent's model can't see images."* Calibrate against the rest of the UI's voice.
4. **For v2 lazy fetching, what's the right auth model on `GET /api/files/{file_id}`?** Out of scope here, but worth noting so v2 design accounts for it.

---

## 18. References

- Server FR: `FR-letta-vision-server.md`
- Letta image inputs documentation: https://docs.letta.com/guides/core-concepts/messages/image-inputs/
- Letta MCP tools documentation: https://docs.letta.com/guides/core-concepts/tools/mcp-tools/
- Smoke test script (validates server-side contract): `scripts/letta_vision_smoke_test.py`
- Current architecture: `docs/ARCHITECTURE.md`