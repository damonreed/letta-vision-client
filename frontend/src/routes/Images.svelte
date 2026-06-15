<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { copyTextToClipboard } from "../lib/clipboard.js";
  import { imageContentPath, imageThumbnailPath } from "../lib/contentBlocks.js";
  import ImageViewer from "../lib/components/ImageViewer.svelte";

  const BROWSE_PAGE_SIZE = 50;
  const SEARCH_LIMITS = [5, 10, 20, 50];

  let images = $state([]);
  let selectedId = $state(null);
  let selected = $state(null);
  let error = $state("");
  let loading = $state(false);
  let browseHasMore = $state(false);
  let loadingMore = $state(false);
  let listSentinel = $state(null);

  let searchMode = $state(false);
  let searchQuery = $state("");
  let searchLimit = $state(10);
  let searchResults = $state([]);
  let searching = $state(false);

  let viewerSrc = $state(null);
  let viewerOpen = $state(false);

  let editForm = $state({ caption: "", description: "", details: "" });
  let editDirty = $state(false);
  let editError = $state("");
  let editSaving = $state(false);
  let confirmDelete = $state(false);
  let hashCopied = $state(false);

  const railItems = $derived(searchMode ? searchResults : images);
  const selectedImage = $derived(
    selected || images.find((img) => img.id === selectedId) || null
  );

  onMount(() => {
    loadBrowsePage({ reset: true });
    return observeSentinel();
  });

  function observeSentinel() {
    if (!listSentinel || typeof IntersectionObserver === "undefined") return () => {};
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadBrowsePage({ reset: false });
        }
      },
      { root: null, rootMargin: "120px" }
    );
    observer.observe(listSentinel);
    return () => observer.disconnect();
  }

  $effect(() => {
    void listSentinel;
    return observeSentinel();
  });

  $effect(() => {
    if (!selectedId) {
      selected = null;
      return;
    }
    const cached = images.find((img) => img.id === selectedId);
    if (cached) {
      selected = cached;
      syncEditForm(cached);
      return;
    }
    void loadSelected(selectedId);
  });

  function syncEditForm(img) {
    editForm = {
      caption: img.caption || "",
      description: img.description || "",
      details: img.details || "",
    };
    editDirty = false;
    editError = "";
  }

  function browseCursor(img) {
    if (!img?.created_at || !img?.id) return {};
    return { afterCreatedAt: img.created_at, afterId: img.id };
  }

  async function loadBrowsePage({ reset = false } = {}) {
    if (searchMode) return;
    if (!reset && (!browseHasMore || loadingMore || loading)) return;

    if (reset) {
      loading = true;
      images = [];
      browseHasMore = false;
    } else {
      loadingMore = true;
    }
    error = "";

    const cursor = reset ? {} : browseCursor(images.at(-1));

    try {
      const res = await api.listImages({
        limit: BROWSE_PAGE_SIZE,
        ...cursor,
      });
      const page = res.images ?? [];
      const hasMore = Boolean(res.has_more);
      if (reset) {
        images = page;
        if (page.length && !selectedId) selectImage(page[0]);
      } else {
        const seen = new Set(images.map((img) => img.id));
        images = [...images, ...page.filter((img) => !seen.has(img.id))];
      }
      browseHasMore = hasMore;
    } catch (e) {
      error = e.message || String(e);
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function loadSelected(id) {
    error = "";
    try {
      const img = await api.getImage(id);
      selected = img;
      syncEditForm(img);
      if (!images.some((row) => row.id === img.id)) {
        images = [img, ...images];
      }
    } catch (e) {
      error = e.message || String(e);
    }
  }

  function selectImage(img) {
    selectedId = img.id;
    if (!searchMode) {
      selected = img;
      syncEditForm(img);
    } else {
      void loadSelected(img.id);
    }
    confirmDelete = false;
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    searching = true;
    error = "";
    try {
      const res = await api.searchImages(q, searchLimit);
      searchMode = true;
      searchResults = (res.results || []).map((hit) => ({
        id: hit.handle,
        score: hit.score,
        description: hit.description,
      }));
      if (searchResults.length) {
        selectImage(searchResults[0]);
      } else {
        selectedId = null;
        selected = null;
      }
    } catch (e) {
      error = e.message || String(e);
    } finally {
      searching = false;
    }
  }

  function clearSearch() {
    searchQuery = "";
    searchMode = false;
    searchResults = [];
    selectedId = null;
    selected = null;
    void loadBrowsePage({ reset: true });
  }

  function onSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      void runSearch();
    }
  }

  async function refreshBrowse() {
    if (searchMode) {
      await runSearch();
      return;
    }
    await loadBrowsePage({ reset: true });
  }

  async function reEnrich(id) {
    error = "";
    try {
      await api.reEnrichImage(id);
      const updated = await api.getImage(id);
      upsertImage(updated);
      if (selectedId === id) selected = updated;
    } catch (e) {
      error = e.message || String(e);
    }
  }

  async function remove(id) {
    error = "";
    try {
      await api.deleteImage(id);
      images = images.filter((img) => img.id !== id);
      searchResults = searchResults.filter((img) => img.id !== id);
      if (selectedId === id) {
        const next = railItems.find((img) => img.id !== id);
        if (next) selectImage(next);
        else {
          selectedId = null;
          selected = null;
        }
      }
      confirmDelete = false;
    } catch (e) {
      error = e.message || String(e);
    }
  }

  function upsertImage(updated) {
    images = images.map((img) => (img.id === updated.id ? updated : img));
    searchResults = searchResults.map((img) =>
      img.id === updated.id ? { ...img, ...updated } : img
    );
  }

  function openZoom() {
    if (!selectedImage?.id) return;
    viewerSrc = imageContentPath(selectedImage.id, { variant: "full" });
    viewerOpen = true;
  }

  function onEditInput() {
    editDirty = true;
  }

  function cancelEdit() {
    if (selectedImage) syncEditForm(selectedImage);
  }

  async function saveEdit() {
    if (!selectedImage) return;
    editSaving = true;
    editError = "";
    try {
      const updated = await api.updateImage(selectedImage.id, {
        caption: editForm.caption,
        description: editForm.description,
        details: editForm.details,
      });
      upsertImage(updated);
      selected = updated;
      syncEditForm(updated);
    } catch (e) {
      editError = e.message || String(e);
    } finally {
      editSaving = false;
    }
  }

  function formatBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function truncateHash(hash) {
    if (!hash) return "—";
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
  }

  async function copyHash(hash) {
    const ok = await copyTextToClipboard(hash);
    if (ok) {
      hashCopied = true;
      setTimeout(() => {
        hashCopied = false;
      }, 1200);
    }
  }

  function thumbPath(img) {
    return imageThumbnailPath(img) || imageThumbnailPath({ id: img.id });
  }

  function scoreLabel(img) {
    if (img.score == null) return null;
    return Number(img.score).toFixed(2);
  }
