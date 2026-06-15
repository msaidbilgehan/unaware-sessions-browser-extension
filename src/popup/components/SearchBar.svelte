<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';
  import { _ } from 'svelte-i18n';
  import '@shared/i18n';
  import { locale } from '@shared/i18n';

  // Force re-render when locale changes
  $effect(() => { void $locale; });

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
  <span class="search-icon">
    <Icon name="search" size={13} />
  </span>
  <input
    type="text"
    placeholder={$_('popup.search.placeholder')}
    value={query}
    oninput={handleInput}
    bind:this={inputRef}
    aria-label={$_('popup.search.ariaLabel')}
  />
  {#if query}
    <button class="clear-btn" onclick={handleClear} aria-label={$_('popup.search.clearSearch')}>
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
    transition: all var(--transition-fast);
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
