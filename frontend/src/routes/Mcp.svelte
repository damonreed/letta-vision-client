<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import {
    agents,
    saveSelectedAgent,
    selectedAgentId,
  } from "../lib/stores.js";
  import ToolSelector from "../lib/ToolSelector.svelte";
  import {
    emptyMcpForm,
    formToCreatePayload,
    serverEndpointSummary,
    serverToForm,
    transportLabel,
  } from "../lib/mcpHelpers.js";

  let serverList = $state([]);
  let selectedId = $state(null);
  let selectedServer = $state(null);
  let serverTools = $state([]);
  let allTools = $state([]);
  let agentList = $state([]);
  let agentId = $state(null);
  let attachedToolIds = $state([]);
  let error = $state("");
  let toast = $state("");

  let showModal = $state(false);
  let editingId = $state(null);
  let form = $state(emptyMcpForm());
  let confirmDelete = $state(false);

  let connecting = $state(false);
  let connectLog = $state([]);
  let connectStatus = $state("");
  let refreshing = $state(false);
  let lastRefresh = $state(null);

  const selected = $derived(
    serverList.find((s) => s.id === selectedId) ?? selectedServer,
  );

  onMount(() => {
    loadServers();
    api.listAgents().then((a) => agents.set(a)).catch(() => {});
    api.listTools().then((t) => (allTools = t)).catch(() => {});
    const u1 = agents.subscribe((a) => (agentList = a));
    const u2 = selectedAgentId.subscribe((id) => {
      agentId = id;
      if (id && selectedId) loadAgentTools(id);
      else attachedToolIds = [];
    });
    return () => {
      u1();
      u2();
    };
  });

  async function loadServers() {
    error = "";
    try {
      serverList = await api.listMcpServers();
      if (selectedId && !serverList.some((s) => s.id === selectedId)) {
        selectedId = null;
        selectedServer = null;
        serverTools = [];
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function selectServer(id) {
    selectedId = id;
    error = "";
    connectLog = [];
    connectStatus = "";
    lastRefresh = null;
    try {
      const [server, tools] = await Promise.all([
        api.getMcpServer(id),
        api.listMcpServerTools(id),
      ]);
      selectedServer = server;
      serverTools = tools;
      if (agentId) await loadAgentTools(agentId);
    } catch (err) {
      error = err.message;
    }
  }

  async function loadAgentTools(id) {
    try {
      const agent = await api.getAgent(id);
      attachedToolIds = (agent.tools || []).map((t) => t.id);
    } catch (err) {
      attachedToolIds = [];
    }
  }

  function selectAgent(id) {
    const aid = id || null;
    selectedAgentId.set(aid);
    if (aid) saveSelectedAgent(aid);
    if (aid) loadAgentTools(aid);
    else attachedToolIds = [];
  }

  function openCreate() {
    editingId = null;
    form = emptyMcpForm("sse");
    showModal = true;
  }

  function openEdit() {
    if (!selected) return;
    editingId = selected.id;
    form = serverToForm(selected);
    showModal = true;
  }

  async function saveServer() {
    error = "";
    try {
      const payload = formToCreatePayload(form);
      if (editingId) {
        await api.updateMcpServer(editingId, {
          server_name: payload.server_name,
          config: payload.config,
        });
        showModal = false;
        await loadServers();
        await selectServer(editingId);
      } else {
        const created = await api.createMcpServer(payload);
        showModal = false;
        await loadServers();
        await selectServer(created.id);
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function deleteServer() {
    if (!selectedId) return;
    error = "";
    try {
      await api.deleteMcpServer(selectedId);
      selectedId = null;
      selectedServer = null;
      serverTools = [];
      confirmDelete = false;
      await loadServers();
    } catch (err) {
      error = err.message;
    }
  }

  async function refreshTools() {
    if (!selectedId) return;
    refreshing = true;
    error = "";
    try {
      lastRefresh = await api.refreshMcpServer(selectedId, agentId);
      serverTools = await api.listMcpServerTools(selectedId);
      allTools = await api.listTools();
      toast = "Tools refreshed";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    } finally {
      refreshing = false;
    }
  }

  async function runConnect() {
    if (!selectedId) return;
    connecting = true;
    connectLog = [];
    connectStatus = "Connecting…";
    error = "";
    const controller = new AbortController();
    try {
      for await (const evt of api.streamMcpConnect(selectedId, {
        signal: controller.signal,
      })) {
        const line = formatConnectEvent(evt);
        connectLog = [...connectLog, line];
        if (evt.event === "authorization_url" && evt.url) {
          window.open(evt.url, "_blank", "noopener,noreferrer");
          connectStatus = "Waiting for OAuth…";
        } else if (evt.event === "waiting_for_auth") {
          connectStatus = "Waiting for OAuth…";
        } else if (evt.event === "success") {
          connectStatus = "Connected";
          await refreshTools();
        } else if (evt.event === "error") {
          connectStatus = "Error";
          error = evt.message || "Connection failed";
        } else if (evt.event === "connection_attempt") {
          connectStatus = "Connecting…";
        }
      }
      if (connectStatus === "Connecting…") connectStatus = "Done";
    } catch (err) {
      connectStatus = "Error";
      error = err.message;
    } finally {
      connecting = false;
    }
  }

  function formatConnectEvent(evt) {
    const t = evt.event || "message";
    if (t === "authorization_url") return `OAuth: open authorization URL`;
    if (t === "success") {
      const n = evt.tools?.length;
      return n != null ? `Success (${n} tools discovered)` : "Success";
    }
    if (evt.message) return `${t}: ${evt.message}`;
    return t;
  }

  function toolLabel(t) {
    return t.name || t.id;
  }
</script>

<div class="mcp-layout">
  <aside class="list">
    <div class="list-header">
      <h2>MCP Servers</h2>
      <button onclick={openCreate}>+ Add</button>
    </div>
    {#if error && !selected}<p class="error">{error}</p>{/if}
    <ul>
      {#each serverList as server}
        <li>
          <button
            class:selected={server.id === selectedId}
            onclick={() => selectServer(server.id)}
          >
            <strong>{server.server_name}</strong>
            <span class="meta">{transportLabel(server.mcp_server_type)}</span>
            {#if serverTools.length && server.id === selectedId}
              <span class="badge">{serverTools.length} tools</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if serverList.length === 0}
      <p class="hint">No MCP servers yet. Add one to get started.</p>
    {/if}
  </aside>

  <section class="detail">
    {#if selected}
      <div class="detail-header">
        <h2>{selected.server_name}</h2>
        <div class="header-actions">
          <button disabled={connecting} onclick={runConnect}>
            {connecting ? "Connecting…" : "Connect"}
          </button>
          <button disabled={refreshing} onclick={refreshTools}>
            {refreshing ? "Refreshing…" : "Refresh tools"}
          </button>
          <button class="muted" onclick={openEdit}>Edit</button>
        </div>
      </div>

      {#if toast}<p class="toast">{toast}</p>{/if}
      {#if error}<p class="error">{error}</p>{/if}
      {#if connectStatus}
        <p class="connect-status">Status: <strong>{connectStatus}</strong></p>
      {/if}

      <dl class="meta-grid">
        <dt>ID</dt><dd><code>{selected.id}</code></dd>
        <dt>Transport</dt><dd>{transportLabel(selected.mcp_server_type)}</dd>
        <dt>Endpoint</dt><dd class="endpoint">{serverEndpointSummary(selected)}</dd>
      </dl>

      {#if connectLog.length}
        <details class="connect-log">
          <summary>Connection log ({connectLog.length})</summary>
          <ol>
            {#each connectLog as line}
              <li>{line}</li>
            {/each}
          </ol>
        </details>
      {/if}

      {#if lastRefresh}
        <div class="refresh-summary">
          <h3>Last refresh</h3>
          <p>
            Added: {(lastRefresh.added || []).join(", ") || "—"} · Updated:
            {(lastRefresh.updated || []).join(", ") || "—"} · Deleted:
            {(lastRefresh.deleted || []).join(", ") || "—"}
          </p>
        </div>
      {/if}

      <div class="tools-section">
        <h3>Synced tools ({serverTools.length})</h3>
        {#if serverTools.length === 0}
          <p class="hint">No tools in Letta yet. Connect and Refresh tools.</p>
        {:else}
          <table class="tools-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {#each serverTools as tool}
                <tr>
                  <td>{toolLabel(tool)}</td>
                  <td><code class="small">{tool.id}</code></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <div class="attach-section">
        <h3>Attach tools to agent</h3>
        <p class="hint">
          MCP servers are org-wide. Agents use synced tools via attach (not a
          separate server connection).
        </p>
        <div class="agent-bar">
          <label>
            Agent
            <select
              value={agentId ?? ""}
              onchange={(e) => selectAgent(e.currentTarget.value || null)}
            >
              <option value="">— select agent —</option>
              {#each agentList as agent}
                <option value={agent.id}>{agent.name}</option>
              {/each}
            </select>
          </label>
        </div>
        {#if agentId && serverTools.length}
          <ToolSelector
            allTools={serverTools}
            bind:selectedIds={attachedToolIds}
            agentId={agentId}
            onError={(msg) => (error = msg)}
          />
        {:else if agentId}
          <p class="hint">Refresh tools first, then attach them here.</p>
        {/if}
      </div>

      <div class="danger">
        {#if confirmDelete}
          <p>Delete MCP server <strong>{selected.server_name}</strong>?</p>
          <button class="danger-btn" onclick={deleteServer}>Confirm delete</button>
          <button class="muted" onclick={() => (confirmDelete = false)}>Cancel</button>
        {:else}
          <button class="danger-btn" onclick={() => (confirmDelete = true)}>
            Delete server
          </button>
        {/if}
      </div>
    {:else}
      <p class="placeholder">Select an MCP server to configure</p>
    {/if}
  </section>
</div>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (showModal = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>{editingId ? "Edit MCP server" : "Add MCP server"}</h2>
      <div class="modal-body">
        <label>
          Server name
          <input bind:value={form.server_name} placeholder="zapimage" />
        </label>
        <label>
          Transport
          <select bind:value={form.mcp_server_type} disabled={!!editingId}>
            <option value="sse">SSE (HTTP)</option>
            <option value="streamable_http">Streamable HTTP</option>
            <option value="stdio">Stdio (local command)</option>
          </select>
        </label>
        {#if form.mcp_server_type === "stdio"}
          <label>Command <input bind:value={form.command} /></label>
          <label>
            Args (one per line or comma-separated)
            <textarea bind:value={form.args_text} rows="3"></textarea>
          </label>
          <label>
            Env JSON (optional)
            <textarea bind:value={form.env_json} rows="2" placeholder="&#123;&#125;"></textarea>
          </label>
          <p class="hint">
            Stdio runs inside the Letta server container — paths must exist there.
          </p>
        {:else}
          <label>Server URL <input bind:value={form.server_url} /></label>
          <label>Auth header name <input bind:value={form.auth_header} placeholder="Authorization" /></label>
          <label>Auth token <input bind:value={form.auth_token} type="password" /></label>
          <label>
            Custom headers JSON (optional)
            <textarea bind:value={form.custom_headers_json} rows="2" placeholder="&#123;&#125;"></textarea>
          </label>
        {/if}
      </div>
      <div class="modal-actions">
        <button onclick={saveServer} disabled={!form.server_name.trim()}>Save</button>
        <button class="muted" onclick={() => (showModal = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .mcp-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: calc(100vh - 52px);
  }
  .list {
    border-right: 1px solid #ddd;
    background: #fff;
    overflow-y: auto;
  }
  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #eee;
  }
  .list-header h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list li button {
    width: 100%;
    text-align: left;
    padding: 0.6rem 1rem;
    border: none;
    background: none;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: flex-start;
    cursor: pointer;
  }
  .list li button.selected {
    background: #eff6ff;
  }
  .meta {
    font-size: 0.75rem;
    color: #666;
  }
  .badge {
    font-size: 0.65rem;
    background: #e0e7ff;
    color: #3730a3;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .hint {
    margin: 0.5rem 1rem;
    font-size: 0.8rem;
    color: #666;
  }
  .detail {
    padding: 1rem 1.25rem;
    overflow-y: auto;
    background: #fafafa;
  }
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .detail-header h2 {
    margin: 0;
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.35rem 1rem;
    margin: 1rem 0;
    font-size: 0.9rem;
  }
  .endpoint {
    word-break: break-all;
  }
  .connect-status {
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }
  .connect-log {
    margin: 0.75rem 0;
    font-size: 0.85rem;
  }
  .connect-log ol {
    margin: 0.35rem 0 0;
    padding-left: 1.25rem;
  }
  .refresh-summary {
    font-size: 0.85rem;
    margin: 0.75rem 0;
  }
  .refresh-summary h3 {
    margin: 0 0 0.25rem;
    font-size: 0.9rem;
  }
  .tools-section,
  .attach-section {
    margin-top: 1.5rem;
  }
  .tools-section h3,
  .attach-section h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .tools-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    background: #fff;
  }
  .tools-table th,
  .tools-table td {
    border: 1px solid #e5e5e5;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }
  .small {
    font-size: 0.75rem;
  }
  .agent-bar {
    margin: 0.75rem 0;
  }
  .agent-bar label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    max-width: 20rem;
  }
  .placeholder {
    color: #888;
    margin-top: 3rem;
    text-align: center;
  }
  .error {
    color: #dc2626;
  }
  .toast {
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .danger {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }
  .danger-btn {
    background: #dc2626;
    color: #fff;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal {
    background: #fff;
    border-radius: 8px;
    width: min(90vw, 560px);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }
  .modal h2 {
    margin: 0;
    padding: 1.25rem 1.5rem 0;
  }
  .modal-body {
    padding: 1rem 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
  }
</style>
