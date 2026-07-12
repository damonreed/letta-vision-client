<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { modelsCache } from "../lib/stores.js";
  import {
    BYOK_PROVIDER_TYPES,
    categoryLabel,
    emptyProviderForm,
    envHintsForProvider,
    formToCheckPayload,
    formToCreatePayload,
    formToUpdatePayload,
    formatSyncedAt,
    isBaseProvider,
    providerToForm,
    providerTypeLabel,
  } from "../lib/providerHelpers.js";

  let providerList = $state([]);
  let selectedId = $state(null);
  let selectedProvider = $state(null);
  let providerModels = $state([]);
  let error = $state("");
  let toast = $state("");

  let showModal = $state(false);
  let editingId = $state(null);
  let form = $state(emptyProviderForm());
  let confirmDelete = $state(false);

  let checking = $state(false);
  let refreshing = $state(false);
  let modelFilter = $state("");

  const selected = $derived(
    providerList.find((p) => p.id === selectedId) ?? selectedProvider,
  );

  const baseProviders = $derived(
    [...providerList]
      .filter((p) => p.provider_category === "base")
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const byokProviders = $derived(
    [...providerList]
      .filter((p) => p.provider_category === "byok")
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const filteredProviderModels = $derived.by(() => {
    const q = modelFilter.trim().toLowerCase();
    const sorted = [...providerModels].sort((a, b) =>
      String(a.handle || a.name || "").localeCompare(
        String(b.handle || b.name || ""),
        undefined,
        { sensitivity: "base" },
      ),
    );
    if (!q) return sorted;
    return sorted.filter((m) => {
      const handle = String(m.handle || "").toLowerCase();
      const name = String(m.name || "").toLowerCase();
      const ctx = String(m.max_context_window ?? m.context_window ?? "");
      return handle.includes(q) || name.includes(q) || ctx.includes(q);
    });
  });

  onMount(() => {
    loadProviders();
  });

  async function loadProviders() {
    error = "";
    try {
      providerList = await api.listProviders();
      if (selectedId && !providerList.some((p) => p.id === selectedId)) {
        selectedId = null;
        selectedProvider = null;
        providerModels = [];
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function selectProvider(id) {
    selectedId = id;
    modelFilter = "";
    error = "";
    const fromList = providerList.find((p) => p.id === id);
    if (fromList) selectedProvider = fromList;
    try {
      providerModels = await api.listProviderModels(id);
    } catch (err) {
      providerModels = [];
      error = err.message;
    }
    try {
      selectedProvider = await api.getProvider(id);
    } catch (err) {
      if (!fromList) error = err.message;
    }
  }

  function openCreate() {
    editingId = null;
    form = emptyProviderForm();
    showModal = true;
  }

  function openEdit() {
    if (!selected || isBaseProvider(selected)) return;
    editingId = selected.id;
    form = providerToForm(selected);
    showModal = true;
  }

  async function saveProvider() {
    error = "";
    try {
      if (editingId) {
        if (!form.api_key.trim()) {
          error = "API key is required when updating a provider";
          return;
        }
        await api.updateProvider(editingId, formToUpdatePayload(form));
        showModal = false;
        await loadProviders();
        await selectProvider(editingId);
        toast = "Provider updated";
      } else {
        if (!form.name.trim() || !form.api_key.trim()) {
          error = "Name and API key are required";
          return;
        }
        const created = await api.createProvider(formToCreatePayload(form));
        showModal = false;
        await loadProviders();
        await selectProvider(created.id);
        toast = "Provider created";
      }
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    }
  }

  async function runCheck() {
    if (!selected) return;
    checking = true;
    error = "";
    try {
      if (isBaseProvider(selected)) {
        await api.checkProviderById(selected.id);
      } else if (form.api_key.trim() && showModal) {
        await api.checkProvider(formToCheckPayload(form));
      } else if (!isBaseProvider(selected)) {
        await api.checkProviderById(selected.id);
      }
      toast = "API key verified";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    } finally {
      checking = false;
    }
  }

  async function checkFromModal() {
    if (!form.api_key.trim()) {
      error = "Enter an API key to test";
      return;
    }
    checking = true;
    error = "";
    try {
      await api.checkProvider(formToCheckPayload(form));
      toast = "API key verified";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    } finally {
      checking = false;
    }
  }

  async function refreshModels() {
    if (!selectedId) return;
    refreshing = true;
    error = "";
    try {
      await api.refreshProvider(selectedId);
      selectedProvider = await api.getProvider(selectedId);
      providerModels = await api.listProviderModels(selectedId);
      modelsCache.set(await api.listModels());
      await loadProviders();
      toast = "Models refreshed";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    } finally {
      refreshing = false;
    }
  }

  function effectiveVision(model) {
    if (model?.vision_override != null) return Boolean(model.vision_override);
    return Boolean(model?.supports_vision);
  }

  async function setVisionOverride(model, supports_vision) {
    const handle = model.handle || model.name;
    if (!handle) return;
    error = "";
    try {
      await api.setModelVisionOverride(handle, supports_vision);
      providerModels = await api.listProviderModels(selectedId);
      modelsCache.set(await api.listModels());
      toast =
        supports_vision == null
          ? "Vision: auto-detect"
          : supports_vision
            ? "Vision enabled (manual)"
            : "Vision disabled (manual)";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    }
  }

  async function deleteProvider() {
    if (!selectedId) return;
    error = "";
    try {
      await api.deleteProvider(selectedId);
      selectedId = null;
      selectedProvider = null;
      providerModels = [];
      confirmDelete = false;
      await loadProviders();
      toast = "Provider deleted";
      setTimeout(() => (toast = ""), 3000);
    } catch (err) {
      error = err.message;
    }
  }

  function showBaseUrlField(type) {
    return [
      "openai",
      "azure",
      "ollama",
      "vllm",
      "sglang",
      "together",
      "google_ai",
    ].includes(type);
  }

  function showBedrockFields(type) {
    return type === "bedrock";
  }
</script>

<div class="providers-layout">
  <aside class="list">
    <div class="list-header">
      <h2>Providers</h2>
      <button onclick={openCreate}>+ Add BYOK</button>
    </div>
    {#if error && !selected}<p class="error">{error}</p>{/if}

    {#if baseProviders.length}
      <p class="section-label">Built-in (server env)</p>
      <ul>
        {#each baseProviders as provider}
          <li>
            <button
              class:selected={provider.id === selectedId}
              onclick={() => selectProvider(provider.id)}
            >
              <strong>{provider.name}</strong>
              <span class="meta">{providerTypeLabel(provider.provider_type)}</span>
              <span class="badge base">built-in</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if byokProviders.length}
      <p class="section-label">Bring your own key</p>
      <ul>
        {#each byokProviders as provider}
          <li>
            <button
              class:selected={provider.id === selectedId}
              onclick={() => selectProvider(provider.id)}
            >
              <strong>{provider.name}</strong>
              <span class="meta">{providerTypeLabel(provider.provider_type)}</span>
              <span class="badge byok">BYOK</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if providerList.length === 0}
      <p class="hint">No providers synced yet. Check letta-vision server env keys.</p>
    {/if}
  </aside>

  <section class="detail">
    {#if selected}
      <div class="detail-header">
        <h2>{selected.name}</h2>
        <div class="header-actions">
          <button disabled={checking} onclick={runCheck}>
            {checking ? "Checking…" : "Test connection"}
          </button>
          <button disabled={refreshing} onclick={refreshModels}>
            {refreshing ? "Refreshing…" : "Refresh models"}
          </button>
          {#if !isBaseProvider(selected)}
            <button class="muted" onclick={openEdit}>Edit</button>
          {/if}
        </div>
      </div>

      {#if toast}<p class="toast">{toast}</p>{/if}
      {#if error}<p class="error">{error}</p>{/if}

      <dl class="meta-grid">
        <dt>Category</dt>
        <dd>{categoryLabel(selected.provider_category)}</dd>
        <dt>Type</dt>
        <dd>{providerTypeLabel(selected.provider_type)}</dd>
        <dt>Base URL</dt>
        <dd class="endpoint">{selected.base_url || "—"}</dd>
        <dt>Region</dt>
        <dd>{selected.region || "—"}</dd>
        <dt>Last synced</dt>
        <dd>{formatSyncedAt(selected.last_synced)}</dd>
        <dt>ID</dt>
        <dd><code>{selected.id}</code></dd>
      </dl>

      {#if isBaseProvider(selected)}
        <div class="env-box">
          <h3>Server configuration</h3>
          <p class="hint">
            Built-in providers are enabled via environment variables on the
            <strong>letta-vision</strong> container. Edit
            <code>letta-vision-deploy/.env</code> and restart the stack to change
            them.
          </p>
          <ul class="env-vars">
            {#each envHintsForProvider(selected) as v}
              <li><code>{v}</code></li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="models-section">
        <div class="models-section-header">
          <h3>LLM models ({providerModels.length})</h3>
          {#if providerModels.length > 0}
            <label class="model-filter">
              <span class="sr-only">Filter models</span>
              <input
                type="search"
                bind:value={modelFilter}
                placeholder="Filter by handle, name, or context…"
                autocomplete="off"
              />
              {#if modelFilter.trim()}
                <button
                  type="button"
                  class="clear-filter muted"
                  onclick={() => (modelFilter = "")}
                  title="Clear filter"
                >
                  Clear
                </button>
              {/if}
            </label>
          {/if}
        </div>
        {#if providerModels.length === 0}
          <p class="hint">No models listed for this provider yet.</p>
        {:else if filteredProviderModels.length === 0}
          <p class="hint">No models match “{modelFilter.trim()}”.</p>
        {:else}
          <p class="hint models-count">
            {#if modelFilter.trim()}
              Showing {filteredProviderModels.length} of {providerModels.length} models
            {:else}
              {filteredProviderModels.length} models — scroll to browse
            {/if}
          </p>
          <div class="models-table-wrap">
            <table class="models-table">
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Name</th>
                  <th>Context</th>
                  <th>Vision</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredProviderModels as model (model.handle || model.name)}
                  <tr>
                    <td><code class="small">{model.handle || "—"}</code></td>
                    <td class="model-name">{model.name || "—"}</td>
                    <td>{model.max_context_window ?? model.context_window ?? "—"}</td>
                    <td class="vision-cell">
                      <span
                        class="vision-pill"
                        class:on={effectiveVision(model)}
                        title={model.vision_override != null
                          ? "Manual override"
                          : "From server registry"}
                      >
                        {effectiveVision(model) ? "Yes" : "No"}
                        {#if model.vision_override != null}
                          <span class="vision-manual">manual</span>
                        {/if}
                      </span>
                      <div class="vision-actions">
                        <button
                          type="button"
                          class="linkish small"
                          onclick={() =>
                            setVisionOverride(model, !effectiveVision(model))}
                        >
                          {effectiveVision(model) ? "Turn off" : "Turn on"}
                        </button>
                        {#if model.vision_override != null}
                          <button
                            type="button"
                            class="linkish small"
                            onclick={() => setVisionOverride(model, null)}
                          >
                            Auto
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      {#if !isBaseProvider(selected)}
        <div class="danger">
          {#if confirmDelete}
            <p>Delete provider <strong>{selected.name}</strong>?</p>
            <button class="danger-btn" onclick={deleteProvider}>Confirm delete</button>
            <button class="muted" onclick={() => (confirmDelete = false)}>Cancel</button>
          {:else}
            <button class="danger-btn" onclick={() => (confirmDelete = true)}>
              Delete provider
            </button>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="placeholder">Select a provider to view details</p>
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
      <h2>{editingId ? "Edit BYOK provider" : "Add BYOK provider"}</h2>
      <p class="hint">
        Use <strong>OpenAI-compatible</strong> for gateways like
        <a href="https://docs.siliconflow.com/en/userguide/quickstart" target="_blank" rel="noopener noreferrer">SiliconFlow</a>
        (<code>https://api.siliconflow.com/v1</code>).
      </p>
      <div class="modal-body">
        {#if !editingId}
          <label>
            Name (handle prefix)
            <input bind:value={form.name} placeholder="siliconflow" />
          </label>
        {/if}
        <label>
          Provider type
          <select bind:value={form.provider_type} disabled={!!editingId}>
            {#each BYOK_PROVIDER_TYPES as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
        <label>
          API key
          <input bind:value={form.api_key} type="password" autocomplete="off" />
        </label>
        {#if showBaseUrlField(form.provider_type)}
          <label>
            Base URL
            <input bind:value={form.base_url} placeholder="https://api.siliconflow.com/v1" />
          </label>
        {/if}
        {#if showBedrockFields(form.provider_type)}
          <label>Access key <input bind:value={form.access_key} type="password" /></label>
          <label>Region <input bind:value={form.region} placeholder="us-east-1" /></label>
        {/if}
        {#if form.provider_type === "azure"}
          <label>API version <input bind:value={form.api_version} placeholder="2024-09-01-preview" /></label>
        {/if}
      </div>
      <div class="modal-actions">
        <button onclick={checkFromModal} disabled={checking || !form.api_key.trim()} class="muted">
          {checking ? "Checking…" : "Test key"}
        </button>
        <button
          onclick={saveProvider}
          disabled={!editingId && (!form.name.trim() || !form.api_key.trim())}
        >
          Save
        </button>
        <button class="muted" onclick={() => (showModal = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .providers-layout {
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
    font-size: 1rem;
  }
  .section-label {
    margin: 0.75rem 1rem 0.25rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7280;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.65rem 1rem;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    background: #fff;
    cursor: pointer;
  }
  ul button.selected {
    background: #eff6ff;
  }
  ul button strong {
    display: block;
  }
  .meta {
    font-size: 0.8rem;
    color: #666;
  }
  .badge {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
  .badge.base {
    background: #e0e7ff;
    color: #3730a3;
  }
  .badge.byok {
    background: #dcfce7;
    color: #166534;
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
    margin-bottom: 1rem;
  }
  .detail-header h2 {
    margin: 0;
  }
  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: 0.35rem 1rem;
    margin-bottom: 1.25rem;
    font-size: 0.9rem;
  }
  .meta-grid dt {
    color: #666;
    margin: 0;
  }
  .meta-grid dd {
    margin: 0;
  }
  .endpoint {
    word-break: break-all;
  }
  .env-box {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1.25rem;
  }
  .env-box h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .env-vars {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }
  .models-section-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .models-section h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .model-filter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 12rem;
    max-width: 28rem;
  }
  .model-filter input {
    flex: 1;
    padding: 0.4rem 0.55rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .clear-filter {
    flex-shrink: 0;
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
  }
  .models-count {
    margin: 0 0 0.5rem;
  }
  .models-table-wrap {
    max-height: min(60vh, 520px);
    overflow: auto;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
  }
  .models-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    background: #fff;
  }
  .models-table thead th {
    position: sticky;
    top: 0;
    background: #f9fafb;
    z-index: 1;
    box-shadow: 0 1px 0 #eee;
  }
  .model-name {
    word-break: break-word;
    max-width: 14rem;
  }
  .vision-cell {
    white-space: nowrap;
    vertical-align: top;
  }
  .vision-pill {
    display: inline-block;
    font-size: 0.75rem;
    padding: 0.1rem 0.45rem;
    border-radius: 3px;
    background: #f3f4f6;
    color: #6b7280;
  }
  .vision-pill.on {
    background: #dbeafe;
    color: #1d4ed8;
  }
  .vision-manual {
    margin-left: 0.25rem;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.85;
  }
  .vision-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }
  button.small {
    font-size: 0.75rem;
    padding: 0.1rem 0.25rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .models-table th,
  .models-table td {
    border: 1px solid #eee;
    padding: 0.4rem 0.6rem;
    text-align: left;
  }
  .small {
    font-size: 0.75rem;
  }
  .hint {
    color: #666;
    font-size: 0.85rem;
  }
  .placeholder {
    color: #888;
    margin-top: 2rem;
  }
  .error {
    color: #b91c1c;
    font-size: 0.9rem;
  }
  .toast {
    color: #166534;
    font-size: 0.9rem;
  }
  .danger {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }
  .danger-btn {
    background: #dc2626;
    color: #fff;
    border-color: #dc2626;
  }
  button.muted {
    background: #f3f4f6;
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
    padding: 1.25rem;
    width: min(480px, 92vw);
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal h2 {
    margin: 0 0 0.5rem;
  }
  .modal-body label {
    display: block;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }
  .modal-body input,
  .modal-body select {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
    box-sizing: border-box;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
