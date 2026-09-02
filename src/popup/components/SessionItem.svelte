<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { formatRelativeTime } from '@shared/utils';
  import Icon from '@shared/components/Icon.svelte';
  import InlineEdit from '@shared/components/InlineEdit.svelte';
  import SessionDetail from './SessionDetail.svelte';

  interface Props {
    session: SessionProfile;
    isActive: boolean;
    isSwitching?: boolean;
    hasOriginData?: boolean;
    tabCount?: number;
    onswitch: (sessionId: string) => void;
    ondelete: (sessionId: string) => void;
    onrename: (sessionId: string, newName: string) => void;
    /** Opens the shared action menu; `anchor` positions it when not from a mouse event. */
    onmenu?: (position: { x: number; y: number }, sessionId: string) => void;
    forceEditing?: boolean;
    draggable?: boolean;
    ondragstart?: (e: DragEvent) => void;
    ondragover?: (e: DragEvent) => void;
    ondragend?: (e: DragEvent) => void;
    ondrop?: (e: DragEvent) => void;
  }

  let {
    session,
    isActive,
    isSwitching = false,
    hasOriginData = false,
    tabCount = 0,
    onswitch,
    ondelete,
    onrename,
    onmenu,
    forceEditing = false,
    draggable = false,
    ondragstart,
    ondragover,
    ondragend,
    ondrop,
  }: Props = $props();

  let editing = $state(false);
  let expanded = $state(false);
  let rowRef = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => {
    if (forceEditing) {
      editing = true;
    }
  });

  function handleRename(newName: string) {
    onrename(session.id, newName);
    editing = false;
  }

  /** Anchor a keyboard-opened menu to the row instead of the pointer. */
  function menuAnchor(): { x: number; y: number } {
    const rect = rowRef?.getBoundingClientRect();
    return rect ? { x: rect.right - 8, y: rect.bottom - 4 } : { x: 0, y: 0 };
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    onmenu?.({ x: e.clientX, y: e.clientY }, session.id);
  }

  // Row-level shortcuts. The primary button owns Enter/Space (switch); these
  // give the destructive and secondary actions keyboard parity with the menu
  // without adding a tab stop per action to a list that can hold dozens of rows.
  function handleRowKeydown(e: KeyboardEvent) {
    if (e.key === 'F2') {
      e.preventDefault();
      editing = true;
    } else if (e.key === 'Delete') {
      e.preventDefault();
      ondelete(session.id);
    } else if (e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      expanded = true;
    } else if (e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      expanded = false;
    }
  }
</script>

<div
  class="session-item"
  class:active={isActive}
  class:switching={isSwitching}
  class:expanded
  style="--session-color: {session.color}"
  bind:this={rowRef}
  role="group"
  aria-label={session.name}
  draggable={draggable && !isSwitching && !editing ? 'true' : undefined}
  {ondragstart}
  {ondragover}
  {ondragend}
  {ondrop}
