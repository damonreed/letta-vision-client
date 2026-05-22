<script>
  import { api } from "./api.js";

  let {
    agentId,
    agentName = "",
    blocks = $bindable([]),
    onError = () => {},
    onReload = async () => {},
  } = $props();

  const LABEL_RE = /^[a-zA-Z0-9_-]+$/;

  let blockEdits = $state({});
  let blockAgents = $state({});
  let selectedBlockId = $state(null);
  let showCreate = $state(false);
  let showAttach = $state(false);
  let attachSearch = $state("");
  let allBlocks = $state([]);
  let createError = $state("");
  let attachError = $state("");
  let detachTarget = $state(null);

  let createForm = $state({
    label: "",
    description: "",
    value: "",
    limit: 100000,
    read_only: false,
  });

  let selectedBlock = $derived(
    blocks.find((b) => b.id === selectedBlockId) ?? null,
  );

  $effect(() => {
    blockEdits = Object.fromEntries(blocks.map((b) => [b.id, b.value ?? ""]));
    loadBlockAgents(blocks);
    if (!blocks.length) {
      selectedBlockId = null;
    } else if (!blocks.some((b) => b.id === selectedBlockId)) {
      selectedBlockId = blocks[0].id;
    }
  });

  async function loadBlockAgents(blockList) {
    const entries = await Promise.all(
      blockList.map(async (b) => {
        try {
          const agents = await api.listBlockAgents(b.id);
          const others = agents.filter((a) => a.id !== agentId);
          return [b.id, others];
        } catch {
          return [b.id, []];
        }
      }),
    );
    blockAgents = Object.fromEntries(entries);
  }

  function validateLabel(label) {
    if (!label.trim()) return "Label is required";
    if (!LABEL_RE.test(label)) {
      return "Label may only contain letters, numbers, underscores, and hyphens";
    }
    return "";
  }

  async function openCreate() {
    createForm = {
      label: "",
      description: "",
      value: "",
      limit: 100000,
      read_only: false,
    };
    createError = "";
    showCreate = true;
  }

  async function submitCreate() {
    createError = "";
    const labelErr = validateLabel(createForm.label);
    if (labelErr) {
      createError = labelErr;
      return;
    }
    try {
      const created = await api.createGlobalBlock({
        label: createForm.label,
        value: createForm.value,
        description: createForm.description || null,
        limit: createForm.limit,
        read_only: createForm.read_only,
      });
      await api.attachBlock(agentId, created.id);
      showCreate = false;
      selectedBlockId = created.id;
      await onReload();
    } catch (err) {
      createError = err.message;
    }
  }

  async function openAttach() {
    attachSearch = "";
    attachError = "";
    try {
      allBlocks = await api.listAllBlocks();
      showAttach = true;
    } catch (err) {
      onError(err.message);
    }
  }

  let attachableBlocks = $derived.by(() => {
    const attachedIds = new Set(blocks.map((b) => b.id));
    const q = attachSearch.trim().toLowerCase();
    return allBlocks
      .filter((b) => !attachedIds.has(b.id))
      .filter((b) => {
        if (!q) return true;
        const label = (b.label || "").toLowerCase();
        const desc = (b.description || "").toLowerCase();
        return label.includes(q) || desc.includes(q);
      });
  });

  let attachableMeta = $state({});

  $effect(() => {
    if (!showAttach) return;
    loadAttachMeta(attachableBlocks);
  });

  async function loadAttachMeta(blockList) {
    const entries = await Promise.all(
      blockList.map(async (b) => {
        try {
          const agents = await api.listBlockAgents(b.id);
          return [b.id, agents.length];
        } catch {
          return [b.id, 0];
        }
      }),
    );
    attachableMeta = Object.fromEntries(entries);
  }

  async function attachExisting(blockId) {
    attachError = "";
    try {
      await api.attachBlock(agentId, blockId);
      showAttach = false;
      selectedBlockId = blockId;
      await onReload();
    } catch (err) {
      attachError = err.message;
    }
  }

  async function saveBlock(block) {
    try {
      await api.updateBlock(agentId, block.label, blockEdits[block.id]);
      await onReload();
    } catch (err) {
      onError(err.message);
    }
  }

  function requestDetach(block) {
    detachTarget = block;
  }

  async function confirmDetach() {
    if (!detachTarget) return;
    const detachedId = detachTarget.id;
    try {
      await api.detachBlock(agentId, detachedId);
      detachTarget = null;
      await onReload();
    } catch (err) {
      onError(err.message);
      detachTarget = null;
    }
  }

  function charCount(block) {
    const len = (block.value ?? "").length;
    const limit = block.limit ?? 100000;
    return `${len} / ${limit} chars`;
  }
