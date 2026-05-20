<script>
  import { api } from "./api.js";
  import { buildToolSections } from "./tools.js";

  /** @type {{ allTools: any[], selectedIds?: string[], agentId?: string | null, onError?: (msg: string) => void }} */
  let {
    allTools = [],
    selectedIds = $bindable([]),
    agentId = null,
    onError = (msg) => {},
  } = $props();

  const attachMode = $derived(!!agentId);

  let collapsed = $state({});
  let pending = $state(new Set());

  const sections = $derived(buildToolSections(allTools));

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

  function toggleSection(id) {
    collapsed = { ...collapsed, [id]: !collapsed[id] };
  }

  function sectionCollapsed(section) {
    if (collapsed[section.id] !== undefined) return collapsed[section.id];
    return !!section.collapsedDefault;
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
          : `Failed to detach tool: ${err.message}`
      );
    } finally {
      const next = new Set(pending);
      next.delete(tool.id);
      pending = next;
    }
  }
</script>

<div class="tool-selector">
  {#each sections as section (section.id)}
    {#if section.tools.length}
      {#if section.legacy}
        <div class="section-header legacy">
          <button
            type="button"
            class="section-toggle"
            onclick={() => toggleSection(section.id)}
          >
            Legacy tools ({section.tools.length})
            {sectionCollapsed(section) ? "[show]" : "[hide]"}
          </button>
        </div>
      {:else}
        <div class="section-header">{section.label}</div>
      {/if}
      {#if !sectionCollapsed(section)}
        <div class="tools-grid" class:legacy={section.legacy}>
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
      {/if}
    {/if}
  {/each}
</div>

<style>
  .tool-selector {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .section-header {
    font-size: 0.8rem;
    font-weight: 700;
    color: #374151;
    margin: 0.25rem 0 0;
  }
  .section-header.legacy {
    font-weight: 400;
  }
  .section-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8rem;
    color: #6b7280;
    cursor: pointer;
  }
  .section-toggle:hover {
    color: #374151;
    text-decoration: underline;
  }
  .tools-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem 1rem;
  }
  .tools-grid.legacy {
    opacity: 0.85;
  }
  .tools-grid.legacy .tool-check span {
    color: #6b7280;
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
</style>
