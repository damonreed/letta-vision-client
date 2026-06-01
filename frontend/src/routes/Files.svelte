<script>
  import { onMount } from "svelte";
  import { api, modelHandle } from "../lib/api.js";
  import FileViewerModal from "../lib/components/FileViewerModal.svelte";
  import {
    downloadTextContent,
    fileDisplayName,
    guessDownloadMimeType,
  } from "../lib/fileDownload.js";
  import {
    agents,
    saveSelectedAgent,
    selectedAgentId,
  } from "../lib/stores.js";
  import FilteredSelect from "../lib/FilteredSelect.svelte";

  let folderList = $state([]);
  let selectedFolderId = $state(null);
  let files = $state([]);
  let agentList = $state([]);
  let agentId = $state(null);
  let attachedFolderIds = $state(new Set());
  let embeddings = $state([]);
  let error = $state("");
  let uploading = $state(false);
  let creatingText = $state(false);
  let showCreateFolder = $state(false);
  let showCreateTextFile = $state(false);
  let showFileViewer = $state(false);
  let viewerFile = $state(null);
  let confirmDeleteFolder = $state(false);
  let confirmDeleteFileId = $state(null);
  let downloadingFileId = $state(null);

  let createForm = $state({
    name: "",
    description: "",
    embedding: "",
  });

  let textFileForm = $state({
    file_name: "",
    content: "",
  });

  const selectedFolder = $derived(
    folderList.find((f) => f.id === selectedFolderId) ?? null,
  );

  onMount(() => {
    loadAll();
    const u1 = agents.subscribe((a) => (agentList = a));
    const u2 = selectedAgentId.subscribe((id) => {
      agentId = id;
      if (id) loadAgentFolders(id);
      else attachedFolderIds = new Set();
    });
    return () => {
      u1();
      u2();
    };
  });

  async function loadAll() {
    error = "";
    try {
      const [folders, embeds, agentsRes] = await Promise.all([
        api.listFolders(),
        api.listEmbeddings(),
        api.listAgents(),
      ]);
      folderList = folders;
      embeddings = uniqueHandles(Array.isArray(embeds) ? embeds : []);
      agents.set(agentsRes);
      if (!createForm.embedding && embeddings[0]) {
        createForm.embedding = embeddings[0];
      }
      if (selectedFolderId && !folderList.some((f) => f.id === selectedFolderId)) {
        selectedFolderId = null;
        files = [];
      }
      if (agentId) await loadAgentFolders(agentId);
    } catch (err) {
      error = err.message;
    }
  }

  async function loadAgentFolders(id) {
    try {
      const attached = await api.listAgentFolders(id);
      attachedFolderIds = new Set(attached.map((f) => f.id));
    } catch (err) {
      error = err.message;
      attachedFolderIds = new Set();
    }
  }

  async function selectFolder(id) {
    selectedFolderId = id;
    confirmDeleteFolder = false;
    confirmDeleteFileId = null;
    error = "";
    try {
      files = await api.listFolderFiles(id);
    } catch (err) {
      error = err.message;
      files = [];
    }
  }

  function selectAgent(id) {
    selectedAgentId.set(id);
    saveSelectedAgent(id);
  }

  function isAttached(folderId) {
    return attachedFolderIds.has(folderId);
  }

  async function attachFolder(folderId) {
    if (!agentId) {
      error = "Select an agent first";
      return;
    }
    error = "";
    try {
      await api.attachFolderToAgent(agentId, folderId);
      await loadAgentFolders(agentId);
    } catch (err) {
      error = err.message;
    }
  }

  async function detachFolder(folderId) {
    if (!agentId) return;
    error = "";
    try {
      await api.detachFolderFromAgent(agentId, folderId);
      await loadAgentFolders(agentId);
    } catch (err) {
      error = err.message;
    }
  }

  function openCreateFolder() {
    createForm = {
      name: "",
      description: "",
      embedding: embeddings[0] || "",
    };
    showCreateFolder = true;
  }

  async function createFolder() {
    error = "";
    try {
      const created = await api.createFolder(createForm);
      showCreateFolder = false;
      await loadAll();
      await selectFolder(created.id);
    } catch (err) {
      error = err.message;
    }
  }

  async function deleteFolder() {
    if (!selectedFolderId) return;
    error = "";
    try {
      await api.deleteFolder(selectedFolderId);
      selectedFolderId = null;
      files = [];
      confirmDeleteFolder = false;
      await loadAll();
    } catch (err) {
      error = err.message;
    }
  }

  async function onFileInput(e) {
    const input = e.target;
    const picked = input.files;
    if (!picked?.length || !selectedFolderId) return;
    uploading = true;
    error = "";
    try {
      for (const file of picked) {
        await api.uploadFolderFile(selectedFolderId, file);
      }
      files = await api.listFolderFiles(selectedFolderId);
    } catch (err) {
      error = err.message;
    } finally {
      uploading = false;
      input.value = "";
    }
  }

  async function deleteFile(fileId) {
    if (!selectedFolderId) return;
    error = "";
    try {
      await api.deleteFolderFile(selectedFolderId, fileId);
      confirmDeleteFileId = null;
      files = await api.listFolderFiles(selectedFolderId);
    } catch (err) {
      error = err.message;
    }
  }

  function openCreateTextFile() {
    textFileForm = { file_name: "", content: "" };
    showCreateTextFile = true;
  }

  async function createTextFile() {
    if (!selectedFolderId) return;
    creatingText = true;
    error = "";
    try {
      await api.createTextFile(selectedFolderId, {
        file_name: textFileForm.file_name.trim(),
        content: textFileForm.content,
      });
      showCreateTextFile = false;
      files = await api.listFolderFiles(selectedFolderId);
    } catch (err) {
      error = err.message;
    } finally {
      creatingText = false;
    }
  }

  function openFileViewer(file) {
    viewerFile = file;
    showFileViewer = true;
  }

  async function downloadFile(file) {
    if (!selectedFolderId || !file?.id) return;
    downloadingFileId = file.id;
    error = "";
    try {
      const detail = await api.getFolderFile(selectedFolderId, file.id, true);
      if (detail.content == null) {
        throw new Error("No text content available to download");
      }
      downloadTextContent(
        detail.content,
        fileDisplayName(detail),
        guessDownloadMimeType(fileDisplayName(detail), detail.file_type),
      );
    } catch (err) {
      error = err.message;
    } finally {
      downloadingFileId = null;
    }
  }

  function formatBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileLabel(file) {
    return fileDisplayName(file);
  }

  function embeddingLabel(folder) {
    const handle = folder.embedding_config?.handle;
    return handle || "—";
  }

  function uniqueHandles(items) {
    const handles = items.map(modelHandle);
    return [...new Set(handles)];
  }
