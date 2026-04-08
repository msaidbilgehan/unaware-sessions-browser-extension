<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    query: string;
    onchange: (query: string) => void;
  }

  let { query, onchange }: Props = $props();
  let inputRef = $state<HTMLInputElement | undefined>(undefined);

  export function focus() {
    inputRef?.focus();
  }

  function handleInput(e: Event) {
    onchange((e.target as HTMLInputElement).value);
  }

  function handleClear() {
    onchange('');
    inputRef?.focus();
  }
</script>

<div class="search-bar">
  <Icon name="search" size={14} class="search-icon" />
  <input
    type="text"
    placeholder="Search sessions..."
    value={query}
    oninput={handleInput}
    bind:this={inputRef}
    aria-label="Search sessions"
  />
  {#if query}
    <button class="clear-btn" onclick={handleClear} aria-label="Clear search">
      <Icon name="x" size={12} />
    </button>
  {/if}
</div>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    transition: border-color var(--transition-fast);
  }

  .search-bar:focus-within {
    border-color: var(--color-accent);
  }

  :global(.search-icon) {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  input {
    flex: 1;
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

  .clear-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    line-height: 1;
    display: flex;
    border-radius: var(--radius-sm);
  }

  .clear-btn:hover {
    color: var(--color-text-secondary);
  }
</style>
