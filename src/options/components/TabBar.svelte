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
</script>

<div class="tab-bar-wrapper">
  <div class="tab-bar" role="tablist">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        role="tab"
        aria-selected={activeTab === tab.id}
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
