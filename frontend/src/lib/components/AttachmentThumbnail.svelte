<script>
  let { src, onRemove = () => {}, onView = () => {} } = $props();
</script>

{#if src}
  <div class="thumb">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <button type="button" class="img-btn" onclick={onView}>
      <img src={src} alt="Attachment preview" />
    </button>
    <button type="button" class="remove" onclick={onRemove} aria-label="Remove attachment">×</button>
  </div>
{/if}

<style>
  .thumb {
    position: relative;
    display: inline-block;
    margin-bottom: 0.5rem;
  }
  .thumb img {
    max-height: 80px;
    max-width: 120px;
    border-radius: 6px;
    border: 1px solid #ccc;
  }
  .remove {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid #ccc;
    background: #fff;
    cursor: pointer;
    line-height: 1;
  }
  .img-btn {
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
  }
</style>
