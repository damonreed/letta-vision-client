/**
 * Tool-result image extraction for MCP tools (ZapImage, etc.).
 */

import { imageSrcFromBlock } from "./contentBlocks.js";

function blockDedupeKey(block) {
  if (!block || typeof block !== "object") return "";
  if (block.type === "image") {
    const src = block.source || {};
    if (src.data) return `img:data:${src.data.length}:${src.data.slice(0, 64)}`;
    if (src.url) return `img:url:${src.url}`;
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

/** Prefer multimodal blocks from tool_returns; never merge duplicate top-level copies. */
export function getToolResultBlocks(rawMessage) {
  const tr0 = rawMessage?.tool_returns?.[0]?.tool_return;
  if (Array.isArray(tr0)) return dedupeContentBlocks(tr0);
  if (Array.isArray(rawMessage?.tool_return)) return dedupeContentBlocks(rawMessage.tool_return);
  return null;
}

/** Text payload for JSON / URL fallback (packaged or raw). */
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

/**
 * Extract image URLs from ZapImage-style MCP tool returns (JSON in tool_result text).
 */
export function extractImageUrlsFromToolResult(content) {
  if (!content || typeof content !== "string") return [];
  const urls = [];

  let text = content;
  try {
    const outer = JSON.parse(content.trim());
    if (outer?.message != null) {
      text =
        typeof outer.message === "string"
          ? outer.message
          : JSON.stringify(outer.message);
    }
  } catch {
    /* not packaged JSON */
  }

  const jsonChunk = text.split("\n\n[")[0].trim();
  try {
    const payload = JSON.parse(jsonChunk);
    if (payload?.images && Array.isArray(payload.images)) {
      for (const item of payload.images) {
        if (item?.url && typeof item.url === "string") urls.push(item.url);
      }
    }
  } catch {
    /* not JSON */
  }

  const urlRe = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/gi;
  for (const m of text.matchAll(urlRe)) {
    if (!urls.includes(m[0])) urls.push(m[0]);
  }

  return urls;
}

function imageDisplayFingerprint(item) {
  if (item.src?.startsWith("data:")) {
    const comma = item.src.indexOf(",");
    const payload = comma >= 0 ? item.src.slice(comma + 1) : item.src;
    return `b64:${payload.length}:${payload.slice(0, 64)}`;
  }
  return item.url || item.src || "";
}

/**
 * Redact base64 from tool-result text shown in the log/details panel (not from image blocks).
 */
export function redactToolResultDisplayText(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, "[image base64 omitted]")
    .replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{200,}"/g, '"data": "[omitted]"')
    .replace(/type=['"]image['"][^'"]*data=['"][A-Za-z0-9+/=]{100,}['"]/gi, "[image omitted]");
}

/**
 * Images to show in the tool-result UI: inline base64 blocks first, else proxied URLs.
 * @returns {{ key: string, src?: string, url?: string }[]}
 */
export function getToolResultDisplayImages(rawMessage) {
  const out = [];
  const seen = new Set();
  const blocks = getToolResultBlocks(rawMessage);
  if (blocks) {
    for (const block of blocks) {
      if (block?.type !== "image") continue;
      const src = imageSrcFromBlock(block);
      if (!src) continue;
      const item = {
        key: `block-${seen.size}`,
        src,
        url: src.startsWith("http") ? src : undefined,
      };
      const fp = imageDisplayFingerprint(item);
      if (seen.has(fp)) continue;
      seen.add(fp);
      out.push(item);
    }
  }

  // Inline image blocks win; never also fetch the JSON URL (duplicate preview).
  if (out.length === 0) {
    const text = getToolResultText(rawMessage);
    for (const url of extractImageUrlsFromToolResult(text)) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ key: `url-${seen.size}`, url, src: null });
    }
  }

  return out;
}
