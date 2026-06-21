<script>
  import { api } from "./api.js";
  import {
    activeConversationId,
    conversations,
    pickConversationForAgent,
    saveActiveConversation,
    sortConversationList,
  } from "./stores.js";

  /** @type {{ agentId: string | null, onCreated?: (conversationId: string) => void }} */
  let { agentId = null, onCreated = null } = $props();

  let convList = $state([]);
  let activeId = $state(null);
  let error = $state("");
  let showNew = $state(false);
  let newName = $state("");
  let menuFor = $state(null);
  let renameId = $state(null);
  let renameValue = $state("");
  let confirmDeleteId = $state(null);

  $effect(() => {
    if (agentId) {
      loadConversations(agentId);
    } else {
      convList = [];
      activeId = null;
      conversations.set([]);
      activeConversationId.set(null);
    }
  });

  async function loadConversations(id) {
    error = "";
    try {
      const list = sortConversationList(await api.listConversations(id));
      convList = list;
      conversations.set(list);
      const pick = pickConversationForAgent(id, list);
      if (!activeId || !list.some((c) => c.id === activeId)) {
        selectConversation(pick);
      }
    } catch (err) {
      error = err.message;
    }
  }

  function selectConversation(id) {
    activeId = id;
    activeConversationId.set(id);
    if (agentId) saveActiveConversation(agentId, id);
    menuFor = null;
  }

  function displayName(conv) {
    if (conv.is_default) return conv.name || "Default Chat";
    if (conv.name) return conv.name;
    if (conv.created_at) {
      try {
        return new Date(conv.created_at).toLocaleString();
      } catch {
        return conv.created_at;
      }
    }
    return conv.id;
  }

  function formatTime(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  function onNewConversationSubmit(e) {
    e.preventDefault();
    void createConversation();
  }

  async function createConversation() {
    if (!agentId) return;
    error = "";
    try {
      const conv = await api.createConversation(agentId, newName.trim());
      showNew = false;
      newName = "";
      await loadConversations(agentId);
      selectConversation(conv.id);
      onCreated?.(conv.id);
    } catch (err) {
      error = err.message;
    }
  }

  async function saveRename() {
    if (!renameId) return;
    error = "";
    try {
      await api.updateConversation(renameId, renameValue.trim());
      renameId = null;
      await loadConversations(agentId);
    } catch (err) {
      error = err.message;
    }
  }

  async function deleteConversation(id) {
    error = "";
    try {
      await api.deleteConversation(id);
      confirmDeleteId = null;
      await loadConversations(agentId);
      if (activeId === id) {
        selectConversation(pickConversationForAgent(agentId, convList));
      }
    } catch (err) {
      error = err.message;
    }
  }

  function openMenu(conv, e) {
    e.preventDefault();
    menuFor = conv.id;
  }

  function convToDelete() {
    return convList.find((c) => c.id === confirmDeleteId);
  }
</script>

<aside class="conv-sidebar">
  <div class="conv-header">
    <button class="new-btn" onclick={() => (showNew = true)} disabled={!agentId}>
      + New conversation
    </button>
  </div>

  {#if error}<p class="conv-error">{error}</p>{/if}

  <ul class="conv-list">
    {#each convList as conv (conv.id)}
      <li class:selected={conv.id === activeId}>
        {#if renameId === conv.id}
          <div class="rename-row">
            <input bind:value={renameValue} />
            <button onclick={saveRename}>Save</button>
            <button class="muted" onclick={() => (renameId = null)}>Cancel</button>
          </div>
        {:else}
          <div class="conv-row">
            <button
              class="conv-item"
              onclick={() => selectConversation(conv.id)}
              oncontextmenu={(e) => openMenu(conv, e)}
            >
              <span class="conv-name">{displayName(conv)}</span>
              {#if conv.last_message_preview}
                <span class="conv-preview">{conv.last_message_preview}</span>
              {/if}
              <span class="conv-time">{formatTime(conv.last_message_at)}</span>
            </button>
            {#if !conv.is_default}
              <button
                type="button"
                class="delete-btn"
                aria-label="Delete conversation"
                title="Delete conversation"
                onclick={(e) => {
                  e.stopPropagation();
                  confirmDeleteId = conv.id;
                }}
              >
                🗑
              </button>
            {/if}
          </div>
          {#if menuFor === conv.id && !conv.is_default}
            <div class="conv-menu">
              <button
                onclick={() => {
                  renameId = conv.id;
                  renameValue = conv.name || "";
                  menuFor = null;
                }}
              >
                Rename
              </button>
              <button class="muted" onclick={() => (menuFor = null)}>Close</button>
            </div>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
</aside>

{#if confirmDeleteId}
  {@const target = convToDelete()}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (confirmDeleteId = null)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="mini-modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h3>Delete conversation?</h3>
      <p class="confirm-text">
        This permanently deletes
        <strong>{target ? displayName(target) : "this conversation"}</strong>
        and its message history. This cannot be undone.
      </p>
      <div class="mini-actions">
        <button class="danger" onclick={() => deleteConversation(confirmDeleteId)}>
          Delete
        </button>
        <button class="muted" onclick={() => (confirmDeleteId = null)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

{#if showNew}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={() => (showNew = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <form class="mini-modal" role="dialog" onclick={(e) => e.stopPropagation()} onsubmit={onNewConversationSubmit}>
      <h3>New conversation</h3>
      <label>
        Name (optional)
        <input bind:value={newName} placeholder="Leave blank for timestamp" />
      </label>
      <div class="mini-actions">
        <button type="submit">Create</button>
        <button type="button" class="muted" onclick={() => (showNew = false)}>Cancel</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .conv-sidebar {
    width: 240px;
    border-right: 1px solid #ddd;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .conv-header {
    padding: 0.75rem;
    border-bottom: 1px solid #eee;
  }
  .new-btn {
    width: 100%;
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
  }
  .new-btn:disabled {
    opacity: 0.5;
  }
  .conv-error {
    color: #dc2626;
    font-size: 0.8rem;
    padding: 0 0.75rem;
    margin: 0.25rem 0;
  }
  .conv-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }
  .conv-list li {
    border-bottom: 1px solid #eee;
  }
  .conv-row {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }
  .conv-list li.selected .conv-item {
    background: #eff6ff;
  }
  .conv-list li.selected .conv-row:hover .conv-item {
    background: #eff6ff;
  }
  .conv-item {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 0.65rem 0.5rem 0.65rem 0.75rem;
    border: none;
    background: none;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
  }
  .conv-row:hover .conv-item {
    background: #f3f4f6;
  }
  .delete-btn {
    flex-shrink: 0;
    align-self: center;
    margin-right: 0.4rem;
    background: none;
    border: none;
    padding: 0.35rem 0.45rem;
    color: #9ca3af;
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    border-radius: 4px;
  }
  .delete-btn:hover {
    color: #dc2626;
    background: #fef2f2;
  }
  .conv-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: #111;
  }
  .conv-preview {
    font-size: 0.75rem;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conv-time {
    font-size: 0.7rem;
    color: #9ca3af;
  }
  .conv-menu {
    display: flex;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem 0.5rem;
    flex-wrap: wrap;
  }
  .conv-menu button {
    font-size: 0.75rem;
    padding: 0.2rem 0.45rem;
  }
  .confirm-text {
    margin: 0;
    font-size: 0.85rem;
    color: #374151;
    line-height: 1.45;
  }
  .mini-actions .danger {
    background: #dc2626;
    color: #fff;
    border: none;
    padding: 0.4rem 0.75rem;
    border-radius: 4px;
  }
  .rename-row {
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .rename-row input {
    width: 100%;
  }
  .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .mini-modal {
    background: #fff;
    border-radius: 8px;
    padding: 1.25rem;
    width: min(90vw, 360px);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .mini-modal h3 {
    margin: 0;
    font-size: 1rem;
  }
  .mini-modal label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }
  .mini-modal input {
    width: 100%;
  }
  .mini-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
