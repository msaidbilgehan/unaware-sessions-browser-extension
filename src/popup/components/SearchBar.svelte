<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    query: string;
    onchange: (query: string) => void;
    /** Called on Escape when the field is already empty. */
    ondismiss?: () => void;
    resultCount?: number;
    totalCount?: number;
  }

  let { query, onchange, ondismiss, resultCount, totalCount }: Props = $props();
  let inputRef = $state<HTMLInputElement | undefined>(undefined);

  export function focus() {
    inputRef?.focus();
    inputRef?.select();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (query) onchange('');
    else ondismiss?.();
  }

  function handleClear() {
    onchange('');
    inputRef?.focus();
  }

  const showCount = $derived(
    !!query && resultCount !== undefined && totalCount !== undefined && totalCount > 0,
  );
</script>

<div class="search-bar">
  <span class="search-icon">
    <Icon name="search" size={13} />
  </span>
  <input
    type="text"
    placeholder="Search sessions and sites…"
    value={query}
    oninput={(e) => onchange(e.currentTarget.value)}
    onkeydown={handleKeydown}
    bind:this={inputRef}
    aria-label="Search sessions and sites"
    autocomplete="off"
    spellcheck="false"
  />
  {#if showCount}
    <span class="result-count" aria-live="polite">{resultCount} of {totalCount}</span>
  {/if}
  {#if query}
    <button class="clear-btn" onclick={handleClear} aria-label="Clear search">
      <Icon name="x" size={11} />
    </button>
  {/if}
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    transition: all var(--transition-smooth);
  }

  .search-bar:focus-within {
    border-color: var(--color-accent);
    background: var(--color-bg-primary);
    box-shadow: var(--shadow-glow);
  }

  .search-icon {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    display: flex;
    transition: color var(--transition-fast);
  }

  .search-bar:focus-within .search-icon {
    color: var(--color-accent);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    background: transparent;
    color: var(--color-text-primary);
  }

  input::placeholder {
    color: var(--color-text-tertiary);
  }

  .result-count {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clear-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    line-height: 1;
    display: flex;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .clear-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .clear-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
