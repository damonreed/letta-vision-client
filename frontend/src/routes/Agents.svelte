<script>
  import { onMount } from "svelte";
  import { api, modelHandle } from "../lib/api.js";
  import {
    activeConversationId,
    agents,
    clearSelectedAgent,
    pickConversationForAgent,
    saveSelectedAgent,
    selectedAgentId,
  } from "../lib/stores.js";
  import { defaultToolIds } from "../lib/tools.js";
  import { modelSupportsVision, modelsCache } from "../lib/stores.js";
  import FilteredSelect from "../lib/FilteredSelect.svelte";
  import ToolSelector from "../lib/ToolSelector.svelte";
  import BlockMemory from "../lib/BlockMemory.svelte";

  let agentList = $state([]);
  let selectedId = $state(null);
  let detail = $state(null);
  let blocks = $state([]);
  let allTools = $state([]);
  let models = $state([]);
  let modelObjects = $state([]);
  let embeddings = $state([]);
  let showCreate = $state(false);
  let error = $state("");
  let confirmDelete = $state(false);
  let attachedToolIds = $state([]);
  let toast = $state("");
  let agentSubtab = $state("blocks");

  let editingName = $state(false);
  let editName = $state("");
  let nameInput = $state(null);

  $effect(() => {
    if (editingName && nameInput) nameInput.focus();
  });
  let editingModel = $state(false);
  let editModel = $state("");
  let editingContextWindow = $state(false);
  let editContextWindow = $state("");
  let editingEmbedding = $state(false);
  let editEmbedding = $state("");
  let editingFilePreviewLimit = $state(false);
  let editFilePreviewLimit = $state("");

  let form = $state({
    name: "",
    model: "",
    context_window_limit: "",
    embedding: "",
    per_file_view_window_char_limit: "",
    persona: "",
    human: "",
    tools: [],
  });

  onMount(() => {
    loadAll();
    const u1 = agents.subscribe((a) => (agentList = a));
    const u2 = selectedAgentId.subscribe((id) => {
      selectedId = id;
      if (id) loadDetail(id);
    });
    return () => {
      u1();
      u2();
    };
  });

  async function loadAll() {
    error = "";
    try {
      const [a, m, e, t] = await Promise.all([
        api.listAgents(),
        api.listModels(),
        api.listEmbeddings(),
        api.listTools(),
      ]);
      agents.set(a);
      modelObjects = Array.isArray(m) ? m : [];
      models = uniqueHandles(modelObjects);
      modelsCache.set(modelObjects);
      embeddings = uniqueHandles(Array.isArray(e) ? e : []);
      allTools = t;
    } catch (err) {
      error = err.message;
    }
  }

  function setAgentSubtab(tab) {
    agentSubtab = tab;
  }

  async function loadDetail(id) {
    error = "";
    agentSubtab = "blocks";
    editingName = false;
    editingModel = false;
    editingContextWindow = false;
    editingEmbedding = false;
    editingFilePreviewLimit = false;
    try {
      detail = await api.getAgent(id);
      blocks = await api.listBlocks(id);
      attachedToolIds = (detail.tools || []).map((t) => t.id);
    } catch (err) {
      error = err.message;
    }
  }

  function selectAgent(id) {
    selectedAgentId.set(id);
    saveSelectedAgent(id);
    activeConversationId.set(pickConversationForAgent(id));
  }

  function findModelEntry(handle) {
    if (!handle || !modelObjects?.length) return null;
    return modelObjects.find(
      (m) =>
        modelHandle(m) === handle ||
        m.handle === handle ||
        m.model === handle ||
        m.name === handle,
    );
  }

  function defaultContextWindowForHandle(handle) {
    const m = findModelEntry(handle);
    const cw = m?.max_context_window ?? m?.context_window;
    return cw != null && Number(cw) > 0 ? Number(cw) : null;
  }

  function contextWindowPayloadForHandle(handle, explicitField = "") {
    if (String(explicitField).trim()) {
      return { context_window_limit: parsePositiveInt(explicitField) };
    }
    const cw = defaultContextWindowForHandle(handle);
    return cw ? { context_window_limit: cw } : {};
  }

  async function openCreate() {
    error = "";
    try {
      await refreshModels();
      const initialModel = models[0] || "";
      const initialCw = defaultContextWindowForHandle(initialModel);
      form = {
        name: "",
        model: initialModel,
        context_window_limit: initialCw ? String(initialCw) : "",
        embedding: embeddings[0] || "",
        per_file_view_window_char_limit: "",
        persona: "",
        human: "",
        tools: defaultToolIds(allTools),
      };
      showCreate = true;
    } catch (err) {
      error = err.message;
    }
  }

  $effect(() => {
    if (!showCreate || !form.model) return;
    const cw = defaultContextWindowForHandle(form.model);
    if (cw) form.context_window_limit = String(cw);
  });

  async function createAgent() {
    error = "";
    try {
      const created = await api.createAgent({
        name: form.name,
        model: form.model,
        embedding: form.embedding,
        persona: form.persona,
        human: form.human,
        tools: form.tools,
        ...contextWindowPayloadForHandle(form.model, form.context_window_limit),
        ...(form.per_file_view_window_char_limit
          ? {
              per_file_view_window_char_limit: parsePositiveInt(
                form.per_file_view_window_char_limit,
              ),
            }
          : {}),
      });
      showCreate = false;
      await loadAll();
      selectedAgentId.set(created.id);
      saveSelectedAgent(created.id);
      activeConversationId.set(pickConversationForAgent(created.id));
    } catch (err) {
      error = err.message;
    }
  }

  async function deleteAgent() {
    try {
      await api.deleteAgent(selectedId);
      selectedAgentId.set(null);
      clearSelectedAgent();
      detail = null;
      confirmDelete = false;
      await loadAll();
    } catch (err) {
      error = err.message;
    }
  }

  function showToast(msg) {
    toast = msg;
    setTimeout(() => {
      if (toast === msg) toast = "";
    }, 5000);
  }

  async function saveName() {
    const name = editName.trim();
    if (!name) {
      error = "Agent name cannot be empty";
      return;
    }
    error = "";
    try {
      await api.updateAgent(selectedId, { name });
      editingName = false;
      await loadAll();
      await loadDetail(selectedId);
    } catch (err) {
      error = err.message;
    }
  }

  function onNameKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveName();
    } else if (e.key === "Escape") {
      editingName = false;
    }
  }

  async function saveModel() {
    try {
      await api.updateAgent(selectedId, {
        model: editModel,
        ...contextWindowPayloadForHandle(editModel),
      });
      editingModel = false;
      await loadAll();
      await loadDetail(selectedId);
    } catch (err) {
      error = err.message;
    }
  }

  async function saveContextWindow() {
    try {
      await api.updateAgent(selectedId, {
        context_window_limit: parsePositiveInt(editContextWindow),
      });
      editingContextWindow = false;
      await loadAll();
      await loadDetail(selectedId);
    } catch (err) {
      error = err.message;
    }
  }

  async function saveEmbedding() {
    try {
      await api.updateAgent(selectedId, { embedding: editEmbedding });
      editingEmbedding = false;
      await loadDetail(selectedId);
    } catch (err) {
      error = err.message;
    }
  }

  async function saveFilePreviewLimit() {
    try {
      await api.updateAgent(selectedId, {
        per_file_view_window_char_limit: parsePositiveInt(editFilePreviewLimit),
      });
      editingFilePreviewLimit = false;
      await loadDetail(selectedId);
    } catch (err) {
      error = err.message;
    }
  }

  function startEditName() {
    editName = detail.name;
    editingName = true;
  }

  async function refreshModels() {
    const m = await api.listModels();
    modelObjects = Array.isArray(m) ? m : [];
    models = uniqueHandles(modelObjects);
    modelsCache.set(modelObjects);
    return models;
  }

  async function startEditModel() {
    error = "";
    try {
      await refreshModels();
      editModel = detail.model || "";
      editingModel = true;
    } catch (err) {
      error = err.message;
    }
  }

  function startEditContextWindow() {
    editContextWindow = String(agentContextWindow(detail) ?? "");
    editingContextWindow = true;
  }

  function startEditEmbedding() {
    editEmbedding = detail.embedding || "";
    editingEmbedding = true;
  }

  function startEditFilePreviewLimit() {
    editFilePreviewLimit = String(detail.per_file_view_window_char_limit ?? "");
    editingFilePreviewLimit = true;
  }

  function agentContextWindow(agent) {
    return agent?.llm_config?.context_window ?? agent?.context_window_limit ?? null;
  }

  function formatInt(value) {
    if (value == null || value === "") return "—";
    return Number(value).toLocaleString();
  }

  function parsePositiveInt(value) {
    const parsed = Number.parseInt(String(value).replace(/,/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Enter a positive whole number");
    }
    return parsed;
  }

  function uniqueHandles(items) {
    const handles = items.map(modelHandle);
    return [...new Set(handles)];
  }
</script>

<div class="agents-layout">
  <aside class="list">
    <div class="list-header">
      <h2>Agents</h2>
      <button onclick={openCreate}>+ Create</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
    <ul>
      {#each agentList as agent}
        <li>
          <button
            class:selected={agent.id === selectedId}
            onclick={() => selectAgent(agent.id)}
          >
            <strong>{agent.name}</strong>
            {#if modelSupportsVision(agent.model, modelObjects)}
              <span class="vision-badge" title="This agent's model can see images.">Vision</span>
            {/if}
            <span class="meta">{agent.model || "—"}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section class="detail">
    {#if detail}
      <div class="detail-header">
        {#if editingName}
          <div class="inline-edit">
            <input
              bind:this={nameInput}
              bind:value={editName}
              onkeydown={onNameKeydown}
            />
            <button onclick={saveName}>Save</button>
            <button class="muted" onclick={() => (editingName = false)}>Cancel</button>
          </div>
        {:else}
          <h2 class="editable-title">
            <span>{detail.name}</span>
            <button
              type="button"
              class="edit-btn"
              aria-label="Rename agent"
              title="Rename agent"
              onclick={startEditName}
            >
              ✎
            </button>
          </h2>
        {/if}
      </div>
      <dl class="meta-grid">
        <dt>ID</dt><dd><code>{detail.id}</code></dd>
        <dt>Model</dt>
        <dd>
          {#if editingModel}
            <div class="inline-edit stack">
              <FilteredSelect
                label=""
                options={models}
                bind:value={editModel}
                oncancel={() => (editingModel = false)}
              />
              <div class="btn-row">
                <button onclick={saveModel}>Save</button>
                <button class="muted" onclick={() => (editingModel = false)}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="linkish" onclick={startEditModel}>{detail.model || "—"}</button>
          {/if}
        </dd>
        <dt>Context window</dt>
        <dd>
          {#if editingContextWindow}
            <div class="inline-edit stack">
              <input
                type="number"
                min="1"
                step="1"
                bind:value={editContextWindow}
                placeholder="e.g. 128000"
              />
              <div class="btn-row">
                <button onclick={saveContextWindow}>Save</button>
                <button class="muted" onclick={() => (editingContextWindow = false)}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="linkish" onclick={startEditContextWindow}>
              {formatInt(agentContextWindow(detail))}
            </button>
          {/if}
        </dd>
        <dt>Embedding</dt>
        <dd>
          {#if editingEmbedding}
            <div class="inline-edit stack">
              <FilteredSelect
                label=""
                options={embeddings}
                bind:value={editEmbedding}
                oncancel={() => (editingEmbedding = false)}
              />
              <div class="btn-row">
                <button onclick={saveEmbedding}>Save</button>
                <button class="muted" onclick={() => (editingEmbedding = false)}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="linkish" onclick={startEditEmbedding}>
              {detail.embedding || "—"}
            </button>
          {/if}
        </dd>
        <dt>File preview limit</dt>
        <dd>
          {#if editingFilePreviewLimit}
            <div class="inline-edit stack">
              <input
                type="number"
                min="1"
                step="1"
                bind:value={editFilePreviewLimit}
                placeholder="e.g. 25000"
              />
              <div class="btn-row">
                <button onclick={saveFilePreviewLimit}>Save</button>
                <button class="muted" onclick={() => (editingFilePreviewLimit = false)}>
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <button class="linkish" onclick={startEditFilePreviewLimit}>
              {formatInt(detail.per_file_view_window_char_limit)}
            </button>
          {/if}
        </dd>
        <dt>Created</dt><dd>{detail.created_at}</dd>
      </dl>

      <div class="agent-workspace">
        <nav class="agent-subtabs" aria-label="Agent configuration">
          <button
            type="button"
            class:active={agentSubtab === "blocks"}
            onclick={() => setAgentSubtab("blocks")}
          >
            Memory Blocks
          </button>
          <button
            type="button"
            class:active={agentSubtab === "tools"}
            onclick={() => setAgentSubtab("tools")}
          >
            Tools
          </button>
        </nav>

        <div class="subtab-panel">
          {#if agentSubtab === "blocks"}
            <BlockMemory
              agentId={selectedId}
              agentName={detail.name}
              bind:blocks
              onError={(msg) => (error = msg)}
              onReload={() => loadDetail(selectedId)}
            />
          {:else}
            {#if toast}<p class="toast">{toast}</p>{/if}
            <ToolSelector
              {allTools}
              agentId={selectedId}
              bind:selectedIds={attachedToolIds}
              layout="master-detail"
              onError={showToast}
            />
          {/if}
        </div>
      </div>

      <div class="danger">
        {#if confirmDelete}
          <button class="danger-btn" onclick={deleteAgent}>Confirm delete</button>
          <button onclick={() => (confirmDelete = false)}>Cancel</button>
        {:else}
          <button class="danger-btn" onclick={() => (confirmDelete = true)}>
            Delete agent
          </button>
        {/if}
      </div>
    {:else}
      <p class="placeholder">Select an agent to view details</p>
    {/if}
  </section>
</div>

{#if showCreate}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (showCreate = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>Create agent</h2>
      <div class="modal-body">
        <label>Name <input bind:value={form.name} /></label>
        <FilteredSelect label="Model" options={models} bind:value={form.model} />
        <label>
          Context window
          <input
            type="number"
            min="1"
            step="1"
            bind:value={form.context_window_limit}
            placeholder="Filled from model catalog when you pick a model"
          />
          {#if form.model && defaultContextWindowForHandle(form.model)}
            <span class="catalog-hint">
              Catalog default: {defaultContextWindowForHandle(form.model).toLocaleString()} tokens
            </span>
          {/if}
        </label>
        <FilteredSelect label="Embedding" options={embeddings} bind:value={form.embedding} />
        <label>
          File preview limit
          <input
            type="number"
            min="1"
            step="1"
            bind:value={form.per_file_view_window_char_limit}
            placeholder="Optional — auto from context window if blank"
          />
        </label>
        <label>Persona <textarea bind:value={form.persona} rows="3"></textarea></label>
        <label>Human <textarea bind:value={form.human} rows="3"></textarea></label>
        <fieldset class="tools-fieldset">
          <legend>Tools</legend>
          <div class="tools-scroll">
            <ToolSelector {allTools} bind:selectedIds={form.tools} />
          </div>
        </fieldset>
      </div>
      <div class="modal-actions">
        <button onclick={createAgent}>Create</button>
        <button onclick={() => (showCreate = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .agents-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
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
  }
  .list li button.selected {
    background: #eff6ff;
  }
  .vision-badge { font-size: 0.7rem; color: #1d4ed8; margin-left: 0.35rem; }
  .meta {
    font-size: 0.75rem;
    color: #666;
  }
  .detail {
    padding: 1.25rem;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .agent-workspace {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-top: 1rem;
  }
  .agent-subtabs {
    display: flex;
    gap: 0;
    flex-shrink: 0;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 0;
  }
  .agent-subtabs button {
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    font-size: 0.9rem;
    color: #6b7280;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .agent-subtabs button:hover {
    color: #374151;
  }
  .agent-subtabs button.active {
    color: #2563eb;
    font-weight: 600;
    border-bottom-color: #2563eb;
  }
  .subtab-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding-top: 0.75rem;
    overflow: hidden;
  }
  .detail-header h2 {
    margin: 0 0 0.75rem;
  }
  .editable-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .edit-btn {
    background: none;
    border: none;
    padding: 0.15rem 0.35rem;
    color: #6b7280;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    border-radius: 4px;
  }
  .edit-btn:hover {
    color: #2563eb;
    background: #eff6ff;
  }
  .inline-edit input {
    font: inherit;
    font-size: 1.25rem;
    font-weight: 600;
    min-width: 12rem;
    padding: 0.15rem 0.35rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .detail-header,
  .meta-grid {
    flex-shrink: 0;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 0.35rem 1rem;
    font-size: 0.85rem;
    align-items: start;
  }
  .meta-grid input[type="number"] {
    width: 100%;
    max-width: 12rem;
    font: inherit;
    padding: 0.15rem 0.35rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .linkish {
    background: none;
    border: none;
    padding: 0;
    color: #2563eb;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .linkish:hover {
    text-decoration: underline;
  }
  .inline-edit {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .inline-edit.stack {
    flex-direction: column;
    align-items: stretch;
  }
  .btn-row {
    display: flex;
    gap: 0.35rem;
  }
  .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .toast {
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }
  .danger {
    flex-shrink: 0;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }
  .danger-btn {
    background: #dc2626;
    color: #fff;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
  }
  .placeholder {
    color: #888;
    margin-top: 3rem;
    text-align: center;
  }
  .error {
    color: #dc2626;
    padding: 0.5rem 1rem;
    margin: 0;
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
    width: min(90vw, 1600px);
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
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .catalog-hint {
    font-size: 0.8rem;
    color: #6b7280;
  }
  .modal-body input,
  .modal-body textarea {
    width: 100%;
  }
  .tools-fieldset {
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 0.75rem;
    margin: 0;
  }
  .tools-fieldset legend {
    padding: 0 0.35rem;
    font-weight: 600;
  }
  .tools-scroll {
    max-height: min(50vh, 480px);
    overflow-y: auto;
    margin-top: 0.5rem;
    padding-right: 0.25rem;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
  }
</style>