</script>

<div class="images-layout">
  <aside class="list">
    <div class="list-header">
      <h2>
        Images
        {#if !searchMode && images.length}
          <span class="count">({images.length}{browseHasMore ? "+" : ""})</span>
        {:else if searchMode}
          <span class="count">({searchResults.length})</span>
        {/if}
      </h2>
      <button type="button" onclick={refreshBrowse} disabled={loading || searching}>
        Refresh
      </button>
    </div>

    <div class="search-bar">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search images…"
        onkeydown={onSearchKeydown}
      />
      <select bind:value={searchLimit} aria-label="Result limit">
        {#each SEARCH_LIMITS as n}
          <option value={n}>{n}</option>
        {/each}
      </select>
      <button type="button" onclick={runSearch} disabled={searching || !searchQuery.trim()}>
        {searching ? "…" : "Search"}
      </button>
      <button type="button" class="muted" onclick={clearSearch} disabled={!searchMode && !searchQuery}>
        Clear
      </button>
    </div>

    {#if error}<p class="error">{error}</p>{/if}
    {#if loading && !images.length && !searchMode}<p class="hint">Loading…</p>{/if}

    <ul class="thumb-list">
      {#each railItems as img (img.id)}
        {@const thumbSrc = thumbPath(img)}
        <li>
          <button
            type="button"
            class:selected={img.id === selectedId}
            onclick={() => selectImage(img)}
          >
            <span class="thumb-wrap">
              {#if thumbSrc}
                <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
              {:else}
                <span class="thumb-placeholder">?</span>
              {/if}
              {#if scoreLabel(img)}
                <span class="score-badge">{scoreLabel(img)}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>

    {#if !searchMode && browseHasMore}
      <div class="sentinel" bind:this={listSentinel}>
        {#if loadingMore}<span class="hint">Loading more…</span>{/if}
      </div>
    {/if}

    {#if searchMode && !searchResults.length && !searching}
      <p class="hint">No matches</p>
    {/if}
  </aside>

  <section class="detail">
    {#if selectedImage}
      <div class="detail-split">
        <div class="preview-pane">
          <div class="detail-header">
            <h2>Image</h2>
            <div class="header-actions">
              <button type="button" onclick={() => reEnrich(selectedImage.id)}>Re-enrich</button>
              {#if confirmDelete}
                <button type="button" class="danger" onclick={() => remove(selectedImage.id)}>
                  Confirm delete
                </button>
                <button type="button" class="muted" onclick={() => (confirmDelete = false)}>
                  Cancel
                </button>
              {:else}
                <button type="button" class="danger" onclick={() => (confirmDelete = true)}>
                  Delete
                </button>
              {/if}
            </div>
          </div>

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <button type="button" class="preview-btn" onclick={openZoom}>
            {#if thumbPath(selectedImage)}
              <img
                src={thumbPath(selectedImage)}
                alt={selectedImage.caption || selectedImage.id}
                decoding="async"
              />
            {:else}
              <span class="preview-placeholder">No preview</span>
            {/if}
          </button>

          <dl class="meta-grid">
            <dt>ID</dt><dd><code>{selectedImage.id}</code></dd>
            <dt>Hash</dt>
            <dd>
              <code title={selectedImage.content_hash}>{truncateHash(selectedImage.content_hash)}</code>
              {#if selectedImage.content_hash}
                <button type="button" class="linkish" onclick={() => copyHash(selectedImage.content_hash)}>
                  {hashCopied ? "Copied" : "Copy"}
                </button>
              {/if}
            </dd>
            <dt>Size</dt>
            <dd>
              {formatBytes(selectedImage.file_size_full)}
              {#if selectedImage.file_size_1mp != null}
                <span class="muted"> (1MP {formatBytes(selectedImage.file_size_1mp)})</span>
              {/if}
            </dd>
            <dt>Dimensions</dt>
            <dd>
              {#if selectedImage.width && selectedImage.height}
                {selectedImage.width}×{selectedImage.height}
              {:else}
                —
              {/if}
            </dd>
            <dt>Type</dt><dd>{selectedImage.media_type || "—"}</dd>
            <dt>Provenance</dt><dd>{selectedImage.provenance || "—"}</dd>
            {#if selectedImage.generation_prompt}
              <dt>Gen prompt</dt><dd class="wrap">{selectedImage.generation_prompt}</dd>
            {/if}
            <dt>Enrichment</dt>
            <dd>
              {selectedImage.enrichment_status || "—"}
              {#if selectedImage.enrichment_attempts}
                <span class="muted"> ({selectedImage.enrichment_attempts} attempts)</span>
              {/if}
            </dd>
            {#if selectedImage.error_message}
              <dt>Error</dt><dd class="error-text">{selectedImage.error_message}</dd>
            {/if}
            <dt>Space id</dt><dd class="wrap"><code>{selectedImage.embedding_space_id || "—"}</code></dd>
            <dt>Created</dt><dd>{formatDate(selectedImage.created_at)}</dd>
            <dt>Updated</dt><dd>{formatDate(selectedImage.updated_at)}</dd>
          </dl>
        </div>

        <div class="editor-pane">
          <h3>Edit metadata</h3>
          {#if editError}<p class="error">{editError}</p>{/if}
          <label>
            Caption
            <span class="hint-inline">Short label (20–50 words)</span>
            <input bind:value={editForm.caption} oninput={onEditInput} />
          </label>
          <label>
            Description
            <span class="hint-inline">Search-oriented summary (100–200 words)</span>
            <textarea bind:value={editForm.description} rows="8" oninput={onEditInput}></textarea>
          </label>
          <label>
            Details
            <span class="hint-inline">Prompt-ready literal description (1500-2000 words, structured sections)</span>
            <textarea bind:value={editForm.details} rows="16" oninput={onEditInput}></textarea>
          </label>
          <div class="editor-actions">
            <button type="button" onclick={saveEdit} disabled={editSaving || !editDirty}>
              {editSaving ? "Saving…" : "Save"}
            </button>
            <button type="button" class="muted" onclick={cancelEdit} disabled={editSaving || !editDirty}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    {:else}
      <p class="placeholder">
        {#if searchMode}No image selected.{:else if loading}Loading images…{:else}No images yet.{/if}
      </p>
    {/if}
  </section>
</div>

<ImageViewer src={viewerSrc} bind:open={viewerOpen} />

<style>
  .images-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: calc(100vh - 52px);
  }
  .list {
    border-right: 1px solid #ddd;
    background: #fff;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #eee;
    gap: 0.5rem;
  }
  .list-header h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .count {
    font-weight: 400;
    color: #666;
    font-size: 0.85em;
  }
  .search-bar {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.35rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid #eee;
  }
  .search-bar input {
    min-width: 0;
    font: inherit;
    padding: 0.35rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .search-bar select {
    font: inherit;
    padding: 0.35rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .thumb-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .thumb-list li button {
    width: 100%;
    padding: 0.5rem 1rem;
    border: none;
    background: none;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
  }
  .thumb-list li button.selected {
    background: #eff6ff;
  }
  .thumb-wrap {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 6px;
    background: #f4f4f5;
  }
  .thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-placeholder,
  .preview-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #888;
  }
  .score-badge {
    position: absolute;
    right: 0.35rem;
    bottom: 0.35rem;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    font-size: 0.72rem;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
  }
  .sentinel {
    padding: 0.75rem 1rem 1rem;
    text-align: center;
  }
  .detail {
    padding: 0;
    overflow: hidden;
    background: #fafafa;
  }
  .detail-split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 100%;
    min-height: 0;
  }
  .preview-pane,
  .editor-pane {
    overflow-y: auto;
    padding: 1rem 1.25rem;
    min-height: 0;
  }
  .editor-pane {
    border-left: 1px solid #e5e7eb;
    background: #fff;
  }
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  .detail-header h2 {
    margin: 0;
    font-size: 1rem;
  }
  .header-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .preview-btn {
    width: 100%;
    padding: 0;
    border: none;
    background: #f4f4f5;
    border-radius: 8px;
    overflow: hidden;
    cursor: zoom-in;
    margin-bottom: 1rem;
  }
  .preview-btn img {
    display: block;
    width: 100%;
    max-height: 42vh;
    object-fit: contain;
    background: #f4f4f5;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
    font-size: 0.88rem;
  }
  .meta-grid dt {
    color: #666;
  }
  .meta-grid dd {
    margin: 0;
    word-break: break-word;
  }
  .wrap {
    word-break: break-word;
  }
  .editor-pane h3 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
  }
  .editor-pane label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.85rem;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .hint-inline {
    font-size: 0.78rem;
    font-weight: 400;
    color: #777;
  }
  .editor-pane input,
  .editor-pane textarea {
    width: 100%;
    font: inherit;
    font-weight: 400;
    padding: 0.5rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }
  .editor-pane textarea {
    resize: vertical;
    line-height: 1.45;
  }
  .editor-actions {
    display: flex;
    gap: 0.5rem;
  }
  .placeholder {
    padding: 2rem 1.25rem;
    color: #666;
  }
  .hint {
    margin: 0.5rem 1rem;
    font-size: 0.8rem;
    color: #666;
  }
  .error,
  .error-text {
    color: #b00020;
  }
  .danger {
    color: #b00020;
  }
  .muted {
    color: #666;
  }
  .linkish {
    margin-left: 0.35rem;
    padding: 0;
    border: none;
    background: none;
    color: #2563eb;
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
  }
</style>
