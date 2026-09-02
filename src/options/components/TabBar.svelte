<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Tab {
    id: string;
    label: string;
    icon?: string;
  }

  interface Props {
    tabs: Tab[];
    activeTab: string;
    onchange: (tabId: string) => void;
  }

  let { tabs, activeTab, onchange }: Props = $props();
  let tablistRef = $state<HTMLDivElement | undefined>(undefined);

  function focusTab(index: number) {
    tablistRef?.querySelectorAll<HTMLElement>('.tab')[index]?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex < 0) return;

    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (currentIndex + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;

    e.preventDefault();
    onchange(tabs[next].id);
    focusTab(next);
  }
</script>

<!-- Sticky so the tab set stays reachable on the long Settings and Debug pages. -->
<div class="tab-bar-wrapper">
  <div
    class="tab-bar"
    role="tablist"
    tabindex="-1"
    bind:this={tablistRef}
    onkeydown={handleKeydown}
  >
    {#each tabs as tab (tab.id)}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        id="tab-{tab.id}"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls="tabpanel-{tab.id}"
        tabindex={activeTab === tab.id ? 0 : -1}
        onclick={() => onchange(tab.id)}
      >
        {#if tab.icon}
          <Icon name={tab.icon} size={14} />
        {/if}
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tab-bar-wrapper {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    margin: 0 calc(-1 * var(--space-7)) var(--space-7);
    padding: var(--space-4) var(--space-7);
    background: var(--color-bg-primary);
  }

  /* Content dissolves under the pinned bar instead of being hard-clipped by it. */
  .tab-bar-wrapper::after {
    content: '';
    position: absolute;
    inset: 100% 0 auto 0;
    height: var(--space-5);
    background: linear-gradient(to bottom, var(--color-bg-primary), transparent);
    pointer-events: none;
  }

  .tab-bar {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-secondary);
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: none;
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-smooth);
    white-space: nowrap;
  }

  .tab:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .tab:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .tab.active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-sm);
    font-weight: var(--font-semibold);
  }

  .tab.active :global(svg) {
    color: var(--color-accent);
  }
</style>
