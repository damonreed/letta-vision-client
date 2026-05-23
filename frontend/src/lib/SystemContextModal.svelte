<script>
  let {
    open = $bindable(false),
    content = "",
    summary = "",
    loading = false,
  } = $props();
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={() => (open = false)} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="System context">
      <header class="modal-header">
        <div>
          <h2>System context</h2>
          {#if summary}
            <p class="summary">{summary}</p>
          {/if}
        </div>
        <button type="button" class="close" onclick={() => (open = false)} aria-label="Close">×</button>
      </header>
      <div class="modal-body">
        {#if loading}
          <p class="muted">Loading…</p>
        {:else if content}
          <pre>{content}</pre>
        {:else}
          <p class="muted">No system message in this conversation yet.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .modal {
    background: #fff;
    border-radius: 8px;
    max-width: min(960px, 100%);
    width: 100%;
    max-height: min(85vh, 900px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .summary {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: #6b7280;
  }
  .close {
    border: none;
    background: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: #6b7280;
    padding: 0 0.25rem;
  }
  .close:hover {
    color: #111;
  }
  .modal-body {
    overflow: auto;
    padding: 1rem 1.25rem 1.25rem;
  }
  .modal-body pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.8rem;
    line-height: 1.45;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .muted {
    color: #6b7280;
    font-size: 0.9rem;
  }
</style>
