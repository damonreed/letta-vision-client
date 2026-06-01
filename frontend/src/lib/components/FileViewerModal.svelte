<script>
  import { marked } from "marked";
  import { api } from "../api.js";
  import {
    downloadTextContent,
    fileDisplayName,
    guessDownloadMimeType,
  } from "../fileDownload.js";

  let {
    open = $bindable(false),
    folderId = null,
    file = null,
    onClose = () => {},
  } = $props();

  let loading = $state(false);
  let error = $state("");
  let detail = $state(null);
  let previewMode = $state("text");

  const name = $derived(detail ? fileDisplayName(detail) : file ? fileDisplayName(file) : "");
  const isMarkdown = $derived(/\.md$/i.test(name));
  const content = $derived(detail?.content ?? "");
  const markdownHtml = $derived(
    previewMode === "markdown" && content
      ? marked.parse(content)
      : "",
  );

  $effect(() => {
    if (!open || !folderId || !file?.id) {
      detail = null;
      error = "";
      loading = false;
      previewMode = "text";
      return;
    }
    let cancelled = false;
    loading = true;
    error = "";
    detail = null;
    previewMode = /\.md$/i.test(fileDisplayName(file)) ? "markdown" : "text";
    api
      .getFolderFile(folderId, file.id, true)
      .then((row) => {
        if (!cancelled) detail = row;
      })
      .catch((err) => {
        if (!cancelled) error = err.message;
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function close() {
    open = false;
    onClose();
  }

  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  function download() {
    if (!detail) return;
    downloadTextContent(
      detail.content ?? "",
      fileDisplayName(detail),
      guessDownloadMimeType(fileDisplayName(detail), detail.file_type),
    );
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && file}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" role="presentation" onclick={close}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="panel" role="dialog" aria-modal="true" aria-labelledby="file-viewer-title" onclick={(e) => e.stopPropagation()}>
      <header class="header">
        <div>
          <h2 id="file-viewer-title">{name}</h2>
          {#if detail?.processing_status}
            <p class="meta">Status: {detail.processing_status}</p>
          {/if}
        </div>
        <div class="header-actions">
          {#if isMarkdown}
            <button
              type="button"
              class="muted"
              class:active={previewMode === "markdown"}
              onclick={() => (previewMode = "markdown")}
            >
              Preview
            </button>
            <button
              type="button"
              class="muted"
              class:active={previewMode === "text"}
              onclick={() => (previewMode = "text")}
            >
              Raw
            </button>
          {/if}
          <button type="button" onclick={download} disabled={!detail || loading}>
            Download
          </button>
          <button type="button" class="close" onclick={close} aria-label="Close">×</button>
        </div>
      </header>

      <div class="body">
        {#if loading}
          <p class="placeholder">Loading file…</p>
        {:else if error}
          <p class="error">{error}</p>
        {:else if detail?.content == null}
          <p class="placeholder">No text content available for this file.</p>
        {:else if previewMode === "markdown"}
          <article class="markdown">{@html markdownHtml}</article>
        {:else}
          <pre class="raw">{content}</pre>
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
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    padding: 1rem;
  }
  .panel {
    background: #fff;
    border-radius: 8px;
    width: min(960px, 96vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  }
  .header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #eee;
  }
  .header h2 {
    margin: 0;
    font-size: 1rem;
    word-break: break-word;
  }
  .meta {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: #666;
  }
  .header-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-shrink: 0;
  }
  .header-actions button {
    padding: 0.35rem 0.65rem;
    font-size: 0.8rem;
  }
  .header-actions .muted {
    background: #f3f4f6;
    border: 1px solid #ddd;
  }
  .header-actions .muted.active {
    background: #dbeafe;
    border-color: #93c5fd;
  }
  .close {
    background: transparent;
    border: none;
    font-size: 1.4rem;
    line-height: 1;
    padding: 0 0.25rem;
    cursor: pointer;
  }
  .body {
    padding: 1rem 1.25rem 1.25rem;
    overflow: auto;
    min-height: 200px;
  }
  .raw {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3) {
    margin-top: 1rem;
  }
  .markdown :global(pre) {
    overflow-x: auto;
    background: #f8fafc;
    padding: 0.75rem;
    border-radius: 4px;
  }
  .placeholder {
    color: #666;
    margin: 0;
  }
  .error {
    color: #dc2626;
    margin: 0;
  }
</style>
