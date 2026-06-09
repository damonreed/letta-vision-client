export function parseContent(content) {
  if (typeof content === "string") {
    return { text: content, images: [], blocks: null };
  }
  if (!Array.isArray(content)) {
    return { text: "", images: [], blocks: null };
  }
  const textParts = [];
  const images = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && block.text) textParts.push(block.text);
    if (block.type === "image") images.push(block);
  }
  return { text: textParts.join("\n"), images, blocks: content };
}

export function lettaFileIdFromSource(source) {
  if (!source || source.type !== "letta") return null;
  return source.file_id || null;
}

/** Same-origin proxy path for persisted Letta image refs (v0.6 object store). */
export function imageContentPath(fileId, { variant = "full" } = {}) {
  if (!fileId) return null;
  const base = `/api/images/${encodeURIComponent(fileId)}/content`;
  if (variant && variant !== "full") {
    return `${base}?variant=${encodeURIComponent(variant)}`;
  }
  return base;
}

/** Grid thumbnail: prefer 1MP derivative when enrichment has produced one. */
export function imageThumbnailPath(image) {
  if (!image?.id) return null;
  const variant = image.object_url_1mp ? "1mp" : "full";
  return imageContentPath(image.id, { variant });
}

export function imageSrcFromBlock(block) {
  const src = block?.source;
  if (!src) return null;
  if (src.data && src.media_type) return `data:${src.media_type};base64,${src.data}`;
  if (src.url) return src.url;
  const fileId = lettaFileIdFromSource(src);
  if (fileId) return imageContentPath(fileId);
  return null;
}

export function imageSrcFromSource(source) {
  if (!source) return null;
  if (source.data && source.media_type) return `data:${source.media_type};base64,${source.data}`;
  if (source.url) return source.url;
  const fileId = lettaFileIdFromSource(source);
  if (fileId) return imageContentPath(fileId);
  return null;
}

export function previewSrcForAttachment(block) {
  return imageSrcFromBlock(block);
}