</script>

<div class="files-layout">
  <aside class="list">
    <div class="list-header">
      <h2>Folders</h2>
      <button onclick={openCreateFolder}>+ New</button>
    </div>

    <div class="agent-bar">
      <label>
        Agent
        <select
          value={agentId ?? ""}
          onchange={(e) => selectAgent(e.currentTarget.value || null)}
        >
          <option value="">— none —</option>
          {#each agentList as agent}
            <option value={agent.id}>{agent.name}</option>
          {/each}
        </select>
      </label>
      {#if !agentId}
        <p class="hint">Select an agent to attach or detach folders.</p>
      {/if}
    </div>

    {#if error}<p class="error">{error}</p>{/if}

    <ul>
      {#each folderList as folder}
        <li>
          <button
            class:selected={folder.id === selectedFolderId}
            onclick={() => selectFolder(folder.id)}
          >
            <strong>{folder.name}</strong>
            {#if agentId && isAttached(folder.id)}
              <span class="badge attached">attached</span>
            {/if}
            <span class="meta">{embeddingLabel(folder)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section class="detail">
    {#if selectedFolder}
      <div class="detail-header">
        <h2>{selectedFolder.name}</h2>
        <div class="header-actions">
          {#if agentId}
            {#if isAttached(selectedFolder.id)}
              <button class="muted" onclick={() => detachFolder(selectedFolder.id)}>
                Detach from agent
              </button>
            {:else}
              <button onclick={() => attachFolder(selectedFolder.id)}>
                Attach to agent
              </button>
            {/if}
          {/if}
        </div>
      </div>

      <dl class="meta-grid">
        <dt>ID</dt><dd><code>{selectedFolder.id}</code></dd>
        <dt>Embedding</dt><dd>{embeddingLabel(selectedFolder)}</dd>
        {#if selectedFolder.description}
          <dt>Description</dt><dd>{selectedFolder.description}</dd>
        {/if}
      </dl>

      <div class="files-section">
        <div class="files-header">
          <h3>Files</h3>
          <div class="files-toolbar">
            <button type="button" class="secondary-btn" onclick={openCreateTextFile}>
              + New text file
            </button>
            <label class="upload-btn">
              <input
                type="file"
                multiple
                disabled={uploading}
                onchange={onFileInput}
              />
              {uploading ? "Uploading…" : "+ Upload"}
            </label>
          </div>
        </div>

        {#if files.length === 0}
          <p class="placeholder">No files in this folder yet.</p>
        {:else}
          <table class="files-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each files as file}
                <tr>
                  <td>{fileLabel(file)}</td>
                  <td>{formatBytes(file.file_size)}</td>
                  <td>
                    <span class="status" class:status-error={file.processing_status === "error"}>
                      {file.processing_status || "—"}
                    </span>
                  </td>
                  <td class="actions">
                    <button type="button" class="link-btn" onclick={() => openFileViewer(file)}>
                      View
                    </button>
                    <button
                      type="button"
                      class="link-btn"
                      disabled={downloadingFileId === file.id}
                      onclick={() => downloadFile(file)}
                    >
                      {downloadingFileId === file.id ? "…" : "Download"}
                    </button>
                    {#if confirmDeleteFileId === file.id}
                      <button class="danger-btn" onclick={() => deleteFile(file.id)}>
                        Confirm
                      </button>
                      <button class="muted" onclick={() => (confirmDeleteFileId = null)}>
                        Cancel
                      </button>
                    {:else}
                      <button
                        class="danger-btn subtle"
                        onclick={() => (confirmDeleteFileId = file.id)}
                      >
                        Delete
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <div class="danger">
        {#if confirmDeleteFolder}
          <p>Delete folder <strong>{selectedFolder.name}</strong> and all its files?</p>
          <button class="danger-btn" onclick={deleteFolder}>Confirm delete folder</button>
          <button onclick={() => (confirmDeleteFolder = false)}>Cancel</button>
        {:else}
          <button class="danger-btn" onclick={() => (confirmDeleteFolder = true)}>
            Delete folder
          </button>
        {/if}
      </div>
    {:else}
      <p class="placeholder">Select a folder to view files</p>
    {/if}
  </section>
</div>

{#if showCreateFolder}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (showCreateFolder = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>Create folder</h2>
      <div class="modal-body">
        <label>Name <input bind:value={createForm.name} /></label>
        <label>Description <textarea bind:value={createForm.description} rows="2"></textarea></label>
        <FilteredSelect
          label="Embedding"
          options={embeddings}
          bind:value={createForm.embedding}
        />
      </div>
      <div class="modal-actions">
        <button onclick={createFolder} disabled={!createForm.name.trim()}>Create</button>
        <button onclick={() => (showCreateFolder = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<FileViewerModal
  bind:open={showFileViewer}
  folderId={selectedFolderId}
  file={viewerFile}
/>

{#if showCreateTextFile}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => (showCreateTextFile = false)}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" role="dialog" onclick={(e) => e.stopPropagation()}>
      <h2>Create text file</h2>
      <div class="modal-body">
        <label>
          File name
          <input bind:value={textFileForm.file_name} placeholder="notes.txt" />
        </label>
        <label>
          Content
          <textarea bind:value={textFileForm.content} rows="12"></textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button
          onclick={createTextFile}
          disabled={creatingText || !textFileForm.file_name.trim()}
        >
          {creatingText ? "Creating…" : "Create"}
        </button>
        <button onclick={() => (showCreateTextFile = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .files-layout {
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
  .agent-bar {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .agent-bar label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .agent-bar select {
    font-weight: 400;
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: #666;
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
  }
  .list li button.selected {
    background: #eff6ff;
  }
  .badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .badge.attached {
    background: #dcfce7;
    color: #166534;
  }
  .meta {
    font-size: 0.75rem;
    color: #666;
  }
  .detail {
    padding: 1.25rem;
    overflow-y: auto;
  }
  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .detail-header h2 {
    margin: 0;
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 0.35rem 1rem;
    font-size: 0.85rem;
    margin-bottom: 1.25rem;
  }
  .files-section {
    margin-top: 1rem;
  }
  .files-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .files-header h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .files-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .secondary-btn {
    background: #f3f4f6;
    border: 1px solid #ddd;
    color: #111;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .upload-btn {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    background: #2563eb;
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .upload-btn input {
    display: none;
  }
  .files-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .files-table th,
  .files-table td {
    text-align: left;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid #eee;
  }
  .files-table th {
    font-weight: 600;
    color: #555;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .actions {
    text-align: right;
    white-space: nowrap;
  }
  .link-btn {
    background: none;
    border: none;
    color: #2563eb;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.15rem 0.35rem;
  }
  .link-btn:disabled {
    color: #94a3b8;
    cursor: wait;
  }
  .status {
    font-size: 0.75rem;
    color: #555;
  }
  .status-error {
    color: #dc2626;
  }
  .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
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
  }
  .danger-btn.subtle {
    background: transparent;
    color: #dc2626;
    border: 1px solid #fca5a5;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }
  .placeholder {
    color: #888;
    margin-top: 2rem;
    text-align: center;
  }
  .error {
    color: #dc2626;
    padding: 0.5rem 1rem;
    margin: 0;
    font-size: 0.85rem;
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
    width: min(90vw, 520px);
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
  .modal-body input,
  .modal-body textarea {
    width: 100%;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
  }
</style>
