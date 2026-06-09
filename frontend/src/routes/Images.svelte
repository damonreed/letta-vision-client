<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";
  import { imageContentPath, imageThumbnailPath } from "../lib/contentBlocks.js";
  import ImageViewer from "../lib/components/ImageViewer.svelte";

  let images = $state([]);
  let error = $state("");
  let loading = $state(false);
  let viewerSrc = $state(null);
  let viewerOpen = $state(false);

  let editTarget = $state(null);
  let editForm = $state({ caption: "", description: "", details: "" });
  let editError = $state("");
  let editSaving = $state(false);

  onMount(() => loadImages());

  async function loadImages() {
    loading = true;
    error = "";
    try {
      images = await api.listImages();
    } catch (e) {
      error = e.message || String(e);
    } finally {
      loading = false;
    }
  }

  async function reEnrich(id) {
    error = "";
    try {
      await api.reEnrichImage(id);
      await loadImages();
    } catch (e) {
      error = e.message || String(e);
    }
  }

  async function remove(id) {
    await api.deleteImage(id);
    await loadImages();
  }

  function viewFull(img) {
    const src = imageContentPath(img.id);
    if (!src) return;
    viewerSrc = src;
    viewerOpen = true;
  }

  function openEdit(img) {
    editTarget = img;
    editForm = {
      caption: img.caption || "",
      description: img.description || "",
      details: img.details || "",
    };
    editError = "";
  }

  function closeEdit() {
    editTarget = null;
    editError = "";
    editSaving = false;
  }

  async function saveEdit() {
    if (!editTarget) return;
    editSaving = true;
    editError = "";
    try {
      const updated = await api.updateImage(editTarget.id, {
        caption: editForm.caption,
        description: editForm.description,
        details: editForm.details,
      });
      images = images.map((img) => (img.id === updated.id ? updated : img));
      closeEdit();
    } catch (e) {
      editError = e.message || String(e);
    } finally {
      editSaving = false;
    }
  }
</script>

<section class="images-tab">
  <header>
    <h2>Images</h2>
    <button type="button" onclick={loadImages} disabled={loading}>Refresh</button>
  </header>
  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}<p>Loading…</p>{/if}
  <div class="grid">
    {#each images as img (img.id)}
      {@const thumbSrc = imageThumbnailPath(img)}
      <article class="card">
        {#if thumbSrc}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <button type="button" class="thumb-btn" onclick={() => viewFull(img)}>
            <img
              src={thumbSrc}
              alt={img.caption || img.id}
              class="thumb"
              loading="lazy"
              decoding="async"
            />
          </button>
        {:else}
          <div class="thumb placeholder">No preview</div>
        {/if}
        <h3>{img.id}</h3>
        <p class="meta">
          {img.provenance} · {img.enrichment_status}
          {#if img.width && img.height}
            · {img.width}×{img.height}
          {/if}
        </p>
        {#if img.caption}<p class="caption">{img.caption}</p>{/if}
        {#if img.description}<p class="desc">{img.description}</p>{/if}
        {#if img.error_message}<p class="error-msg">{img.error_message}</p>{/if}
        <div class="actions">
          <button type="button" onclick={() => viewFull(img)}>View full</button>
          <button type="button" onclick={() => openEdit(img)}>Edit</button>
          <button type="button" onclick={() => reEnrich(img.id)}>Re-enrich</button>
          <button type="button" class="danger" onclick={() => remove(img.id)}>Delete</button>
        </div>
      </article>
    {/each}
  </div>
</section>

<ImageViewer src={viewerSrc} bind:open={viewerOpen} />

{#if editTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={closeEdit}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal edit-modal" role="dialog" aria-labelledby="edit-image-title" onclick={(e) => e.stopPropagation()}>
      <h2 id="edit-image-title">Edit image metadata</h2>
      <p class="edit-id">{editTarget.id}</p>
      <div class="modal-body">
        {#if editError}<p class="error">{editError}</p>{/if}
        <label>
          Caption
          <span class="hint">Short label (20–50 words)</span>
          <input bind:value={editForm.caption} placeholder="Concise image label" />
        </label>
        <label>
          Description
          <span class="hint">Search-oriented summary (100–200 words)</span>
          <textarea bind:value={editForm.description} rows="6" placeholder="Literal content nouns for recall"></textarea>
        </label>
        <label>
          Details
          <span class="hint">Thorough description (1000 words)</span>
          <textarea bind:value={editForm.details} rows="14" placeholder="Extended literal description"></textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" onclick={saveEdit} disabled={editSaving}>
          {editSaving ? "Saving…" : "Save"}
        </button>
        <button type="button" onclick={closeEdit} disabled={editSaving}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .images-tab {
    padding: 1rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
  .card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .thumb-btn {
    padding: 0;
    border: none;
    background: #f4f4f5;
    border-radius: 6px;
    cursor: pointer;
    overflow: hidden;
    width: 100%;
  }
  .thumb {
    display: block;
    width: 100%;
    max-height: 220px;
    object-fit: contain;
    background: #f4f4f5;
  }
  .thumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 140px;
    color: #888;
    font-size: 0.9rem;
  }
  h3 {
    font-size: 0.95rem;
    word-break: break-all;
    margin: 0;
  }
  .meta {
    font-size: 0.85rem;
    color: #666;
    margin: 0;
  }
  .caption {
    font-size: 0.9rem;
    margin: 0;
  }
  .desc {
    font-size: 0.85rem;
    color: #444;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .error-msg {
    font-size: 0.85rem;
    color: #b45309;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
    flex-wrap: wrap;
  }
  .danger {
    color: #b00020;
  }
  .error {
    color: #b00020;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 1.5rem;
  }
  .modal {
    background: #fff;
    border-radius: 10px;
    width: min(92vw, 720px);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .edit-modal {
    width: min(94vw, 860px);
  }
  .modal h2 {
    margin: 0;
    padding: 1.25rem 1.5rem 0;
    font-size: 1.15rem;
  }
  .edit-id {
    margin: 0.35rem 1.5rem 0;
    font-size: 0.8rem;
    color: #666;
    word-break: break-all;
  }
  .modal-body {
    padding: 1rem 1.5rem;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .modal-body label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .hint {
    font-size: 0.78rem;
    font-weight: 400;
    color: #777;
  }
  .modal-body input,
  .modal-body textarea {
    width: 100%;
    font: inherit;
    font-weight: 400;
    padding: 0.5rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }
  .modal-body textarea {
    resize: vertical;
    min-height: 6rem;
    line-height: 1.45;
  }
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #eee;
  }
</style>
