/** Browser-side image normalization before send. */

export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};

const LS_PREFIX = "letta-vision-client/";
const DEFAULT_MAX_EDGE = 1920;
const DEFAULT_JPEG_QUALITY = 0.85;
const DEFAULT_MAX_UPLOAD = 20 * 1024 * 1024;

export function getImageSettings() {
  const maxEdge = Number(localStorage.getItem(`${LS_PREFIX}image-max-edge`) || DEFAULT_MAX_EDGE);
  const jpegQuality = Number(localStorage.getItem(`${LS_PREFIX}image-jpeg-quality`) || DEFAULT_JPEG_QUALITY);
  const preserveOriginal = localStorage.getItem(`${LS_PREFIX}image-preserve-original`) === "true";
  const maxUpload = DEFAULT_MAX_UPLOAD;
  return { maxEdge, jpegQuality, preserveOriginal, maxUpload };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string): { media_type: string; data: string } {
  const [header, data] = dataUrl.split(",", 2);
  const media_type = header.replace(/^data:/, "").split(";")[0] || "image/jpeg";
  return { media_type, data };
}

async function blobToImageBlock(blob: Blob, fileName = "image"): Promise<ImageBlock> {
  const { maxEdge, jpegQuality, preserveOriginal, maxUpload } = getImageSettings();
  if (blob.size > maxUpload) {
    throw new Error(`Image is too large (max ${Math.round(maxUpload / 1024 / 1024)} MiB).`);
  }
  if (preserveOriginal) {
    const dataUrl = await readFileAsDataUrl(new File([blob], fileName, { type: blob.type }));
    const { media_type, data } = dataUrlToBase64(dataUrl);
    return { type: "image", source: { type: "base64", media_type, data } };
  }
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const hasAlpha = blob.type === "image/png" || blob.type === "image/webp";
  const media_type = hasAlpha ? "image/png" : "image/jpeg";
  const quality = hasAlpha ? undefined : jpegQuality;
  const outBlob = await (canvas.convertToBlob
    ? canvas.convertToBlob({ type: media_type, quality })
    : new Promise<Blob>((res, rej) =>
        (canvas as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), media_type, quality)
      ));
  const dataUrl = await readFileAsDataUrl(new File([outBlob], fileName, { type: media_type }));
  const { data } = dataUrlToBase64(dataUrl);
  return { type: "image", source: { type: "base64", media_type, data } };
}

export async function fileToImageBlock(file: File): Promise<ImageBlock> {
  return blobToImageBlock(file, file.name);
}

export async function fetchUrlToImageBlock(url: string): Promise<ImageBlock> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) throw new Error(`URL did not return an image (content-type: ${ct || "unknown"})`);
  const blob = await res.blob();
  return blobToImageBlock(blob, url);
}

export function imageBlockDataUrl(block: ImageBlock): string {
  const { media_type, data } = block.source;
  return `data:${media_type};base64,${data}`;
}

export function buildMessageContent(text: string, imageBlock: ImageBlock | null): string | object[] {
  const parts: object[] = [];
  const trimmed = text.trim();
  if (trimmed) parts.push({ type: "text", text: trimmed });
  if (imageBlock) parts.push(imageBlock);
  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "text") return trimmed;
  return parts;
}
