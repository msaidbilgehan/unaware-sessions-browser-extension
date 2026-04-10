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
  let focusedIndex = $state(0);

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

  // Focus first menu item on open
  $effect(() => {
    if (menuRef) {
      const firstItem = menuRef.querySelector<HTMLElement>('.menu-item');
      firstItem?.focus();
    }
  });

  function handleMenuKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % items.length;
      focusItem(focusedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + items.length) % items.length;
      focusItem(focusedIndex);
    }
  }

  function focusItem(index: number) {
    if (!menuRef) return;
    const btns = menuRef.querySelectorAll<HTMLElement>('.menu-item');
    btns[index]?.focus();
  }

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
  tabindex="-1"
  onkeydown={handleMenuKeydown}
>
  {#each items as item, i}
    {#if i > 0 && item.danger}
      <div class="separator"></div>
    {/if}
    <button
      class="menu-item"
      class:danger={item.danger}
      onclick={() => handleItemClick(item)}
      role="menuitem"
    >
      {#if item.icon}
        <span class="menu-icon">
          <Icon name={item.icon} size={13} />
        </span>
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
    border-radius: var(--radius-xl);
    padding: var(--space-2);
    min-width: 150px;
    box-shadow: var(--shadow-lg);
    z-index: 900;
    animation: slideUp 0.12s ease-out;
  }

  .separator {
    height: 1px;
    background: var(--color-border-secondary);
    margin: var(--space-2) var(--space-3);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: none;
    background: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
  }

  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--color-interactive-hover);
    outline: none;
  }

  .menu-item:focus-visible {
    box-shadow: var(--shadow-focus);
  }

  .menu-icon {
    display: flex;
    color: var(--color-text-tertiary);
  }

  .menu-item:hover .menu-icon {
    color: var(--color-text-secondary);
  }

  .menu-item.danger {
    color: var(--color-error);
  }

  .menu-item.danger .menu-icon {
    color: var(--color-error);
  }

  .menu-item.danger:hover {
    background: var(--color-error-soft);
  }
</style>
