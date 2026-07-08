<script>
  import AttachmentThumbnail from "./AttachmentThumbnail.svelte";

  let {
    attachments = [],
    maxAttachments = 4,
    loadingCount = 0,
    previewSrc = () => "",
    onRemove = () => {},
    onView = () => {},
  } = $props();

  const totalCount = $derived(attachments.length + loadingCount);
</script>

{#if attachments.length || loadingCount}
  <div class="strip" aria-label="Pending attachments">
    <span class="count">{totalCount}/{maxAttachments}</span>
    {#each attachments as attachment, i (i)}
      <AttachmentThumbnail
        src={previewSrc(attachment)}
        onRemove={() => onRemove(i)}
        onView={() => onView(attachment)}
      />
    {/each}
    {#each Array(loadingCount) as _, i (i)}
      <div class="loading" aria-label="Processing attachment">…</div>
    {/each}
  </div>
{/if}

<style>
  .strip {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .count {
    align-self: center;
    font-size: 0.75rem;
    color: #666;
    min-width: 2rem;
  }
  .loading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 60px;
    border-radius: 6px;
    border: 1px dashed #ccc;
    color: #888;
    font-size: 1.25rem;
  }
</style>
