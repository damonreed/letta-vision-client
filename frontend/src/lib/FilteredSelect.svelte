<script>
  let {
    label = "",
    options = [],
    value = $bindable(""),
    placeholder = "Filter…",
  } = $props();

  let filter = $state("");

  let filtered = $derived(
    filter.trim()
      ? options.filter((o) => o.toLowerCase().includes(filter.trim().toLowerCase()))
      : options
  );
</script>

<label class="filtered-select">
  {#if label}<span class="lbl">{label}</span>{/if}
  <input type="text" {placeholder} bind:value={filter} class="filter-input" />
  <select bind:value>
    {#each filtered as opt}
      <option value={opt}>{opt}</option>
    {/each}
  </select>
</label>

<style>
  .filtered-select {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
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
  select {
    width: 100%;
    max-height: 12rem;
  }
</style>