</script>

<div class="blocks-workspace">
  <div class="blocks-toolbar">
    <button type="button" onclick={openCreate}>+ Create block</button>
    <button type="button" class="muted" onclick={openAttach}>+ Attach existing</button>
  </div>

  {#if blocks.length === 0}
    <p class="empty">No memory blocks attached. Create or attach one to get started.</p>
  {:else}
    <div class="master-detail">
      <nav class="block-list" aria-label="Memory blocks">
        {#each blocks as block (block.id)}
          {@const others = blockAgents[block.id] || []}
          <button
            type="button"
            class:selected={block.id === selectedBlockId}
            onclick={() => (selectedBlockId = block.id)}
          >
            <span class="block-label">{block.label}</span>
            <span class="block-list-meta">
              {#if block.read_only}🔒{/if}
              {#if others.length > 0}
                · shared
              {/if}
            </span>
          </button>
        {/each}
      </nav>

      {#if selectedBlock}
        {@const others = blockAgents[selectedBlock.id] || []}
        <div class="block-editor">
          <div class="block-card-header">
            <span class="block-label">{selectedBlock.label}</span>
            {#if selectedBlock.read_only}
              <span class="read-only-badge" title="Read-only — managed elsewhere">
                🔒 Read-only
              </span>
            {/if}
            {#if others.length > 0}
              <span
                class="shared-badge"
                title={others.map((a) => a.name || a.id).join(", ")}
              >
                Shared with {others.length} other agent{others.length === 1 ? "" : "s"}
              </span>
            {/if}
            <span class="char-meta">{charCount(selectedBlock)}</span>
          </div>
          {#if selectedBlock.description}
            <p class="block-desc">{selectedBlock.description}</p>
          {/if}
          <textarea
            class="block-textarea"
            bind:value={blockEdits[selectedBlock.id]}
            disabled={selectedBlock.read_only}
          ></textarea>
          <div class="block-actions">
            {#if !selectedBlock.read_only}
              <button type="button" onclick={() => saveBlock(selectedBlock)}>Save</button>
            {/if}
            <button type="button" class="muted" onclick={() => requestDetach(selectedBlock)}>
              Detach
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
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
      <h2>Create block</h2>
      <div class="modal-body">
        {#if createError}<p class="error">{createError}</p>{/if}
        <label>
          Label
          <input bind:value={createForm.label} placeholder="human" />
        </label>
        <label>
          Description
          <input
            bind:value={createForm.description}
            placeholder="Optional — helps the agent understand this block"
          />
        </label>
        <label>
          Value
          <textarea bind:value={createForm.value} rows="6"></textarea>
        </label>
        <label>
          Character limit
          <input type="number" bind:value={createForm.limit} min="1" />
        </label>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={createForm.read_only} />
          Read-only (agent cannot modify via memory tools)
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" onclick={submitCreate}>Create</button>
        <button type="button" onclick={() => (showCreate = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if showAttach}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (showAttach = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal attach-modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>Attach existing block</h2>
      <div class="modal-body">
        {#if attachError}<p class="error">{attachError}</p>{/if}
        <input
          type="search"
          placeholder="Search by label or description…"
          bind:value={attachSearch}
        />
        {#if attachableBlocks.length === 0}
          <p class="empty">No blocks available to attach.</p>
        {:else}
          <ul class="attach-list">
            {#each attachableBlocks as block (block.id)}
              {@const agentCount = attachableMeta[block.id] ?? 0}
              <li>
                <button type="button" onclick={() => attachExisting(block.id)}>
                  <strong>{block.label}</strong>
                  {#if block.description}
                    <span class="desc">{block.description}</span>
                  {/if}
                  <span class="meta">
                    {charCount(block)}
                    {#if block.read_only}
                      · read-only
                    {/if}
                    {#if agentCount > 0}
                      · attached to {agentCount} agent{agentCount === 1 ? "" : "s"}
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="modal-actions">
        <button type="button" onclick={() => (showAttach = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}

{#if detachTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (detachTarget = null)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal confirm-modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>Detach block from this agent</h2>
      <div class="modal-body">
        <p>
          Detach "<strong>{detachTarget.label}</strong>" from {agentName || "this agent"}?
        </p>
        <p>
          The block will continue to exist in Letta and remain attached to any other agents
          it's currently attached to. You can re-attach it to this agent later via the
          "Attach existing" button.
        </p>
        <p>This is not a delete — the block's content is preserved.</p>
        {#if (blockAgents[detachTarget.id] || []).length > 0}
          <p class="shared-warning">
            This block is also attached to:
            {(blockAgents[detachTarget.id] || [])
              .map((a) => a.name || a.id)
              .join(", ")}. They will not be affected.
          </p>
        {/if}
      </div>
      <div class="modal-actions">
        <button type="button" onclick={confirmDetach}>Detach</button>
        <button type="button" onclick={() => (detachTarget = null)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .blocks-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .blocks-toolbar {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    padding-bottom: 0.5rem;
  }
  .blocks-toolbar .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .master-detail {
    display: grid;
    grid-template-columns: 200px 1fr;
    flex: 1;
    min-height: 0;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }
  .block-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    border-right: 1px solid #e5e7eb;
    background: #fafafa;
  }
  .block-list button {
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.75rem;
    border: none;
    background: none;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    cursor: pointer;
  }
  .block-list button:hover {
    background: #f3f4f6;
  }
  .block-list button.selected {
    background: #eff6ff;
  }
  .block-list-meta {
    font-size: 0.7rem;
    color: #888;
  }
  .block-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0.75rem 1rem;
    overflow: hidden;
  }
  .block-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
    flex-shrink: 0;
  }
  .block-label {
    font-weight: 600;
  }
  .char-meta {
    margin-left: auto;
    font-size: 0.75rem;
    color: #888;
  }
  .block-desc {
    margin: 0 0 0.35rem;
    font-size: 0.85rem;
    color: #666;
    font-style: italic;
    flex-shrink: 0;
  }
  .read-only-badge,
  .shared-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    background: #f3f4f6;
    color: #555;
  }
  .read-only-badge {
    background: #fef3c7;
    color: #92400e;
  }
  .block-textarea {
    flex: 1;
    min-height: 0;
    width: 100%;
    resize: none;
    margin-bottom: 0.5rem;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .block-textarea:disabled {
    background: #f9fafb;
    color: #666;
  }
  .block-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .block-actions .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .empty {
    color: #888;
    margin: 1rem 0;
  }
  .error {
    color: #dc2626;
    margin: 0 0 0.5rem;
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
  .attach-modal {
    width: min(90vw, 640px);
  }
  .confirm-modal {
    width: min(90vw, 480px);
  }
  .modal h2 {
    margin: 0;
    padding: 1.25rem 1.5rem 0;
    font-size: 1.1rem;
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
  .modal-body input,
  .modal-body textarea {
    width: 100%;
  }
  .checkbox-row {
    flex-direction: row !important;
    align-items: center;
    gap: 0.5rem !important;
  }
  .checkbox-row input {
    width: auto;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
  }
  .attach-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
  }
  .attach-list li button {
    width: 100%;
    text-align: left;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .attach-list li button:hover {
    background: #eff6ff;
  }
  .attach-list .desc {
    font-style: italic;
    color: #666;
    font-size: 0.85rem;
  }
  .attach-list .meta {
    font-size: 0.75rem;
    color: #888;
  }
  .shared-warning {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }
</style>
