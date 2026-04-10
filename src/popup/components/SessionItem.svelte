<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { formatRelativeTime } from '@shared/utils';
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
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onswitch(session.id))}
  oncontextmenu={handleContextMenu}
  aria-label="Switch to session {session.name}"
  title={session.name}
  draggable={draggable ? 'true' : undefined}
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

    <span class="indicator">
      {#if session.emoji}
        <span class="emoji">{session.emoji}</span>
      {:else}
        <span class="dot" style="background-color: {session.color}"></span>
      {/if}
    </span>

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
      <div class="name-group">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="name" ondblclick={handleDoubleClick}>{session.name}</span>
        {#if session.lastRefreshedAt}
          <span class="last-refreshed" title={new Date(session.lastRefreshedAt).toLocaleString()}>
            {formatRelativeTime(session.lastRefreshedAt)}
          </span>
        {/if}
      </div>
    {/if}

    <div class="badges">
      {#if session.pinned}
        <span class="badge pin-badge" aria-label="Pinned">
          <Icon name="pin" size={9} />
        </span>
      {/if}

      {#if hasOriginData && !isActive}
        <span class="badge data-badge" title="Has saved data for this site">
          <Icon name="database" size={9} />
        </span>
      {/if}

      {#if tabCount > 0}
        <span class="badge tab-badge" title="{tabCount} tab{tabCount === 1 ? '' : 's'}">
          {tabCount}
        </span>
      {/if}

      {#if isActive}
        <span class="badge active-badge">active</span>
      {/if}
    </div>

    {#if showActions}
      <div class="hover-actions">
        <button
          class="action-icon"
          onclick={toggleDetail}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={11} />
        </button>
        <button class="action-icon danger" onclick={handleDelete} aria-label="Delete session {session.name}">
          <Icon name="x" size={12} />
        </button>
      </div>
    {/if}
  </div>
</div>

{#if expanded}
  <SessionDetail sessionId={session.id} />
{/if}

<style>
  .session-item {
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-smooth);
    position: relative;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-left: 3px solid var(--session-color);
  }

  .session-item:hover,
  .session-item:focus-visible {
    background: var(--color-bg-secondary);
    border-color: var(--color-border-primary);
    box-shadow: var(--shadow-sm);
  }

  .session-item:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .session-item.active {
    background: color-mix(in srgb, var(--session-color) 6%, var(--color-bg-elevated));
    border-color: color-mix(in srgb, var(--session-color) 25%, var(--color-border-secondary));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--session-color) 10%, transparent),
                var(--shadow-xs);
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4);
  }

  .grip {
    color: var(--color-text-tertiary);
    cursor: grab;
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity var(--transition-fast);
  }

  .session-item:hover .grip {
    opacity: 1;
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

  .last-refreshed {
    font-size: 10px;
    color: var(--color-text-tertiary);
    line-height: 1;
  }

  .name-edit {
    flex: 1;
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
    font-size: 10px;
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    min-width: 16px;
    height: 16px;
    text-align: center;
    line-height: 16px;
  }

  .active-badge {
    font-size: 10px;
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    line-height: 14px;
  }

  .hover-actions {
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
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    line-height: 1;
    display: flex;
    transition: all var(--transition-fast);
  }

  .action-icon:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .action-icon.danger:hover {
    color: var(--color-error);
    background: var(--color-error-soft);
  }
</style>
