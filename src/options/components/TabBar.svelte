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

  function handleKeydown(e: KeyboardEvent) {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (currentIndex + 1) % tabs.length;
      onchange(tabs[next].id);
      focusTab(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (currentIndex - 1 + tabs.length) % tabs.length;
      onchange(tabs[prev].id);
      focusTab(prev);
    }
  }

  function focusTab(index: number) {
    const tablist = document.querySelector<HTMLElement>('.tab-bar');
    const btns = tablist?.querySelectorAll<HTMLElement>('.tab');
    btns?.[index]?.focus();
  }
</script>

<div class="tab-bar-wrapper">
  <div class="tab-bar" role="tablist" tabindex="-1" onkeydown={handleKeydown}>
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
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
    margin-bottom: var(--space-7);
  }

  .tab-bar {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-secondary);
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
