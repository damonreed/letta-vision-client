<script>
  import { onMount } from "svelte";
  import { api } from "../lib/api.js";

  let images = $state([]);
  let error = $state("");
  let loading = $state(false);

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

  async function viewFull(img) {
    const { url } = await api.getImageUrl(img.id);
    window.open(url, "_blank");
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
      <article class="card">
        <h3>{img.id}</h3>
        <p class="meta">{img.provenance} · {img.enrichment_status}</p>
        {#if img.caption}<p>{img.caption}</p>{/if}
        {#if img.description}<p class="desc">{img.description}</p>{/if}
        <div class="actions">
          <button type="button" onclick={() => viewFull(img)}>View full</button>
          <button type="button" onclick={() => reEnrich(img.id)}>Re-enrich</button>
          <button type="button" class="danger" onclick={() => remove(img.id)}>Delete</button>
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .images-tab { padding: 1rem; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; background: #fff; }
  .meta { font-size: 0.85rem; color: #666; }
  .desc { font-size: 0.9rem; }
  .actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .danger { color: #b00020; }
  .error { color: #b00020; }
</style>
