<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '@shared/components/Icon.svelte';

  export interface ContextMenuItem {
    label: string;
    icon?: string;
    onclick: () => void;
    danger?: boolean;
    /** Keyboard equivalent shown right-aligned, e.g. "F2". */
    shortcut?: string;
    /** Draw a divider above this item. */
    separatorBefore?: boolean;
  }

  interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onclose: () => void;
  }

  let { x, y, items, onclose }: Props = $props();
  let menuRef = $state<HTMLDivElement | undefined>(undefined);
  // The menu is remounted on every open, so the anchor never changes during its
  // lifetime — snapshot it rather than tracking the props reactively.
  const anchor = untrack(() => ({ x, y }));
  let position = $state({ left: anchor.x, top: anchor.y });

  $effect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) onclose();
    }
    document.addEventListener('mousedown', handlePointerDown, true);
    return () => document.removeEventListener('mousedown', handlePointerDown, true);
  });

  // Clamp against the real menu box and the real viewport. The previous
  // hardcoded 380/500 bounds let the menu run off the bottom of the popup as
  // soon as it had more than a couple of items.
  $effect(() => {
    if (!menuRef) return;
    const opener = document.activeElement as HTMLElement | null;
    const { offsetWidth: w, offsetHeight: h } = menuRef;
    const margin = 6;
    position = {
      left: Math.max(margin, Math.min(anchor.x, window.innerWidth - w - margin)),
      top: Math.max(margin, Math.min(anchor.y, window.innerHeight - h - margin)),
    };
    menuRef.querySelector<HTMLElement>('.menu-item')?.focus();
    return () => opener?.focus?.();
  });

  function focusItem(index: number) {
    const btns = menuRef?.querySelectorAll<HTMLElement>('.menu-item');
    if (!btns || btns.length === 0) return;
    const clamped = (index + btns.length) % btns.length;
    btns[clamped]?.focus();
  }

  function currentIndex(): number {
    const btns = Array.from(menuRef?.querySelectorAll<HTMLElement>('.menu-item') ?? []);
    return btns.indexOf(document.activeElement as HTMLElement);
  }

  function handleMenuKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(currentIndex() + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(currentIndex() - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(items.length - 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onclose();
    }
  }

  function handleItemClick(item: ContextMenuItem) {
    item.onclick();
    onclose();
  }
</script>

<div
  class="context-menu"
  style="left: {position.left}px; top: {position.top}px"
  bind:this={menuRef}
  role="menu"
  aria-orientation="vertical"
  tabindex="-1"
  onkeydown={handleMenuKeydown}
>
  {#each items as item (item.label)}
    {#if item.separatorBefore}
      <div class="separator" role="separator"></div>
    {/if}
    <button
      class="menu-item"
      class:danger={item.danger}
      onclick={() => handleItemClick(item)}
      role="menuitem"
      tabindex="-1"
    >
      {#if item.icon}
        <span class="menu-icon">
          <Icon name={item.icon} size={13} />
        </span>
      {/if}
      <span class="menu-label">{item.label}</span>
      {#if item.shortcut}
        <kbd class="menu-shortcut">{item.shortcut}</kbd>
      {/if}
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
    min-width: 170px;
    box-shadow: var(--shadow-lg);
    z-index: var(--z-menu);
    animation: scaleIn 0.12s ease-out;
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

  .menu-label {
    flex: 1;
  }

  .menu-shortcut {
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
    line-height: 15px;
    flex-shrink: 0;
  }

  .menu-icon {
    display: flex;
    color: var(--color-text-tertiary);
  }

  .menu-item:hover .menu-icon {
    color: var(--color-text-secondary);
  }

  .menu-item.danger,
  .menu-item.danger .menu-icon {
    color: var(--color-error);
  }

  .menu-item.danger:hover {
    background: var(--color-error-soft);
  }
</style>
