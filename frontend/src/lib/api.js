const API = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
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
  deleteAgent: (id) =>
    request(`/agents/${id}`, { method: "DELETE" }),

  getHistory: (id, conversationId = null) => {
    const params = new URLSearchParams();
    if (conversationId) params.set("conversation_id", conversationId);
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
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
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
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },
  deleteFolderFile: (folderId, fileId) =>
    request(`/folders/${folderId}/files/${fileId}`, { method: "DELETE" }),

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

  async *streamMessage(agentId, content, conversationId = null, { signal } = {}) {
    const params = conversationId
      ? `?conversation_id=${encodeURIComponent(conversationId)}`
      : "";
    const res = await fetch(`${API}/agents/${agentId}/messages${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
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
