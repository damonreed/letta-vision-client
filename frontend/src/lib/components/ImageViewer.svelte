<script>
  let { src = null, open = $bindable(false), onClose = () => {} } = $props();

  function close() {
    open = false;
    onClose();
  }

  function onKeydown(e) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && src}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="backdrop" role="presentation" onclick={close}>
    <div class="panel" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <button type="button" class="close" onclick={close} aria-label="Close">×</button>
      <img src={src} alt="Full size" decoding="async" />
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .panel {
    position: relative;
    max-width: 95vw;
    max-height: 95vh;
  }
  .panel img {
    max-width: 95vw;
    max-height: 95vh;
    object-fit: contain;
  }
  .close {
    position: absolute;
    top: -2rem;
    right: 0;
    color: #fff;
    font-size: 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
  }
</style>
