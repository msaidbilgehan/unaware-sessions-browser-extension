<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  export interface ContextMenuItem {
    label: string;
    icon?: string;
    onclick: () => void;
    danger?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onclose: () => void;
  }

  let { x, y, items, onclose }: Props = $props();
  let menuRef = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        onclose();
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  // Clamp to popup bounds
  const clampedX = $derived(Math.min(x, 380 - 160));
  const clampedY = $derived(Math.min(y, 500));

  function handleItemClick(item: ContextMenuItem) {
    item.onclick();
    onclose();
  }
</script>

<div
  class="context-menu"
  style="left: {clampedX}px; top: {clampedY}px"
  bind:this={menuRef}
  role="menu"
>
  {#each items as item}
    <button
      class="menu-item"
      class:danger={item.danger}
      onclick={() => handleItemClick(item)}
      role="menuitem"
    >
      {#if item.icon}
        <Icon name={item.icon} size={14} />
      {/if}
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    min-width: 140px;
    box-shadow: var(--shadow-lg);
    z-index: 900;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
  }

  .menu-item:hover {
    background: var(--color-interactive-hover);
  }

  .menu-item.danger {
    color: var(--color-error);
  }

  .menu-item.danger:hover {
    background: var(--color-error-soft);
  }
</style>
