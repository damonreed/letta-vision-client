<script>
  let {
    label = "",
    options = [],
    value = $bindable(""),
    placeholder = "Filter…",
    oncancel = undefined,
  } = $props();

  let filter = $state("");
  let filterInput = $state(null);
  let selectEl = $state(null);

  let filtered = $derived(
    filter.trim()
      ? options.filter((o) =>
          String(o).toLowerCase().includes(filter.trim().toLowerCase()),
        )
      : options,
  );

  let showPicker = $derived(Boolean(filter.trim()));

  function selectOption(opt) {
    value = opt;
    filter = "";
    queueMicrotask(() => selectEl?.focus());
  }

  function applyFirstMatch() {
    if (!filtered.length) return false;
    selectOption(filtered[0]);
    return true;
  }

  function handleEscape() {
    if (filter.trim()) {
      filter = "";
      filterInput?.focus();
      return;
    }
    oncancel?.();
  }

  function onFilterKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (applyFirstMatch()) return;
    }
    if (e.key === "ArrowDown" && filtered.length) {
      e.preventDefault();
      if (showPicker) {
        document.getElementById(optionId(0))?.focus();
      } else {
        selectEl?.focus();
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleEscape();
    }
  }

  function onSelectKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleEscape();
    }
  }

  function onOptionKeydown(e, opt) {
    if (e.key === "Enter") {
      e.preventDefault();
      selectOption(opt);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleEscape();
    }
  }

  function optionId(index) {
    return `fs-opt-${index}`;
  }
</script>

<label class="filtered-select">
  {#if label}<span class="lbl">{label}</span>{/if}
  <input
    type="text"
    {placeholder}
    bind:value={filter}
    bind:this={filterInput}
    class="filter-input"
    onkeydown={onFilterKeydown}
    aria-label={label || "Filter options"}
    aria-expanded={showPicker}
  />
  {#if showPicker}
    {#if filtered.length === 0}
      <p class="no-match">No matching options</p>
    {:else}
      <ul class="option-list" role="listbox" aria-label={label || "Filtered options"}>
        {#each filtered as opt, i (opt)}
          <li role="presentation">
            <button
              type="button"
              id={optionId(i)}
              role="option"
              class:selected={value === opt}
              aria-selected={value === opt}
              onclick={() => selectOption(opt)}
              onkeydown={(e) => onOptionKeydown(e, opt)}
            >
              {opt}
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">Click or Enter to select · Esc clears filter or cancels</p>
    {/if}
  {:else}
    <select
      bind:this={selectEl}
      bind:value
      onkeydown={onSelectKeydown}
      class="full-select"
    >
      {#each options as opt (opt)}
        <option value={opt}>{opt}</option>
      {/each}
    </select>
  {/if}
</label>

<style>
  .filtered-select {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .lbl {
    font-weight: 500;
  }
  .filter-input {
    font-size: 0.85rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .full-select {
    width: 100%;
    font-size: 0.85rem;
  }
  .option-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid #ccc;
    border-radius: 4px;
    max-height: 14rem;
    overflow-y: auto;
    background: #fff;
  }
  .option-list button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.6rem;
    border: none;
    background: #fff;
    font-size: 0.85rem;
    cursor: pointer;
    font-family: inherit;
  }
  .option-list button:hover,
  .option-list button:focus {
    background: #eff6ff;
    outline: none;
  }
  .option-list button.selected {
    background: #dbeafe;
    font-weight: 500;
  }
  .option-list li + li button {
    border-top: 1px solid #eee;
  }
  .no-match {
    margin: 0;
    font-size: 0.85rem;
    color: #b91c1c;
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: #666;
  }
</style>