>
  <div class="item-content">
    {#if draggable}
      <span class="grip" aria-hidden="true">
        <Icon name="grip-vertical" size={10} />
      </span>
    {/if}

    {#if editing}
      <span class="indicator">
        {#if session.emoji}
          <span class="emoji">{session.emoji}</span>
        {:else}
          <span class="dot" style="background-color: {session.color}"></span>
        {/if}
      </span>
      <span class="name-edit">
        <InlineEdit value={session.name} onsave={handleRename} oncancel={() => (editing = false)} />
      </span>
    {:else}
      <button
        class="row-main"
        onclick={() => !isSwitching && onswitch(session.id)}
        ondblclick={() => (editing = true)}
        oncontextmenu={handleContextMenu}
        onkeydown={handleRowKeydown}
        disabled={isSwitching}
        aria-label={isActive
          ? `${session.name} — active on this site`
          : `Switch this tab to ${session.name}`}
        aria-busy={isSwitching}
      >
        <span class="indicator">
          {#if isSwitching}
            <span class="switch-spinner" style="border-top-color: {session.color}"></span>
          {:else if session.emoji}
            <span class="emoji">{session.emoji}</span>
          {:else}
            <span class="dot" style="background-color: {session.color}"></span>
          {/if}
        </span>

        <span class="name-group">
          <span class="name">{session.name}</span>
          {#if isSwitching}
            <span class="meta">Switching…</span>
          {:else if session.lastRefreshedAt}
            <span class="meta" title={new Date(session.lastRefreshedAt).toLocaleString()}>
              Saved {formatRelativeTime(session.lastRefreshedAt)}
            </span>
          {/if}
        </span>

        <span class="badges">
          {#if session.pinned}
            <span class="badge pin-badge" title="Pinned">
              <Icon name="pin" size={9} />
              <span class="sr-only">Pinned</span>
            </span>
          {/if}

          {#if hasOriginData && !isActive}
            <span class="badge data-badge" title="Has saved data for this site">
              <Icon name="database" size={9} />
              <span class="sr-only">Has saved data for this site</span>
            </span>
          {/if}

          {#if tabCount > 0}
            <span class="badge tab-badge" title="Open in {tabCount} tab{tabCount === 1 ? '' : 's'}">
              {tabCount}
              <span class="sr-only">open tabs</span>
            </span>
          {/if}

          {#if isActive}
            <span class="badge active-badge">Active</span>
          {/if}
        </span>
      </button>

      <div class="row-actions">
        <button
          class="action-icon"
          onclick={() => (expanded = !expanded)}
          aria-expanded={expanded}
          aria-label={expanded
            ? `Hide details for ${session.name}`
            : `Show details for ${session.name}`}
          title={expanded ? 'Hide details' : 'Show details'}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
        </button>
        <button
          class="action-icon"
          onclick={(e) => {
            e.stopPropagation();
            onmenu?.(menuAnchor(), session.id);
          }}
          aria-haspopup="menu"
          aria-label="More actions for {session.name}"
          title="More actions"
        >
          <Icon name="more-vertical" size={13} />
        </button>
      </div>
    {/if}
  </div>

  {#if expanded}
    <SessionDetail sessionId={session.id} />
  {/if}
</div>

<style>
  .session-item {
    border-radius: var(--radius-lg);
    transition:
      background var(--transition-smooth),
      border-color var(--transition-smooth),
      box-shadow var(--transition-smooth);
    position: relative;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-left: 3px solid var(--session-color);
    overflow: hidden;
  }

  .session-item:hover {
    background: var(--color-bg-secondary);
    border-color: var(--color-border-primary);
    border-left-color: var(--session-color);
    box-shadow: var(--shadow-sm);
  }

  .session-item.active {
    background: color-mix(in srgb, var(--session-color) 6%, var(--color-bg-elevated));
    border-color: color-mix(in srgb, var(--session-color) 25%, var(--color-border-secondary));
    border-left-width: 4px;
    border-left-color: var(--session-color);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--session-color) 10%, transparent),
      var(--shadow-xs);
  }

  .session-item.switching {
    opacity: 0.75;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-right: var(--space-2);
  }

  .grip {
    color: var(--color-text-tertiary);
    cursor: grab;
    flex-shrink: 0;
    opacity: 0.35;
    padding-left: var(--space-3);
    transition: opacity var(--transition-fast);
    display: flex;
  }

  .session-item:hover .grip {
    opacity: 1;
  }

  /* The primary target fills the row so the whole card is clickable, while the
     secondary actions stay real siblings instead of buttons nested in a button. */
  .row-main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    padding: var(--space-4);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    text-align: left;
    cursor: pointer;
    color: inherit;
  }

  .row-main:disabled {
    cursor: default;
  }

  .row-main:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--session-color) 15%, transparent);
  }

  .emoji {
    font-size: var(--text-lg);
    line-height: 1;
    flex-shrink: 0;
  }

  .switch-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-border-primary);
    border-top-color: var(--session-color);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  .name-group {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .name {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: var(--leading-snug);
  }

  .meta {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    line-height: 1;
  }

  .name-edit {
    flex: 1;
    min-width: 0;
    padding: var(--space-4) 0;
  }

  .badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pin-badge {
    color: var(--color-warning);
  }

  .data-badge {
    color: var(--color-accent);
    opacity: 0.6;
  }

  .tab-badge {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    min-width: 16px;
    height: 16px;
    line-height: 16px;
  }

  .active-badge {
    font-size: var(--text-2xs);
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    line-height: 14px;
  }

  /* Always rendered and always reachable — the previous hover-gated actions
     were invisible to keyboard and screen-reader users entirely. */
  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .action-icon {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .action-icon:hover {
    color: var(--color-text-primary);
    background: var(--color-interactive-hover);
  }

  .action-icon:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
