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
    await api.reEnrichImage(id);
    await loadImages();
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
          <button type="button" onclick={() => reEnrich(img.id)}>Re-enrich</button>
          <button type="button" class="danger" onclick={() => remove(img.id)}>Delete</button>
        </div>
      </article>
    {/each}
  </div>
</section>

<ImageViewer src={viewerSrc} bind:open={viewerOpen} />

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
</style>
