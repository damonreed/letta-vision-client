<script>
  import { api } from "./api.js";

  /** @type {{ agentId: string, onError?: (msg: string) => void }} */
  let { agentId, onError = () => {} } = $props();

  let folders = $state([]);
  let allFolders = $state([]);
  let openFiles = $state([]);
  let loading = $state(false);

  $effect(() => {
    if (agentId) load();
  });

  async function load() {
    if (!agentId) return;
    loading = true;
    try {
      const [attached, catalog, open] = await Promise.all([
        api.listAgentFolders(agentId),
        api.listFolders(),
        api.listOpenFiles(agentId),
      ]);
      folders = attached;
      allFolders = catalog;
      openFiles = open;
    } catch (err) {
      onError(err.message);
    } finally {
      loading = false;
    }
  }

  function isAttached(folderId) {
    return folders.some((f) => f.id === folderId);
  }

  async function attachFolder(folderId) {
    try {
      await api.attachFolderToAgent(agentId, folderId);
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function detachFolder(folderId) {
    try {
      await api.detachFolderFromAgent(agentId, folderId);
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function closeOpenFile(fileId) {
    try {
      await api.closeOpenFile(agentId, fileId);
      await load();
    } catch (err) {
      onError(err.message);
    }
  }
</script>

<section class="agent-files" aria-labelledby="agent-files-heading">
  <h3 id="agent-files-heading">Filesystem</h3>
  <p class="hint">
    Attach folders so the agent can use file tools. Open files appear in chat memory while a session is active.
  </p>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}
    <div class="panel">
      <h4>Attached folders</h4>
      {#if folders.length === 0}
        <p class="muted">No folders attached.</p>
      {:else}
        <ul class="item-list">
          {#each folders as folder (folder.id)}
            <li>
              <span class="name">{folder.name || folder.id}</span>
              <button type="button" class="link-btn" onclick={() => detachFolder(folder.id)}>Detach</button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if allFolders.length}
        <h4>Available folders</h4>
        <ul class="item-list">
          {#each allFolders as folder (folder.id)}
            {#if !isAttached(folder.id)}
              <li>
                <span class="name">{folder.name || folder.id}</span>
                <button type="button" class="link-btn" onclick={() => attachFolder(folder.id)}>Attach</button>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    </div>

    <div class="panel">
      <h4>Open files</h4>
      {#if openFiles.length === 0}
        <p class="muted">No files open for this agent.</p>
      {:else}
        <ul class="item-list">
          {#each openFiles as row (row.file_id)}
            <li>
              <span class="name">{row.file_name || row.file_id}</span>
              <span class="meta">cursor {row.cursor_char ?? 0}</span>
              <button type="button" class="link-btn" onclick={() => closeOpenFile(row.file_id)}>Close</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .agent-files {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    min-height: 0;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    color: #374151;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7280;
  }
  .panel {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: #fafafa;
  }
  .item-list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
  }
  .item-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid #eee;
    font-size: 0.9rem;
  }
  .item-list li:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: 0.75rem;
    color: #6b7280;
  }
  .muted {
    margin: 0;
    font-size: 0.85rem;
    color: #9ca3af;
  }
  .link-btn {
    border: none;
    background: none;
    color: #2563eb;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
</style>
