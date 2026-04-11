<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { SvelteSet } from 'svelte/reactivity';
  import { extractDomain } from '@shared/utils';
  import SessionItem from './SessionItem.svelte';
  import OnboardingEmpty from './OnboardingEmpty.svelte';

  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    sessions: SessionProfile[];
    activeSessionId: string | undefined;
    switchingSessionId: string | null;
    tabCounts: Record<string, number>;
    sessionsWithOriginData: Set<string>;
    sessionOriginMap: Record<string, string[]>;
    currentOrigin: string;
    searchQuery: string;
    onswitch: (sessionId: string) => void;
    onunassign: () => void;
    ondelete: (sessionId: string) => void;
    onrename: (sessionId: string, newName: string) => void;
    editingSessionId: string | null;
    oncontextmenu: (e: MouseEvent, sessionId: string) => void;
    oncreate: () => void;
    ondragend: (orderedIds: string[]) => void;
  }

  let {
    sessions,
    activeSessionId,
    switchingSessionId,
    tabCounts,
    sessionsWithOriginData,
    sessionOriginMap,
    currentOrigin,
    searchQuery,
    onswitch,
    onunassign,
    ondelete,
    onrename,
    editingSessionId,
    oncontextmenu,
    oncreate,
    ondragend,
  }: Props = $props();

  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let showOtherSessions = $state(false);
  let collapsedDomains = new SvelteSet<string>();

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter((s) => {
          const q = searchQuery.toLowerCase();
          if (s.name.toLowerCase().includes(q)) return true;
          const origins = sessionOriginMap[s.id] ?? [];
          return origins.some((o) => o.toLowerCase().includes(q));
        })
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

  // Group other sessions by domain — each session appears under its primary
  // non-current domain.  Sessions without any saved origin go into "No data".
  const domainGroups = $derived.by(() => {
    const currentDomain = currentOrigin ? extractDomain(currentOrigin) : '';
    const groups: Record<string, SessionProfile[]> = {};

    for (const session of otherSessions) {
      const origins = sessionOriginMap[session.id] ?? [];

      // Pick domains that aren't the current site
      const otherDomains = origins
        .map((o) => extractDomain(o))
        .filter((d) => d && d !== currentDomain);

      if (otherDomains.length > 0) {
        // Place under first (primary) domain
        const domain = otherDomains[0];
        if (groups[domain]) groups[domain].push(session);
        else groups[domain] = [session];
      } else {
        if (groups['']) groups[''].push(session);
        else groups[''] = [session];
      }
    }

    // Sort: named domains first (alphabetically), then "No data" last
    return Object.entries(groups).sort((a, b) => {
      if (!a[0]) return 1;
      if (!b[0]) return -1;
      return a[0].localeCompare(b[0]);
    });
  });

  // Auto-expand other sessions when no site-specific sessions exist
  const effectiveShowOther = $derived(
    showOtherSessions || (thisSiteSessions.length === 0 && otherSessions.length > 0),
  );

  function toggleDomain(domain: string) {
    if (collapsedDomains.has(domain)) collapsedDomains.delete(domain);
    else collapsedDomains.add(domain);
  }

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
      const allVisible = [...thisSiteSessions, ...(effectiveShowOther ? otherSessions : [])];
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
    <div class="empty-search">
      <Icon name="search" size={16} />
      <p>No sessions match "{searchQuery}"</p>
    </div>
  {:else}
    <!-- Default (no session) option -->
    <div
      class="default-item"
      class:active={!activeSessionId}
      role="button"
      tabindex="0"
      onclick={onunassign}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onunassign())}
    >
      <span class="default-icon">
        <Icon name="globe" size={13} />
      </span>
      <span class="default-label">Default (no session)</span>
      {#if !activeSessionId}
        <span class="default-badge">active</span>
      {/if}
    </div>

    {#if thisSiteSessions.length > 0}
      <div class="group">
        <div class="group-header">
          <span class="group-label">This site</span>
          <span class="group-line"></span>
        </div>
        {#each thisSiteSessions as session, i (session.id)}
          <div class="drag-wrapper" class:drag-over={dragOverIndex === i && dragIndex !== i}>
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
      <div class="group">
        <button
          class="group-toggle"
          onclick={() => (showOtherSessions = !showOtherSessions)}
          aria-expanded={effectiveShowOther}
        >
          <div class="group-header">
            <span class="group-label">Other sessions</span>
            <span class="group-count">{otherSessions.length}</span>
            <span class="group-line"></span>
          </div>
          <span class="toggle-icon" class:open={effectiveShowOther}>
            <Icon name="chevron-down" size={12} />
          </span>
        </button>
        {#if effectiveShowOther}
          <div class="other-list">
            {#each domainGroups as [domain, domainSessions] (domain)}
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
                  <Icon name="folder" size={12} />
                  <span class="domain-name">{domain || 'No data'}</span>
                  <span class="group-count">{domainSessions.length}</span>
                </button>
                {#if !isCollapsed}
                  <div class="domain-items">
                    {#each domainSessions as session (session.id)}
                      {@const idx = thisSiteSessions.length + otherSessions.indexOf(session)}
                      <div
                        class="drag-wrapper"
                        class:drag-over={dragOverIndex === idx && dragIndex !== idx}
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
                          {oncontextmenu}
                          draggable={true}
                          ondragstart={(e) => handleDragStart(e, idx)}
                          ondragover={(e) => handleDragOver(e, idx)}
                          ondrop={(e) => handleDrop(e, idx)}
                          ondragend={handleDragEnd}
                        />
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if thisSiteSessions.length === 0 && !effectiveShowOther}
      <div class="empty-site">
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
    padding: var(--space-4) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    cursor: pointer;
    color: var(--color-text-tertiary);
    transition: all var(--transition-smooth);
    background: transparent;
  }

  .default-item:hover,
  .default-item:focus-visible {
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
  }

  .default-label {
    flex: 1;
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }

  .default-badge {
    font-size: var(--text-2xs);
    color: var(--color-accent);
    background: var(--color-accent-soft);
    padding: 1px var(--space-3);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    line-height: 14px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
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
  }

  .group-toggle:hover .group-label {
    color: var(--color-text-secondary);
  }

  .group-toggle:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    border-radius: var(--radius-md);
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
    gap: var(--space-2);
    opacity: 0.85;
    transition: opacity var(--transition-fast);
  }

  .other-list:hover {
    opacity: 1;
  }

  /* ── Domain folders ──────────────────────────────────────────── */

  .domain-folder {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-left: var(--space-5);
  }

  .empty-search,
  .empty-site {
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

  .empty-search p,
  .empty-site p {
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
