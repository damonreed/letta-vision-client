<script>
  import { api } from "./api.js";
  import { buildToolSections } from "./tools.js";

  /** @type {{ allTools: any[], selectedIds?: string[], agentId?: string | null, onError?: (msg: string) => void, onRefresh?: () => void | Promise<void>, layout?: 'grid' | 'master-detail' }} */
  let {
    allTools = [],
    selectedIds = $bindable([]),
    agentId = null,
    onError = (msg) => {},
    onRefresh = null,
    layout = "grid",
  } = $props();

  const attachMode = $derived(!!agentId);

  let selectedSectionId = $state(null);
  let pending = $state(new Set());
  let refreshing = $state(false);

  const sections = $derived(buildToolSections(allTools));
  const visibleSections = $derived(sections.filter((s) => s.tools.length > 0));

  let selectedSection = $derived(
    visibleSections.find((s) => s.id === selectedSectionId) ?? null,
  );

  $effect(() => {
    if (!visibleSections.length) {
      selectedSectionId = null;
    } else if (!visibleSections.some((s) => s.id === selectedSectionId)) {
      selectedSectionId = visibleSections[0].id;
    }
  });

  function isChecked(toolId) {
    return selectedIds.includes(toolId);
  }

  function setChecked(toolId, checked) {
    if (checked) {
      if (!selectedIds.includes(toolId)) {
        selectedIds = [...selectedIds, toolId];
      }
    } else {
      selectedIds = selectedIds.filter((id) => id !== toolId);
    }
  }

  function attachedCount(section) {
    return section.tools.filter((t) => isChecked(t.id)).length;
  }

  async function onCheckboxChange(tool, checked) {
    if (!attachMode) {
      setChecked(tool.id, checked);
      return;
    }

    const prev = [...selectedIds];
    setChecked(tool.id, checked);
    pending = new Set([...pending, tool.id]);

    try {
      if (checked) {
        await api.attachTool(agentId, tool.id);
      } else {
        await api.detachTool(agentId, tool.id);
      }
    } catch (err) {
      selectedIds = prev;
      onError(
        checked
          ? `Failed to attach tool: ${err.message}`
          : `Failed to detach tool: ${err.message}`,
      );
    } finally {
      const next = new Set(pending);
      next.delete(tool.id);
      pending = next;
    }
  }

  async function refreshTools() {
    if (!onRefresh || refreshing) return;
    refreshing = true;
    try {
      await onRefresh();
    } catch (err) {
      onError(err?.message || "Tools refresh failed");
    } finally {
      refreshing = false;
    }
  }
</script>

{#if layout === "master-detail"}
  <div class="tool-selector master-detail-layout">
    {#if visibleSections.length === 0}
      <p class="empty">No tools available.</p>
    {:else}
      <div class="master-detail">
        <nav class="category-list" aria-label="Tool categories">
          {#each visibleSections as section (section.id)}
            {@const attached = attachedCount(section)}
            <button
              type="button"
              class:selected={section.id === selectedSectionId}
              onclick={() => (selectedSectionId = section.id)}
            >
              <span class="category-label">{section.label}</span>
              <span class="category-meta">
                {attached}/{section.tools.length}
              </span>
            </button>
          {/each}
          {#if onRefresh}
            <div class="category-footer">
              <button
                type="button"
                class="refresh-btn"
                disabled={refreshing}
                onclick={refreshTools}
              >
                {refreshing ? "Refreshing…" : "Tools Refresh"}
              </button>
            </div>
          {/if}
        </nav>

        {#if selectedSection}
          <div class="tools-panel">
            <div class="tools-panel-header">{selectedSection.label}</div>
            <div class="tools-list">
              {#each selectedSection.tools as tool (tool.id)}
                <label class="tool-check">
                  <input
                    type="checkbox"
                    checked={isChecked(tool.id)}
                    disabled={pending.has(tool.id)}
                    onchange={(e) => onCheckboxChange(tool, e.currentTarget.checked)}
                  />
                  <span>{tool.name || tool.id}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="tool-selector">
    {#each visibleSections as section (section.id)}
      <div class="section-header">{section.label}</div>
      <div class="tools-grid">
        {#each section.tools as tool (tool.id)}
          <label class="tool-check">
            <input
              type="checkbox"
              checked={isChecked(tool.id)}
              disabled={pending.has(tool.id)}
              onchange={(e) => onCheckboxChange(tool, e.currentTarget.checked)}
            />
            <span>{tool.name || tool.id}</span>
          </label>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  .tool-selector {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .master-detail-layout {
    flex: 1;
  }
  .master-detail {
    display: grid;
    grid-template-columns: 220px 1fr;
    flex: 1;
    min-height: 0;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
  }
  .category-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
    border-right: 1px solid #e5e7eb;
    background: #fafafa;
  }
  .category-list button {
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.75rem;
    border: none;
    background: none;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    cursor: pointer;
  }
  .category-list button:hover {
    background: #f3f4f6;
  }
  .category-list button.selected {
    background: #eff6ff;
  }
  .category-footer {
    margin-top: auto;
    padding: 0.5rem 0.6rem 0.65rem;
    border-top: 1px solid #e5e7eb;
    background: #fafafa;
  }
  .refresh-btn {
    width: 100%;
    padding: 0.4rem 0.55rem;
    font-size: 0.78rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    color: #374151;
    cursor: pointer;
  }
  .refresh-btn:hover:not(:disabled) {
    background: #f9fafb;
  }
  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .category-label {
    font-size: 0.85rem;
    font-weight: 500;
  }
  .category-meta {
    font-size: 0.7rem;
    color: #888;
    flex-shrink: 0;
  }
  .tools-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .tools-panel-header {
    flex-shrink: 0;
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: #374151;
    border-bottom: 1px solid #f0f0f0;
  }
  .tools-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .section-header {
    font-size: 0.8rem;
    font-weight: 700;
    color: #374151;
    margin: 0.25rem 0 0;
  }
  .tools-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem 1rem;
  }
  .tool-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .tool-check input {
    width: auto;
    flex-shrink: 0;
  }
  .tool-check span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: #888;
    margin: 1rem 0;
  }
</style>
