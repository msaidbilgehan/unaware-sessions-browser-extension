<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';
  import InlineEdit from '@shared/components/InlineEdit.svelte';
  import SessionDetail from './SessionDetail.svelte';

  interface Props {
    session: SessionProfile;
    isActive: boolean;
    hasOriginData?: boolean;
    tabCount?: number;
    onswitch: (sessionId: string) => void;
    ondelete: (sessionId: string) => void;
    onrename: (sessionId: string, newName: string) => void;
    oncontextmenu?: (e: MouseEvent, sessionId: string) => void;
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
    hasOriginData = false,
    tabCount = 0,
    onswitch,
    ondelete,
    onrename,
    oncontextmenu,
    forceEditing = false,
    draggable = false,
    ondragstart,
    ondragover,
    ondragend,
    ondrop,
  }: Props = $props();

  let showActions = $state(false);
  let editing = $state(false);
  let expanded = $state(false);

  $effect(() => {
    if (forceEditing) {
      editing = true;
    }
  });

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    ondelete(session.id);
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault();
    editing = true;
  }

  function handleRename(newName: string) {
    onrename(session.id, newName);
    editing = false;
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    oncontextmenu?.(e, session.id);
  }

  function toggleDetail(e: MouseEvent) {
    e.stopPropagation();
    expanded = !expanded;
  }
</script>

<div
  class="session-item"
  class:active={isActive}
  role="button"
  tabindex="0"
  style="--session-color: {session.color}"
  onmouseenter={() => (showActions = true)}
  onmouseleave={() => (showActions = false)}
  onclick={() => onswitch(session.id)}
  onkeydown={(e) => e.key === 'Enter' && onswitch(session.id)}
  oncontextmenu={handleContextMenu}
  aria-label="Switch to session {session.name}"
  title={session.name}
  draggable={draggable ? 'true' : undefined}
  {ondragstart}
  {ondragover}
  {ondragend}
  {ondrop}
>
  {#if draggable}
    <span class="grip" aria-hidden="true">
      <Icon name="grip-vertical" size={12} />
    </span>
  {/if}

  {#if session.emoji}
    <span class="emoji">{session.emoji}</span>
  {:else}
    <span class="dot" style="background-color: {session.color}"></span>
  {/if}

  {#if editing}
    <span
      class="name-edit"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <InlineEdit value={session.name} onsave={handleRename} oncancel={() => (editing = false)} />
    </span>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="name" ondblclick={handleDoubleClick}>{session.name}</span>
  {/if}

  {#if hasOriginData && !isActive}
    <span class="origin-badge" title="Has saved data for this site">
      <Icon name="globe" size={10} />
    </span>
  {/if}

  {#if session.pinned}
    <span class="pin-badge" aria-label="Pinned">
      <Icon name="pin" size={10} />
    </span>
  {/if}

  {#if tabCount > 0}
    <span class="tab-count" title="{tabCount} tab{tabCount === 1 ? '' : 's'}">{tabCount}</span>
  {/if}

  {#if isActive}
    <span class="badge">active</span>
  {/if}

  {#if showActions}
    <button
      class="expand-btn"
      onclick={toggleDetail}
      aria-label={expanded ? 'Collapse details' : 'Expand details'}
    >
      <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
    </button>
    <button class="delete-btn" onclick={handleDelete} aria-label="Delete session {session.name}">
      <Icon name="x" size={14} />
    </button>
  {/if}
</div>

{#if expanded}
  <SessionDetail sessionId={session.id} />
{/if}

<style>
  .session-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-left: 3px solid var(--session-color);
    box-shadow: var(--shadow-sm);
  }

  .session-item:hover {
    background: var(--color-bg-secondary);
    box-shadow: var(--shadow-md);
  }

  .session-item.active {
    background: color-mix(in srgb, var(--session-color) 8%, var(--color-bg-elevated));
    border-color: color-mix(in srgb, var(--session-color) 20%, var(--color-border-secondary));
  }

  .grip {
    color: var(--color-text-tertiary);
    cursor: grab;
    flex-shrink: 0;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .emoji {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
  }

  .name {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name-edit {
    flex: 1;
  }

  .origin-badge {
    color: var(--color-accent);
    flex-shrink: 0;
    opacity: 0.7;
  }

  .pin-badge {
    color: var(--color-warning);
    flex-shrink: 0;
  }

  .tab-count {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 0 var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-medium);
    min-width: 18px;
    text-align: center;
  }

  .badge {
    font-size: 10px;
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-medium);
    flex-shrink: 0;
  }

  .expand-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    line-height: 1;
    display: flex;
  }

  .expand-btn:hover {
    color: var(--color-text-secondary);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    line-height: 1;
    display: flex;
  }

  .delete-btn:hover {
    color: var(--color-error);
    background: var(--color-error-soft);
  }
</style>
