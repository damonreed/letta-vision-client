const API = "/api";

import { normalizeOutgoingForSend } from "./chatFailures.js";

/** Parse FastAPI `{ detail: { error } }`, `{ detail: "..." }`, or `{ error }`. */
export function parseApiError(body, statusText = "") {
  if (!body || typeof body !== "object") return statusText || "Request failed";
  if (typeof body.error === "string" && body.error) return body.error;
  const detail = body.detail;
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object" && typeof detail.error === "string") {
    return detail.error;
  }
  return statusText || "Request failed";
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseApiError(err, res.statusText));
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listAgents: () => request("/agents"),
  getAgent: (id) => request(`/agents/${id}`),
  createAgent: (body) =>
    request("/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id, body) =>
    request(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  getSystemPromptTemplate: (key = "letta_v1") =>
    request(`/agents/system-prompt-template/${encodeURIComponent(key)}`),
  saveAgentSystem: (id, system) =>
    request(`/agents/${id}/system/save`, {
      method: "POST",
      body: JSON.stringify({ system }),
    }),
  deleteAgent: (id) =>
    request(`/agents/${id}`, { method: "DELETE" }),

  getHistory: (id, conversationId = null, { limit = 50, before, full = false } = {}) => {
    const params = new URLSearchParams();
    if (conversationId) params.set("conversation_id", conversationId);
    if (full) {
      params.set("full", "true");
    } else if (limit != null) {
      params.set("limit", String(limit));
    }
    if (before) params.set("before", before);
    const qs = params.toString();
    return request(`/agents/${id}/history${qs ? `?${qs}` : ""}`);
  },

  listConversations: (agentId) => request(`/agents/${agentId}/conversations`),
  createConversation: (agentId, name) =>
    request(`/agents/${agentId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ name: name || null }),
    }),
  updateConversation: (conversationId, name) =>
    request(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteConversation: (conversationId) =>
    request(`/conversations/${conversationId}`, { method: "DELETE" }),

  recompileContext: (agentId, conversationId) =>
    request(
      `/agents/${agentId}/conversations/${encodeURIComponent(conversationId)}/recompile-context`,
      { method: "POST" }
    ),

  listBlocks: (id) => request(`/agents/${id}/blocks`),
  updateBlock: (agentId, label, value) =>
    request(`/agents/${agentId}/blocks/${encodeURIComponent(label)}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),
  createBlock: (agentId, body) =>
    request(`/agents/${agentId}/blocks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  detachBlock: (agentId, blockId) =>
    request(`/agents/${agentId}/blocks/${encodeURIComponent(blockId)}`, {
      method: "DELETE",
    }),
  attachBlock: (agentId, blockId) =>
    request(`/agents/${agentId}/blocks/attach/${encodeURIComponent(blockId)}`, {
      method: "POST",
    }),

  listAllBlocks: () => request("/blocks"),
  createGlobalBlock: (body) =>
    request("/blocks", { method: "POST", body: JSON.stringify(body) }),
  getBlock: (blockId) => request(`/blocks/${encodeURIComponent(blockId)}`),
  updateGlobalBlock: (blockId, body) =>
    request(`/blocks/${encodeURIComponent(blockId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listBlockAgents: (blockId) =>
    request(`/blocks/${encodeURIComponent(blockId)}/agents`),

  listTools: () => request("/tools"),

  listMcpServers: () => request("/mcp/servers"),
  getMcpServer: (id) => request(`/mcp/servers/${id}`),
  createMcpServer: (body) =>
    request("/mcp/servers", { method: "POST", body: JSON.stringify(body) }),
  updateMcpServer: (id, body) =>
    request(`/mcp/servers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMcpServer: (id) =>
    request(`/mcp/servers/${id}`, { method: "DELETE" }),
  listMcpServerTools: (id) => request(`/mcp/servers/${id}/tools`),
  refreshMcpServer: (id, agentId = null) =>
    request(`/mcp/servers/${id}/refresh`, {
      method: "POST",
      body: JSON.stringify(agentId ? { agent_id: agentId } : {}),
    }),

  async *streamMcpConnect(mcpServerId, { signal } = {}) {
    const res = await fetch(`${API}/mcp/servers/${mcpServerId}/connect`, { signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseApiError(err, res.statusText));
    }
    const { parseMcpConnectStream } = await import("./mcpConnect.js");
    yield* parseMcpConnectStream(res);
  },
  attachTool: (agentId, toolId) =>
    request(`/agents/${agentId}/tools`, {
      method: "POST",
      body: JSON.stringify({ tool_id: toolId }),
    }),
  detachTool: (agentId, toolId) =>
    request(`/agents/${agentId}/tools/${toolId}`, { method: "DELETE" }),

  listModels: () => request("/models"),
  setModelVisionOverride: (handle, supports_vision) =>
    request(`/models/${encodeURIComponent(handle)}/vision`, {
      method: "PATCH",
      body: JSON.stringify({ supports_vision }),
    }),
  listEmbeddings: () => request("/embeddings"),

  listProviders: (categories = ["base", "byok"]) => {
    const params = new URLSearchParams();
    for (const c of categories) params.append("provider_category", c);
    const qs = params.toString();
    return request(`/providers${qs ? `?${qs}` : ""}`);
  },
  getProvider: (id) => request(`/providers/${id}`),
  createProvider: (body) =>
    request("/providers", { method: "POST", body: JSON.stringify(body) }),
  updateProvider: (id, body) =>
    request(`/providers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProvider: (id) =>
    request(`/providers/${id}`, { method: "DELETE" }),
  checkProvider: (body) =>
    request("/providers/check", { method: "POST", body: JSON.stringify(body) }),
  checkProviderById: (id) =>
    request(`/providers/${id}/check`, { method: "POST", body: "{}" }),
  refreshProvider: (id) =>
    request(`/providers/${id}/refresh`, { method: "POST", body: "{}" }),
  listProviderModels: (id) => request(`/providers/${id}/models`),

  listFolders: () => request("/folders"),
  createFolder: (body) =>
    request("/folders", { method: "POST", body: JSON.stringify(body) }),
  deleteFolder: (folderId) =>
    request(`/folders/${folderId}`, { method: "DELETE" }),
  listFolderFiles: (folderId) => request(`/folders/${folderId}/files`),
  uploadFolderFile: async (folderId, file, duplicateHandling = "replace") => {
    const form = new FormData();
    form.append("upload", file);
    const params = new URLSearchParams({ duplicate_handling: duplicateHandling });
    const res = await fetch(`${API}/folders/${folderId}/files?${params}`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseApiError(err, res.statusText));
    }
    return res.json();
  },
  deleteFolderFile: (folderId, fileId) =>
    request(`/folders/${folderId}/files/${fileId}`, { method: "DELETE" }),
  getFolderFile: (folderId, fileId, includeContent = true) => {
    const params = new URLSearchParams();
    params.set("include_content", includeContent ? "true" : "false");
    return request(`/folders/${folderId}/files/${fileId}?${params}`);
  },
  createTextFile: (folderId, body) =>
    request(`/folders/${folderId}/files/text`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listAgentFolders: (agentId) => request(`/agents/${agentId}/folders`),
  attachFolderToAgent: (agentId, folderId) =>
    request(`/agents/${agentId}/folders/${folderId}/attach`, { method: "POST" }),
  detachFolderFromAgent: (agentId, folderId) =>
    request(`/agents/${agentId}/folders/${folderId}/detach`, { method: "DELETE" }),

  getFileCore: (fileId) => request(`/files/${fileId}/core`),
  patchFileCore: (fileId, summary) =>
    request(`/files/${fileId}/core`, {
      method: "PATCH",
      body: JSON.stringify({ summary }),
    }),
  listOpenFiles: (agentId) => request(`/agents/${agentId}/open-files`),
  closeOpenFile: (agentId, fileId) =>
    request(`/agents/${agentId}/open-files/${fileId}/close`, { method: "POST" }),
  listFileArchives: (fileId) => request(`/files/${fileId}/archives`),
  searchFileArchives: (body) =>
    request("/file-archives/search", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listImages: ({ limit, enrichmentStatus, afterCreatedAt, afterId } = {}) => {
    const params = new URLSearchParams();
    if (limit != null) params.set("limit", String(limit));
    if (enrichmentStatus) params.set("enrichment_status", enrichmentStatus);
    if (afterCreatedAt) {
      const cursor = String(afterCreatedAt).replace(
        /^(.+T\d{2}:\d{2}:\d{2}(?:\.\d+)?) (\d{2}:\d{2})$/,
        "$1+$2",
      );
      params.set("after_created_at", cursor);
    }
    if (afterId) params.set("after_id", afterId);
    const q = params.toString();
    return request(q ? `/images?${q}` : "/images");
  },
  searchImages: (query, limit = 10) =>
    request("/images/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    }),
  getImage: (id) => request(`/images/${id}`),
  updateImage: (id, body) =>
    request(`/images/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteImage: (id) => request(`/images/${id}`, { method: "DELETE" }),
  reEnrichImage: (id) => request(`/images/${id}/re-enrich`, { method: "POST" }),
  getImageUrl: (id) => request(`/images/${id}/url`),

  async *streamMessage(agentId, content, conversationId = null, { signal } = {}) {
    const payloadContent = normalizeOutgoingForSend(content) ?? content;
    const params = conversationId
      ? `?conversation_id=${encodeURIComponent(conversationId)}`
      : "";
    const res = await fetch(`${API}/agents/${agentId}/messages${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: payloadContent }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(parseApiError(err, res.statusText));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawTerminal = false;
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event?.type === "done" || event?.type === "error") {
                sawTerminal = true;
              }
              yield event;
            } catch {
              /* skip malformed */
            }
          }
        }
      }
    }
    if (!signal?.aborted && !sawTerminal) {
      yield { type: "stream_end" };
    }
  },
};

export function modelHandle(m) {
  if (typeof m === "string") return m;
  return m?.handle || m?.embedding_model || m?.model || m?.name || String(m);
}
