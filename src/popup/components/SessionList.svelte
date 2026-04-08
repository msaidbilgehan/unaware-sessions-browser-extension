<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import SessionItem from './SessionItem.svelte';
  import OnboardingEmpty from './OnboardingEmpty.svelte';

  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    sessions: SessionProfile[];
    activeSessionId: string | undefined;
    tabCounts: Record<string, number>;
    sessionsWithOriginData: Set<string>;
    searchQuery: string;
    onswitch: (sessionId: string) => void;
    onunassign: () => void;
    ondelete: (sessionId: string) => void;
    onrename: (sessionId: string, newName: string) => void;
    oncontextmenu: (e: MouseEvent, sessionId: string) => void;
    oncreate: () => void;
    ondragend: (orderedIds: string[]) => void;
  }

  let {
    sessions,
    activeSessionId,
    tabCounts,
    sessionsWithOriginData,
    searchQuery,
    onswitch,
    onunassign,
    ondelete,
    onrename,
    oncontextmenu,
    oncreate,
    ondragend,
  }: Props = $props();

  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let showOtherSessions = $state(false);

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : sessions,
  );

  // Sessions relevant to current origin (have data or are active on this tab)
  const thisSiteSessions = $derived(
    filteredSessions.filter((s) => sessionsWithOriginData.has(s.id) || s.id === activeSessionId),
  );

  // All other sessions
  const otherSessions = $derived(
    filteredSessions.filter((s) => !sessionsWithOriginData.has(s.id) && s.id !== activeSessionId),
  );

  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
  }

  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      const allVisible = [...thisSiteSessions, ...(showOtherSessions ? otherSessions : [])];
      const items = [...allVisible];
      const [moved] = items.splice(dragIndex, 1);
      items.splice(index, 0, moved);
      ondragend(items.map((s) => s.id));
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }
</script>

<div class="session-list">
  {#if sessions.length === 0}
    <OnboardingEmpty {oncreate} />
  {:else if filteredSessions.length === 0}
    <div class="empty">
      <p>No sessions match "{searchQuery}"</p>
    </div>
  {:else}
    <div
      class="default-item"
      class:active={!activeSessionId}
      role="button"
      tabindex="0"
      onclick={onunassign}
      onkeydown={(e) => e.key === 'Enter' && onunassign()}
    >
      <Icon name="globe" size={14} />
      <span class="default-label">Default (no session)</span>
      {#if !activeSessionId}
        <span class="default-badge">active</span>
      {/if}
    </div>

    {#if thisSiteSessions.length > 0}
      <div class="group">
        <span class="group-label">This site</span>
        {#each thisSiteSessions as session, i (session.id)}
          <div class="drag-wrapper" class:drag-over={dragOverIndex === i && dragIndex !== i}>
            <SessionItem
              {session}
              isActive={session.id === activeSessionId}
              hasOriginData={sessionsWithOriginData.has(session.id)}
              tabCount={tabCounts[session.id] ?? 0}
              {onswitch}
              {ondelete}
              {onrename}
              {oncontextmenu}
              draggable={true}
              ondragstart={(e) => handleDragStart(e, i)}
              ondragover={(e) => handleDragOver(e, i)}
              ondrop={(e) => handleDrop(e, i)}
              ondragend={handleDragEnd}
            />
          </div>
        {/each}
      </div>
    {/if}

    {#if otherSessions.length > 0}
      <div class="group other">
        <button
          class="group-toggle"
          onclick={() => (showOtherSessions = !showOtherSessions)}
          aria-expanded={showOtherSessions}
        >
          <span class="group-label">Other sessions ({otherSessions.length})</span>
          <span class="toggle-chevron" class:open={showOtherSessions}>&#9662;</span>
        </button>
        {#if showOtherSessions}
          {#each otherSessions as session, j (session.id)}
            {@const idx = thisSiteSessions.length + j}
            <div class="drag-wrapper" class:drag-over={dragOverIndex === idx && dragIndex !== idx}>
              <SessionItem
                {session}
                isActive={false}
                hasOriginData={false}
                tabCount={tabCounts[session.id] ?? 0}
                {onswitch}
                {ondelete}
                {onrename}
                {oncontextmenu}
                draggable={true}
                ondragstart={(e) => handleDragStart(e, idx)}
                ondragover={(e) => handleDragOver(e, idx)}
                ondrop={(e) => handleDrop(e, idx)}
                ondragend={handleDragEnd}
              />
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    {#if thisSiteSessions.length === 0 && !showOtherSessions}
      <div class="empty">
        <p>No sessions for this site yet.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .default-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border-primary);
    cursor: pointer;
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .default-item:hover {
    background: var(--color-interactive-hover);
    color: var(--color-text-secondary);
  }

  .default-item.active {
    border-style: solid;
    border-color: var(--color-border-secondary);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .default-label {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .default-badge {
    font-size: 10px;
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-medium);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .group-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    padding: var(--space-2) 0;
    cursor: pointer;
    width: 100%;
    font-family: var(--font-sans);
  }

  .group-toggle:hover .group-label {
    color: var(--color-text-secondary);
  }

  .toggle-chevron {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    transition: transform var(--transition-fast);
  }

  .toggle-chevron.open {
    transform: rotate(180deg);
  }

  .other {
    opacity: 0.7;
  }

  .other:hover {
    opacity: 1;
  }

  .empty {
    text-align: center;
    padding: var(--space-6) var(--space-4);
  }

  .empty p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .drag-wrapper {
    transition: transform var(--transition-fast);
  }

  .drag-wrapper.drag-over {
    border-top: 2px solid var(--color-accent);
    padding-top: var(--space-1);
  }
</style>
