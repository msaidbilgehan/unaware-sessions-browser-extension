<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { SvelteSet } from 'svelte/reactivity';
  import { UNGROUPED_KEY, type SessionGrouping } from '../session-grouping';
  import SessionItem from './SessionItem.svelte';
  import OnboardingEmpty from './OnboardingEmpty.svelte';

  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    /** Computed once in App so the 1-9 shortcuts index the same order. */
    grouping: SessionGrouping;
    /** Full session list, used for reordering and the empty state. */
    sessions: SessionProfile[];
    activeSessionId: string | undefined;
    switchingSessionId: string | null;
    tabCounts: Record<string, number>;
    sessionsWithOriginData: Set<string>;
    searchQuery: string;
    onswitch: (sessionId: string) => void;
    ondetach: () => void;
    ondelete: (sessionId: string) => void;
    onrename: (sessionId: string, newName: string) => void;
    editingSessionId: string | null;
    onmenu: (position: { x: number; y: number }, sessionId: string) => void;
    oncreate: () => void;
    onclearsearch: () => void;
    /** Receives the complete session order, not just the visible slice. */
    onreorder: (orderedIds: string[]) => void;
  }

  let {
    grouping,
    sessions,
    activeSessionId,
    switchingSessionId,
    tabCounts,
    sessionsWithOriginData,
    searchQuery,
    onswitch,
    ondetach,
    ondelete,
    onrename,
    editingSessionId,
    onmenu,
    oncreate,
    onclearsearch,
    onreorder,
  }: Props = $props();

  let draggingId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let showOtherSessions = $state(false);
  let collapsedDomains = new SvelteSet<string>();

  // Auto-expand other sessions when no site-specific sessions exist
  const effectiveShowOther = $derived(
    showOtherSessions || (grouping.thisSite.length === 0 && grouping.other.length > 0),
  );

  const flattenSingleBucket = $derived(
    grouping.domainGroups.length === 1 && grouping.domainGroups[0][0] === UNGROUPED_KEY,
  );

  function toggleDomain(domain: string) {
    if (collapsedDomains.has(domain)) collapsedDomains.delete(domain);
    else collapsedDomains.add(domain);
  }

  // ── Drag reordering ───────────────────────────────────────────────
  //
  // Reordering is expressed as "move A to where B is" against the *complete*
  // session list. Sending only the visible slice would push every filtered-out
  // or collapsed session to the end of the stored order, silently reshuffling
  // sessions the user cannot even see. Drops are confined to the group the drag
  // started in, because the list is regrouped by site on every render and a
  // cross-group move would produce no visible change.
  function handleDragStart(e: DragEvent, sessionId: string) {
    draggingId = sessionId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', sessionId);
    }
  }

  function handleDragOver(e: DragEvent, sessionId: string, group: readonly SessionProfile[]) {
    if (!draggingId || !group.some((s) => s.id === draggingId)) return;
    e.preventDefault();
    dragOverId = sessionId;
  }

  function handleDrop(e: DragEvent, targetId: string, group: readonly SessionProfile[]) {
    e.preventDefault();
    const sourceId = draggingId;
    resetDrag();
    if (!sourceId || sourceId === targetId) return;
    if (!group.some((s) => s.id === sourceId)) return;

    const ids = sessions.map((s) => s.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;

    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    onreorder(ids);
  }

  function resetDrag() {
    draggingId = null;
    dragOverId = null;
  }
</script>

<div class="session-list">
  {#if sessions.length === 0}
    <OnboardingEmpty {oncreate} />
  {:else if grouping.filtered.length === 0}
    <div class="empty-search">
      <Icon name="search" size={18} />
      <p>No sessions match “{searchQuery}”</p>
      <button class="text-btn" onclick={onclearsearch}>Clear search</button>
    </div>
  {:else}
    <!-- Browsing with no session: the tab uses the browser's own cookie jar. -->
    <button
      class="default-item"
      class:active={!activeSessionId}
      onclick={ondetach}
      aria-current={!activeSessionId ? 'true' : undefined}
      title="Detach this tab: saves the current session's data, clears this site's cookies, then reloads."
    >
      <span class="default-icon">
        <Icon name="globe" size={13} />
      </span>
      <span class="default-text">
        <span class="default-label">No session</span>
        <span class="default-meta">Use the browser's own cookies</span>
      </span>
      {#if !activeSessionId}
        <span class="default-badge">Active</span>
      {/if}
    </button>

    {#if grouping.thisSite.length > 0}
      <div class="group">
        <div class="group-header">
          <span class="group-label">This site</span>
          <span class="group-count">{grouping.thisSite.length}</span>
          <span class="group-line"></span>
        </div>
        <div class="group-items">
          {#each grouping.thisSite as session (session.id)}
            <div
              class="drag-wrapper"
              class:drag-over={dragOverId === session.id && draggingId !== session.id}
            >
              <SessionItem
                {session}
                isActive={session.id === activeSessionId}
                isSwitching={session.id === switchingSessionId}
                hasOriginData={sessionsWithOriginData.has(session.id)}
                tabCount={tabCounts[session.id] ?? 0}
                {onswitch}
                {ondelete}
                {onrename}
                forceEditing={editingSessionId === session.id}
                {onmenu}
                draggable={grouping.thisSite.length > 1}
                ondragstart={(e) => handleDragStart(e, session.id)}
                ondragover={(e) => handleDragOver(e, session.id, grouping.thisSite)}
                ondrop={(e) => handleDrop(e, session.id, grouping.thisSite)}
                ondragend={resetDrag}
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if grouping.other.length > 0}
      <div class="group">
        <button
          class="group-toggle"
          onclick={() => (showOtherSessions = !showOtherSessions)}
          aria-expanded={effectiveShowOther}
        >
          <span class="group-header">
            <span class="group-label">Other sessions</span>
            <span class="group-count">{grouping.other.length}</span>
            <span class="group-line"></span>
          </span>
          <span class="toggle-icon" class:open={effectiveShowOther}>
            <Icon name="chevron-down" size={12} />
          </span>
        </button>
        {#if effectiveShowOther}
          <div class="other-list">
            {#if flattenSingleBucket}
              <div class="domain-items flat">
                {#each grouping.other as session (session.id)}
                  <div
                    class="drag-wrapper"
                    class:drag-over={dragOverId === session.id && draggingId !== session.id}
                  >
                    <SessionItem
                      {session}
                      isActive={false}
                      isSwitching={session.id === switchingSessionId}
                      hasOriginData={false}
                      tabCount={tabCounts[session.id] ?? 0}
                      {onswitch}
                      {ondelete}
                      {onrename}
                      forceEditing={editingSessionId === session.id}
                      {onmenu}
                      draggable={grouping.other.length > 1}
                      ondragstart={(e) => handleDragStart(e, session.id)}
                      ondragover={(e) => handleDragOver(e, session.id, grouping.other)}
                      ondrop={(e) => handleDrop(e, session.id, grouping.other)}
                      ondragend={resetDrag}
                    />
                  </div>
                {/each}
              </div>
            {:else}
              {#each grouping.domainGroups as [domain, domainSessions] (domain)}
                {@const isCollapsed = collapsedDomains.has(domain)}
                <div class="domain-folder">
                  <button
                    class="domain-toggle"
                    onclick={() => toggleDomain(domain)}
                    aria-expanded={!isCollapsed}
                  >
                    <span class="domain-chevron" class:open={!isCollapsed}>
                      <Icon name="chevron-right" size={10} />
                    </span>
                    <Icon name={domain === UNGROUPED_KEY ? 'folder' : 'globe'} size={12} />
                    <span class="domain-name">
                      {domain === UNGROUPED_KEY ? 'No saved sites' : domain}
                    </span>
                    <span class="group-count">{domainSessions.length}</span>
                  </button>
                  {#if !isCollapsed}
                    <div class="domain-items">
                      {#each domainSessions as session (session.id)}
                        <div
                          class="drag-wrapper"
                          class:drag-over={dragOverId === session.id && draggingId !== session.id}
                        >
                          <SessionItem
                            {session}
                            isActive={false}
                            isSwitching={session.id === switchingSessionId}
                            hasOriginData={false}
                            tabCount={tabCounts[session.id] ?? 0}
                            {onswitch}
                            {ondelete}
                            {onrename}
                            forceEditing={editingSessionId === session.id}
                            {onmenu}
                            draggable={domainSessions.length > 1}
                            ondragstart={(e) => handleDragStart(e, session.id)}
                            ondragover={(e) => handleDragOver(e, session.id, domainSessions)}
                            ondrop={(e) => handleDrop(e, session.id, domainSessions)}
                            ondragend={resetDrag}
                          />
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .default-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    cursor: pointer;
    color: var(--color-text-tertiary);
    transition: all var(--transition-smooth);
    background: transparent;
    font-family: var(--font-sans);
    text-align: left;
  }

  .default-item:hover {
    background: var(--color-interactive-hover);
    color: var(--color-text-secondary);
    border-color: var(--color-border-primary);
  }

  .default-item:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .default-item.active {
    border-color: var(--color-border-primary);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .default-icon {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .default-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .default-label {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }

  .default-meta {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    line-height: 1;
  }

  .default-badge {
    font-size: var(--text-2xs);
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    line-height: 14px;
    flex-shrink: 0;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-items,
  .domain-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
  }

  .group-label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .group-count {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .group-line {
    flex: 1;
    height: 1px;
    background: var(--color-border-secondary);
  }

  .group-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: none;
    border: none;
    padding: var(--space-2) 0;
    cursor: pointer;
    width: 100%;
    font-family: var(--font-sans);
    border-radius: var(--radius-md);
  }

  .group-toggle:hover .group-label {
    color: var(--color-text-secondary);
  }

  .group-toggle:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .toggle-icon {
    color: var(--color-text-tertiary);
    transition: transform var(--transition-fast);
    display: flex;
    flex-shrink: 0;
  }

  .toggle-icon.open {
    transform: rotate(180deg);
  }

  .other-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ── Domain folders ──────────────────────────────────────────── */

  .domain-folder {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .domain-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: none;
    padding: var(--space-2) var(--space-1);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    border-radius: var(--radius-md);
    transition: color var(--transition-fast);
    width: 100%;
  }

  .domain-toggle:hover {
    color: var(--color-text-secondary);
  }

  .domain-toggle:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .domain-toggle :global(svg) {
    flex-shrink: 0;
  }

  .domain-chevron {
    display: flex;
    transition: transform var(--transition-fast);
    color: var(--color-text-tertiary);
  }

  .domain-chevron.open {
    transform: rotate(90deg);
  }

  .domain-name {
    font-weight: var(--font-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    text-align: left;
  }

  .domain-items {
    padding-left: var(--space-5);
  }

  .domain-items.flat {
    padding-left: 0;
  }

  .empty-search {
    text-align: center;
    padding: var(--space-7) var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .empty-search :global(svg) {
    color: var(--color-text-tertiary);
    opacity: 0.5;
  }

  .empty-search p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }

  .text-btn:hover {
    background: var(--color-accent-soft);
  }

  .text-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .drag-wrapper {
    transition: transform var(--transition-fast);
    border-top: 2px solid transparent;
  }

  .drag-wrapper.drag-over {
    border-top-color: var(--color-accent);
  }
</style>
