<script>
  import { onMount } from "svelte";
  import { fetchUrlToImageBlock, imageBlockDataUrl } from "../imagePipeline.ts";

  /** @type {{ url: string, onOpen?: (src: string) => void }} */
  let { url, onOpen = () => {} } = $props();

  let src = $state(null);
  let error = $state("");

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const block = await fetchUrlToImageBlock(url);
        if (!cancelled) src = imageBlockDataUrl(block);
      } catch (err) {
        if (!cancelled) error = err.message;
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="tool-result-image">
  {#if error}
    <p class="err">Could not load image: {error}</p>
    <a href={url} target="_blank" rel="noopener noreferrer">Open URL</a>
  {:else if src}
    <button type="button" class="img-btn" onclick={() => onOpen(src)}>
      <img {src} alt="Generated image" loading="lazy" decoding="async" class="inline-img" />
    </button>
  {:else}
    <p class="loading">Loading image…</p>
  {/if}
</div>

<style>
  .tool-result-image {
    margin-top: 0.5rem;
  }
  .loading,
  .err {
    font-size: 0.85rem;
    color: #666;
  }
  .err {
    color: #b45309;
  }
  .img-btn {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .inline-img {
    max-width: 100%;
    max-height: 320px;
    border-radius: 6px;
    border: 1px solid #ddd;
  }
</style>
