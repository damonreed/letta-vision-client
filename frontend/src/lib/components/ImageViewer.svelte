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
    <button type="button" class="close" onclick={close} aria-label="Close">×</button>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <img src={src} alt="Full size" decoding="async" onclick={close} />
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
    border: none;
    padding: 0;
    cursor: zoom-out;
  }
  .backdrop img {
    max-width: 95vw;
    max-height: 95vh;
    object-fit: contain;
    cursor: zoom-out;
  }
  .close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    color: #fff;
    font-size: 1.5rem;
    background: rgba(0, 0, 0, 0.35);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
    padding: 0.15rem 0.45rem;
  }
</style>
