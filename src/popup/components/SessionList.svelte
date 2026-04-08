<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import SessionItem from './SessionItem.svelte';
  import OnboardingEmpty from './OnboardingEmpty.svelte';

  interface Props {
    sessions: SessionProfile[];
    activeSessionId: string | undefined;
    tabCounts: Record<string, number>;
    sessionsWithOriginData: Set<string>;
    searchQuery: string;
    onswitch: (sessionId: string) => void;
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
    ondelete,
    onrename,
    oncontextmenu,
    oncreate,
    ondragend,
  }: Props = $props();

  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : sessions,
  );

  const groupedSessions = $derived(() => {
    const pinned = filteredSessions.filter((s) => s.pinned);
    const active = filteredSessions.filter((s) => !s.pinned && (tabCounts[s.id] ?? 0) > 0);
    const inactive = filteredSessions.filter((s) => !s.pinned && (tabCounts[s.id] ?? 0) === 0);
    return [...pinned, ...active, ...inactive];
  });

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
      const items = [...groupedSessions()];
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
    {#each groupedSessions() as session, i (session.id)}
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
  {/if}
</div>

<style>
  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .empty {
    text-align: center;
    padding: var(--space-6);
  }

  .empty p {
    margin: 0;
    font-size: var(--text-base);
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
