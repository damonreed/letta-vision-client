/**
 * Tool-result images for MCP tools (ZapImage, etc.).
 * Display policy: if the model sees inline image bytes, the user sees them too —
 * no signed-URL fetch or URL-based previews in chat history.
 */


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

/** Inline base64 only — URLs are not shown in chat history. */
function imageDataUrlFromToolBlock(block) {
  const src = block?.source;
  if (!src?.data || !src?.media_type) return null;
  return `data:${src.media_type};base64,${src.data}`;
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

function imageDisplayFingerprint(src) {
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
  if (!blocks) return out;

  for (const block of blocks) {
    if (block?.type !== "image") continue;
    const src = imageDataUrlFromToolBlock(block);
    if (!src) continue;
    const fp = imageDisplayFingerprint(src);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push({ key: `block-${out.length}`, src });
  }

  return out;
}
