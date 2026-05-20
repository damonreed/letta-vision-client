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

export function imageSrcFromBlock(block) {
  const src = block?.source;
  if (!src) return null;
  if (src.data && src.media_type) return `data:${src.media_type};base64,${src.data}`;
  if (src.url) return src.url;
  return null;
}

export function imageSrcFromSource(source) {
  if (!source) return null;
  if (source.data && source.media_type) return `data:${source.media_type};base64,${source.data}`;
  if (source.url) return source.url;
  return null;
}

export function previewSrcForAttachment(block) {
  return imageSrcFromBlock(block);
}
