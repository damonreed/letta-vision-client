/**
 * Tool-result images for MCP tools (ZapImage, fetch_image, etc.).
 * Display policy: show the same pixels the model can access — inline base64 or
 * persisted Letta refs resolved via /api/images/{id}/content.
 */

import { imageContentPath, imageSrcFromBlock } from "./contentBlocks.js";

function normalizeImageHandle(handle) {
  if (!handle || typeof handle !== "string") return null;
  const cleaned = handle.trim();
  if (!cleaned) return null;
  return cleaned.startsWith("image-") ? cleaned : `image-${cleaned}`;
}

/** Tool name from tool_call payload, message name, or tool_call_id (functions.name:N). */
export function extractToolName(rawMessage) {
  const tc = rawMessage?.tool_call;
  if (tc?.name) return tc.name;
  if (rawMessage?.name) return rawMessage.name;
  const tcid =
    rawMessage?.tool_call_id ||
    rawMessage?.tool_returns?.[0]?.tool_call_id ||
    tc?.tool_call_id;
  if (typeof tcid === "string") {
    const match = tcid.match(/functions\.([^:]+):/);
    if (match) return match[1];
  }
  return null;
}

/** Compact tool-call body for the details panel (not raw JSON wrapper). */
export function formatToolCallContent(toolCall) {
  if (!toolCall || typeof toolCall !== "object") return "";
  const name = toolCall.name || "unknown";
  let args = toolCall.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      /* keep raw string */
    }
  } else if (args != null) {
    args = JSON.stringify(args, null, 2);
  }
  return args ? `${name}\n${args}` : name;
}

function handlesFromStructuredToolReturn(toolReturn) {
  if (!toolReturn || typeof toolReturn !== "object" || Array.isArray(toolReturn)) {
    return [];
  }
  const rows = toolReturn.results || toolReturn.hits;
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = normalizeImageHandle(row.handle || row.file_id || row.id);
    if (id) out.push(id);
  }
  return out;
}

/** Human-readable text for dict tool returns (e.g. image_search hits). */
export function formatStructuredToolReturnText(toolReturn) {
  if (!toolReturn || typeof toolReturn !== "object" || Array.isArray(toolReturn)) {
    return null;
  }
  const rows = toolReturn.results || toolReturn.hits;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows
    .map((row, index) => {
      const handle = row?.handle || row?.file_id || row?.id || "?";
      const score =
        row?.score != null && Number.isFinite(Number(row.score))
          ? ` score=${Number(row.score).toFixed(3)}`
          : "";
      const desc = row?.description || row?.caption || "";
      return `${index + 1}. ${handle}${score}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
}

function blockDedupeKey(block) {
  if (!block || typeof block !== "object") return "";
  if (block.type === "image") {
    const src = block.source || {};
    if (src.data) {
      const d = src.data;
      // Full payload key — E2B often emits the same PNG on display + main results.
      return `img:${src.media_type || "image/png"}:${d.length}:${d}`;
    }
  }
  if (block.type === "text") return `text:${(block.text || "").slice(0, 256)}`;
  return JSON.stringify(block).slice(0, 128);
}

function dedupeContentBlocks(blocks) {
  const out = [];
  const seen = new Set();
  for (const block of blocks) {
    const key = blockDedupeKey(block);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(block);
  }
  return out;
}

/** Inline base64 or same-origin Letta ref content URL. */
function imageDisplaySrcFromToolBlock(block) {
  return imageSrcFromBlock(block);
}

/** Prefer multimodal blocks from tool_returns; never merge duplicate top-level copies. */
export function getToolResultBlocks(rawMessage) {
  const tr0 = rawMessage?.tool_returns?.[0];
  if (Array.isArray(tr0?.tool_return)) return dedupeContentBlocks(tr0.tool_return);
  if (Array.isArray(tr0?.func_response)) return dedupeContentBlocks(tr0.func_response);
  if (Array.isArray(rawMessage?.tool_return)) return dedupeContentBlocks(rawMessage.tool_return);
  return null;
}

/** Text parts only (excludes image blocks). */
export function getToolResultText(rawMessage) {
  const blocks = getToolResultBlocks(rawMessage);
  if (blocks) {
    return blocks
      .filter((b) => b?.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n");
  }
  if (typeof rawMessage?.tool_return === "string") return rawMessage.tool_return;
  return "";
}

function fileIdFromDisplaySrc(src) {
  if (!src || typeof src !== "string") return null;
  const match = src.match(/^\/api\/images\/([^/?#]+)\/content/);
  return match ? decodeURIComponent(match[1]) : null;
}

function imageDisplayFingerprint(src) {
  const fileId = fileIdFromDisplaySrc(src);
  if (fileId) return `letta:${fileId}`;
  if (!src?.startsWith("data:")) return src || "";
  const comma = src.indexOf(",");
  const payload = comma >= 0 ? src.slice(comma + 1) : src;
  return `b64:${payload.length}:${payload.slice(0, 64)}`;
}

/**
 * Redact base64 from tool-result text shown in the log/details panel (not from image blocks).
 */
export function redactToolResultDisplayText(text) {
  if (!text || typeof text !== "string") return text;
  let out = text
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[image base64 omitted]")
    .replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{200,}"/g, '"data": "[omitted]"')
    .replace(/type=['"]image['"][^'"]*data=['"][A-Za-z0-9+/=]{100,}['"]/gi, "[image omitted]");
  out = out.replace(/\s*\[Image omitted\]/gi, "").replace(/\s*\[\d+ images omitted\]/gi, "");
  out = out.replace(/https?:\/\/storage\.googleapis\.com[^\s"'<>]*/gi, "[image url omitted]");
  return out;
}

/**
 * Images to show in tool-result UI: inline base64 blocks only (same bytes the model gets).
 * @returns {{ key: string, src: string }[]}
 */
export function getToolResultDisplayImages(rawMessage) {
  const out = [];
  const seen = new Set();
  const blocks = getToolResultBlocks(rawMessage);

  if (blocks) {
    for (const block of blocks) {
      if (block?.type !== "image") continue;
      const src = imageDisplaySrcFromToolBlock(block);
      if (!src) continue;
      const fp = imageDisplayFingerprint(src);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push({ key: `block-${out.length}`, src });
    }
  }

  const structured =
    rawMessage?.tool_return ??
    rawMessage?.tool_returns?.[0]?.tool_return ??
    null;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    for (const handle of handlesFromStructuredToolReturn(structured)) {
      const src = imageContentPath(handle);
      if (!src || seen.has(src)) continue;
      seen.add(src);
      out.push({ key: `hit-${handle}`, src });
    }
  }

  return out;
}
