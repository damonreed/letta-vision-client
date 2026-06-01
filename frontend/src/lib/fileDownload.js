/** Trigger a browser download from string or Blob content. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadTextContent(content, filename, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content ?? ""], { type: mimeType });
  downloadBlob(blob, filename);
}

export function fileDisplayName(file) {
  return file?.file_name || file?.original_file_name || file?.id || "file";
}

export function guessDownloadMimeType(filename, fileType) {
  if (fileType) return fileType;
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".md")) return "text/markdown;charset=utf-8";
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain;charset=utf-8";
  return "text/plain;charset=utf-8";
}
