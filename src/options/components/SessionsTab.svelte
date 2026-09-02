<script lang="ts">
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type { SessionProfile, SessionDetails, PreviousSnapshotInfo } from '@shared/types';
  import { formatRelativeTime } from '@shared/utils';
  import {
    createSession,
    updateSession,
    deleteSession as deleteSessionApi,
    getSessionDetails,
    deleteSessionOriginData,
    updateSessionCookie,
    deleteSessionCookie,
    updateSessionStorageEntry,
    deleteSessionStorageEntry,
    restorePreviousSnapshot,
  } from '@shared/api';
  import {
    isDomainAutoRefreshEnabled,
    setDomainAutoRefresh,
    getAutoRefreshInterval,
    onSettingsChange,
    onDomainRefreshChange,
  } from '@shared/settings-store';
  import type { AutoRefreshInterval } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';
  import InlineEdit from '@shared/components/InlineEdit.svelte';
  import ColorPicker from '@shared/components/ColorPicker.svelte';
  import EmojiPicker from '@shared/components/EmojiPicker.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import Toast from '@shared/components/Toast.svelte';
  import SessionForm from '@shared/components/SessionForm.svelte';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let searchQuery = $state('');
  let expandedSessionId = $state<string | null>(null);
  let detailsMap = new SvelteMap<string, SessionDetails>();
  let detailsLoading = $state(false);
  let editingId = $state<string | null>(null);
  let colorEditId = $state<string | null>(null);
  let confirmData = $state<{ session: SessionProfile } | null>(null);
  let originConfirm = $state<{ sessionId: string; origin: string } | null>(null);
  let showCreate = $state(false);
  let creating = $state(false);
  let toastData = $state<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  /**
   * Every mutation on this page used to end in `console.error`, so a failed
   * rename or delete looked exactly like nothing happening. Failures are the
   * one thing the user must never have to open DevTools to discover.
   */
  function reportError(action: string, err: unknown) {
    console.error(`[Unaware Sessions] ${action} failed:`, err);
    toastData = {
      message: `${action} failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      type: 'error',
    };
  }

  // Global auto-save interval — used to dim per-site toggles when it is off
  let globalInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());
  const globalAutoRefreshOn = $derived(globalInterval > 0);

  // Reactive per-domain refresh map — triggers re-render when toggled
  let domainRefreshVersion = $state(0);

  $effect(() => {
    const unsub = onSettingsChange((s) => {
      globalInterval = s.autoRefreshInterval;
      // autoRefreshDefaultEnabled affects isDomainAutoRefreshEnabled for sessions
      // with no explicit entry — bump version so per-domain toggles re-render.
      domainRefreshVersion++;
    });
    return unsub;
  });

  $effect(() => {
    const unsub = onDomainRefreshChange(() => {
      domainRefreshVersion++;
    });
    return unsub;
  });

  function isDomainRefreshOn(sessionId: string, origin: string): boolean {
    void domainRefreshVersion; // read reactive dependency
    return isDomainAutoRefreshEnabled(sessionId, origin);
  }

  // Domain folder state
  let collapsedDomains = new SvelteSet<string>();

  // Inline editing state
  let editingCookie = $state<{
    sessionId: string;
    origin: string;
    name: string;
    domain: string;
    value: string;
  } | null>(null);
  let editingStorage = $state<{
    sessionId: string;
    origin: string;
    type: 'localStorage' | 'sessionStorage';
    key: string;
    value: string;
  } | null>(null);

  // Group sessions by primary domain
  interface DomainGroup {
    domain: string;
    sessions: Array<{ session: SessionProfile; details: SessionDetails | null }>;
  }

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter((s) => {
          const q = searchQuery.toLowerCase();
          if (s.name.toLowerCase().includes(q)) return true;
          const details = detailsMap.get(s.id);
          if (details) {
            return details.origins.some((o) => o.origin.toLowerCase().includes(q));
          }
          return false;
        })
      : sessions,
  );

  /** Bucket label for sessions that have not saved anything yet. */
  const NO_DATA_GROUP = 'No saved data';

  // Build domain groups from loaded details
  const domainGroups = $derived.by(() => {
    const groups: Record<string, DomainGroup> = {};
    const ungrouped: Array<{ session: SessionProfile; details: SessionDetails | null }> = [];

    for (const session of filteredSessions) {
      const details = detailsMap.get(session.id) ?? null;
      if (details && details.origins.length > 0) {
        const domain = details.origins[0].origin.replace(/^https?:\/\//, '');
        if (groups[domain]) groups[domain].sessions.push({ session, details });
        else groups[domain] = { domain, sessions: [{ session, details }] };
      } else {
        ungrouped.push({ session, details });
      }
    }

    // Alphabetical, so folders do not reshuffle every time details reload.
    const result = Object.values(groups).sort((a, b) => a.domain.localeCompare(b.domain));
    if (ungrouped.length > 0) {
      result.push({ domain: NO_DATA_GROUP, sessions: ungrouped });
    }
    return result;
  });

  // Load all session details on mount, and reload only when session IDs change
  // (not on every quiet refresh that just updates names/colors/timestamps).
  let detailsLoadVersion = 0;
  let prevSessionIds = '';

  async function loadAllDetails() {
    const version = ++detailsLoadVersion;
    detailsLoading = true;
    detailsMap.clear();
    const results = await Promise.allSettled(sessions.map((s) => getSessionDetails(s.id)));
    if (detailsLoadVersion !== version) return;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        detailsMap.set(sessions[i].id, r.value);
      }
    }
    detailsLoading = false;
  }

  $effect(() => {
    const currentIds = sessions.map((s) => s.id).join(',');
    if (currentIds !== prevSessionIds) {
      prevSessionIds = currentIds;
      if (sessions.length > 0) {
        loadAllDetails();
      }
    }
  });

  // Auto-refresh is handled by the service worker alarm (background/auto-refresh.ts).
  // When sessions update via the storage listener in App.svelte, the $effect above
  // only reloads details if session IDs actually changed (added/removed/reordered).

  async function handleCreate(name: string, color: string, emoji?: string) {
    if (creating) return;
    creating = true;
    try {
      await createSession(name, color, emoji);
      showCreate = false;
      toastData = { message: `“${name}” created`, type: 'success' };
      onupdate();
    } catch (err) {
      reportError('Create', err);
    } finally {
      creating = false;
    }
  }

  async function handleEmojiChange(sessionId: string, emoji: string) {
    try {
      await updateSession(sessionId, { emoji: emoji || undefined });
      onupdate();
    } catch (err) {
      reportError('Emoji change', err);
    }
  }

  async function handleToggleDomainRefresh(sessionId: string, origin: string) {
    const current = isDomainRefreshOn(sessionId, origin);
    await setDomainAutoRefresh(sessionId, origin, !current);
  }

  async function handleRename(sessionId: string, newName: string) {
    editingId = null;
    try {
      await updateSession(sessionId, { name: newName });
      onupdate();
    } catch (err) {
      reportError('Rename', err);
    }
  }

  async function handleColorChange(sessionId: string, color: string) {
    try {
      await updateSession(sessionId, { color });
      onupdate();
    } catch (err) {
      reportError('Colour change', err);
    }
  }

  /**
   * Expanding a different session must abandon any half-finished inline edit.
   *
   * This extension exists so several sessions can hold data for the SAME site,
   * so an unsaved edit of cookie `sid` in session A matches the identically
   * named row in session B. The save handler dispatches against the session id
   * captured when editing began, so the write would land in A while the user is
   * looking at B. The row guards also compare the session id now; this keeps
   * the two from ever being asked to disagree.
   */
  function toggleExpanded(sessionId: string) {
    expandedSessionId = expandedSessionId === sessionId ? null : sessionId;
    editingCookie = null;
    editingStorage = null;
  }

  async function executeDelete(sessionId: string) {
    confirmData = null;
    try {
      await deleteSessionApi(sessionId);
      detailsMap.delete(sessionId);
      if (expandedSessionId === sessionId) expandedSessionId = null;
      onupdate();
    } catch (err) {
      reportError('Delete', err);
    }
  }

  async function handleDeleteOrigin(sessionId: string, origin: string) {
    originConfirm = null;
    try {
      await deleteSessionOriginData(sessionId, origin);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
    } catch (err) {
      reportError('Deleting site data', err);
    }
  }

  // ── Snapshot undo ────────────────────────────────────────────
  //
  // The live snapshot mirrors the browser, so a cookie clear the extension
  // cannot distinguish from a logout still empties it — but the previous
  // non-empty state is held in a local one-slot buffer until real data
  // replaces it. This is where it comes back from.
  let restoringOrigin = $state<string | null>(null);

  function describePrevious(previous: PreviousSnapshotInfo): string {
    const parts: string[] = [];
    if (previous.cookieCount > 0) parts.push(`${previous.cookieCount} cookies`);
    if (previous.storageEntries > 0) parts.push(`${previous.storageEntries} storage entries`);
    if (previous.idbDatabases > 0) parts.push(`${previous.idbDatabases} IDB databases`);
    return parts.length > 0 ? parts.join(', ') : 'no data';
  }

  async function handleRestorePrevious(sessionId: string, origin: string) {
    restoringOrigin = sessionId + origin;
    try {
      await restorePreviousSnapshot(sessionId, origin);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
      onupdate();
    } catch (err) {
      reportError('Restore', err);
    } finally {
      restoringOrigin = null;
    }
  }

  async function handleSaveCookie() {
    if (!editingCookie) return;
    const { sessionId, origin, name, domain, value } = editingCookie;
    try {
      await updateSessionCookie(sessionId, origin, name, domain, value);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
    } catch (err) {
      reportError('Cookie update', err);
    }
    editingCookie = null;
  }

  async function handleDeleteCookie(
    sessionId: string,
    origin: string,
    name: string,
    domain: string,
  ) {
    try {
      await deleteSessionCookie(sessionId, origin, name, domain);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
    } catch (err) {
      reportError('Cookie delete', err);
    }
  }

  async function handleSaveStorage() {
    if (!editingStorage) return;
    const { sessionId, origin, type, key, value } = editingStorage;
    try {
      await updateSessionStorageEntry(sessionId, origin, type, key, value);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
    } catch (err) {
      reportError('Storage update', err);
    }
    editingStorage = null;
  }

  async function handleDeleteStorage(
    sessionId: string,
    origin: string,
    type: 'localStorage' | 'sessionStorage',
    key: string,
  ) {
    try {
      await deleteSessionStorageEntry(sessionId, origin, type, key);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);
    } catch (err) {
      reportError('Storage delete', err);
    }
  }

  // The appearance popover had no dismissal but its own Done button: clicking
  // elsewhere left it open, swallowing the next click on the page.
  $effect(() => {
    if (!colorEditId) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.color-popover') || target?.closest('.color-dot')) return;
      colorEditId = null;
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') colorEditId = null;
    }

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  function toggleDomain(domain: string) {
    if (collapsedDomains.has(domain)) {
      collapsedDomains.delete(domain);
    } else {
      collapsedDomains.add(domain);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<div class="sessions-layout">
  <!-- Header row -->
  <div class="sessions-header">
    <div class="header-left">
      <h2>Sessions</h2>
      <span class="session-count">{sessions.length}</span>
    </div>
    <div class="search-box">
      <Icon name="search" size={13} />
      <input
        type="text"
        placeholder="Search sessions or sites…"
        bind:value={searchQuery}
        onkeydown={(e) => e.key === 'Escape' && (searchQuery = '')}
        aria-label="Search sessions and sites"
        autocomplete="off"
      />
      {#if searchQuery}
        <span class="search-count" aria-live="polite">
          {filteredSessions.length}/{sessions.length}
        </span>
        <button class="clear-search" onclick={() => (searchQuery = '')} aria-label="Clear search">
          <Icon name="x" size={11} />
        </button>
      {/if}
    </div>
    <button class="new-session-btn" onclick={() => (showCreate = true)}>
      <Icon name="plus" size={14} />
      New session
    </button>
  </div>

  <!-- Content -->
  {#if detailsLoading && detailsMap.size === 0}
    <div class="loading-state">
      <div class="skel skel-card"></div>
      <div class="skel skel-card short"></div>
    </div>
  {:else if filteredSessions.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <Icon name="layers" size={20} />
      </div>
      {#if searchQuery}
        <p>No sessions or sites match “{searchQuery}”.</p>
        <button class="empty-action" onclick={() => (searchQuery = '')}>Clear search</button>
      {:else}
        <p>No sessions yet. Create one to keep a set of logins separate.</p>
        <button class="empty-action" onclick={() => (showCreate = true)}>
          <Icon name="plus" size={13} />
          New session
        </button>
      {/if}
    </div>
  {:else}
    {#each domainGroups as group (group.domain)}
      <div class="domain-folder">
        <button class="domain-header" onclick={() => toggleDomain(group.domain)}>
          <span class="domain-chevron">
            <Icon
              name={collapsedDomains.has(group.domain) ? 'chevron-right' : 'chevron-down'}
              size={13}
            />
          </span>
          <Icon name={group.domain === NO_DATA_GROUP ? 'folder-open' : 'globe'} size={14} />
          <span class="domain-name">{group.domain}</span>
          <span class="domain-count">{group.sessions.length}</span>
        </button>

        {#if !collapsedDomains.has(group.domain)}
          <div class="domain-sessions">
            {#each group.sessions as { session, details } (session.id)}
              <div class="session-card" style="--card-color: {session.color}">
                <div class="session-row">
                  <!-- Appearance: colour + emoji -->
                  <span class="color-cell">
                    {#if colorEditId === session.id}
                      <div
                        class="color-popover"
                        onclick={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <div class="popover-field">
                          <span class="popover-label">Colour</span>
                          <ColorPicker
                            selected={session.color}
                            onchange={(c) => handleColorChange(session.id, c)}
                          />
                        </div>
                        <div class="popover-field">
                          <span class="popover-label">Emoji</span>
                          <EmojiPicker
                            selected={session.emoji ?? ''}
                            onchange={(e) => handleEmojiChange(session.id, e)}
                          />
                        </div>
                        <button class="popover-done" onclick={() => (colorEditId = null)}>
                          <Icon name="check" size={12} />
                          Done
                        </button>
                      </div>
                    {:else}
                      <button
                        class="color-dot"
                        style="background-color: {session.color}"
                        onclick={() => (colorEditId = session.id)}
                        title="Change colour and emoji"
                        aria-label="Change colour and emoji for {session.name}"
                      ></button>
                    {/if}
                  </span>

                  <!-- Name -->
                  <span class="name-cell">
                    {#if editingId === session.id}
                      <InlineEdit
                        value={session.name}
                        onsave={(v) => handleRename(session.id, v)}
                        oncancel={() => (editingId = null)}
                      />
                    {:else}
                      <span class="name-display">
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span class="session-name" ondblclick={() => (editingId = session.id)}>
                          {session.emoji ?? ''}
                          {session.name}
                        </span>
                        <button
                          class="icon-btn rename-btn"
                          onclick={() => (editingId = session.id)}
                          title="Rename"
                          aria-label="Rename {session.name}"
                        >
                          <Icon name="edit-2" size={11} />
                        </button>
                      </span>
                    {/if}
                  </span>

                  <!-- Last refreshed / Created -->
                  <span
                    class="meta-cell"
                    title={session.lastRefreshedAt
                      ? new Date(session.lastRefreshedAt).toLocaleString()
                      : new Date(session.createdAt).toLocaleString()}
                  >
                    {#if session.lastRefreshedAt}
                      Saved {formatRelativeTime(session.lastRefreshedAt)}
                    {:else}
                      Created {new Date(session.createdAt).toLocaleDateString()}
                    {/if}
                  </span>

                  <!-- Actions -->
                  <span class="actions-cell">
                    <button
                      class="icon-btn"
                      onclick={() => toggleExpanded(session.id)}
                      title={expandedSessionId === session.id
                        ? 'Hide saved data'
                        : 'Show saved data'}
                      aria-expanded={expandedSessionId === session.id}
                      aria-label="{expandedSessionId === session.id
                        ? 'Hide'
                        : 'Show'} saved data for {session.name}"
                    >
                      <Icon
                        name={expandedSessionId === session.id ? 'chevron-down' : 'chevron-right'}
                        size={13}
                      />
                    </button>
                    <button
                      class="icon-btn danger"
                      onclick={() => (confirmData = { session })}
                      title="Delete session"
                      aria-label="Delete session {session.name}"
                    >
                      <Icon name="trash-2" size={13} />
                    </button>
                  </span>
                </div>

                <!-- Expanded details -->
                {#if expandedSessionId === session.id && details}
                  <div class="details-panel">
                    {#if details.origins.length === 0}
                      <p class="empty-small">No saved data.</p>
                    {:else}
                      <div class="details-summary">
                        <span class="summary-item">
                          <Icon name="globe" size={11} />
                          {details.origins.length} origin{details.origins.length === 1 ? '' : 's'}
                        </span>
                        <span class="summary-item">
                          <Icon name="database" size={11} />
                          {details.totalCookies} cookies
                        </span>
                        <span class="summary-item">
                          {formatBytes(details.totalStorageBytes)}
                        </span>
                      </div>

                      {#each details.origins as detail (detail.origin)}
                        <div class="origin-card">
                          <div class="origin-header">
                            <Icon name="globe" size={12} />
                            <span class="origin-name">
                              {detail.origin.replace(/^https?:\/\//, '')}
                            </span>
                            <span class="origin-stats">
                              {detail.cookieCount} cookies &middot; {formatBytes(
                                detail.cookieBytes + detail.storageBytes,
                              )}
                            </span>
                            <button
                              class="auto-refresh-btn"
                              class:active={globalAutoRefreshOn &&
                                isDomainRefreshOn(session.id, detail.origin)}
                              class:dormant={!globalAutoRefreshOn &&
                                isDomainRefreshOn(session.id, detail.origin)}
                              disabled={!globalAutoRefreshOn}
                              onclick={() => handleToggleDomainRefresh(session.id, detail.origin)}
                              title={!globalAutoRefreshOn
                                ? 'Auto-save is off for every site — turn it on in Settings'
                                : isDomainRefreshOn(session.id, detail.origin)
                                  ? `Turn off auto-save for ${detail.origin}`
                                  : `Turn on auto-save for ${detail.origin}`}
                              aria-pressed={globalAutoRefreshOn &&
                                isDomainRefreshOn(session.id, detail.origin)}
                              aria-label="Auto-save for {detail.origin}"
                            >
                              <Icon name="refresh-cw" size={11} />
                            </button>
                            <button
                              class="icon-btn danger sm"
                              onclick={() =>
                                (originConfirm = { sessionId: session.id, origin: detail.origin })}
                              title="Delete origin data"
                              aria-label="Delete origin data"
                            >
                              <Icon name="trash-2" size={11} />
                            </button>
                          </div>

                          <div class="origin-meta">
                            {#if detail.cookieTimestamp}<span
                                >Cookies: {formatDate(detail.cookieTimestamp)}</span
                              >{/if}
                            {#if detail.storageTimestamp}<span
                                >Storage: {formatDate(detail.storageTimestamp)}</span
                              >{/if}
                          </div>

                          <!-- Undo slot: this origin's snapshot went empty (a logout, or a
                               cookie clear the extension cannot tell apart from one) and the
                               previous state is still recoverable. -->
                          {#if detail.previous}
                            <div class="undo-row">
                              <Icon name="info" size={12} />
                              <span class="undo-text">
                                Previous snapshot kept from {formatDate(
                                  detail.previous.cookieTimestamp ??
                                    detail.previous.storageTimestamp ??
                                    0,
                                )} ({describePrevious(detail.previous)})
                              </span>
                              <button
                                class="undo-btn"
                                disabled={restoringOrigin === session.id + detail.origin}
                                onclick={() => handleRestorePrevious(session.id, detail.origin)}
                              >
                                Restore
                              </button>
                            </div>
                          {/if}

                          <!-- Cookies -->
                          {#if detail.cookies.length > 0}
                            <details class="data-section">
                              <summary>Cookies ({detail.cookies.length})</summary>
                              <table class="data-table">
                                <thead
                                  ><tr><th>Name</th><th>Value</th><th>Domain</th><th></th></tr
                                  ></thead
                                >
                                <tbody>
                                  {#each detail.cookies as cookie}
                                    <tr>
                                      <td class="cell-name" title={cookie.name}>{cookie.name}</td>
                                      <td class="cell-value">
                                        {#if editingCookie?.sessionId === session.id && editingCookie?.name === cookie.name && editingCookie?.domain === cookie.domain && editingCookie?.origin === detail.origin}
                                          <div class="edit-row">
                                            <input
                                              class="edit-input"
                                              type="text"
                                              bind:value={editingCookie.value}
                                              onkeydown={(e) =>
                                                e.key === 'Enter' && handleSaveCookie()}
                                            />
                                            <button
                                              class="save-btn"
                                              onclick={handleSaveCookie}
                                              aria-label="Save"
                                              ><Icon name="check" size={10} /></button
                                            >
                                            <button
                                              class="cancel-btn"
                                              onclick={() => (editingCookie = null)}
                                              aria-label="Cancel"
                                              ><Icon name="x" size={10} /></button
                                            >
                                          </div>
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingCookie = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                name: cookie.name,
                                                domain: cookie.domain,
                                                value: cookie.value,
                                              })}
                                            title="Double-click, or use the pencil, to edit"
                                          >
                                            {cookie.value.length > 40
                                              ? cookie.value.slice(0, 40) + '...'
                                              : cookie.value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td class="cell-domain">{cookie.domain}</td>
                                      <td class="cell-action">
                                        <button
                                          class="icon-btn xs"
                                          onclick={() =>
                                            (editingCookie = {
                                              sessionId: session.id,
                                              origin: detail.origin,
                                              name: cookie.name,
                                              domain: cookie.domain,
                                              value: cookie.value,
                                            })}
                                          title="Edit value"
                                          aria-label="Edit cookie {cookie.name}"
                                        >
                                          <Icon name="edit-2" size={10} />
                                        </button>
                                        <button
                                          class="icon-btn danger xs"
                                          onclick={() =>
                                            handleDeleteCookie(
                                              session.id,
                                              detail.origin,
                                              cookie.name,
                                              cookie.domain,
                                            )}
                                          title="Delete cookie"
                                          aria-label="Delete cookie {cookie.name}"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}

                          <!-- localStorage -->
                          {#if Object.keys(detail.localStorage).length > 0}
                            <details class="data-section">
                              <summary
                                >localStorage ({Object.keys(detail.localStorage).length})</summary
                              >
                              <table class="data-table">
                                <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
                                <tbody>
                                  {#each Object.entries(detail.localStorage) as [key, value]}
                                    <tr>
                                      <td class="cell-name" title={key}>{key}</td>
                                      <td class="cell-value">
                                        {#if editingStorage?.sessionId === session.id && editingStorage?.key === key && editingStorage?.type === 'localStorage' && editingStorage?.origin === detail.origin}
                                          <div class="edit-row">
                                            <input
                                              class="edit-input"
                                              type="text"
                                              bind:value={editingStorage.value}
                                              onkeydown={(e) =>
                                                e.key === 'Enter' && handleSaveStorage()}
                                            />
                                            <button
                                              class="save-btn"
                                              onclick={handleSaveStorage}
                                              aria-label="Save"
                                              ><Icon name="check" size={10} /></button
                                            >
                                            <button
                                              class="cancel-btn"
                                              onclick={() => (editingStorage = null)}
                                              aria-label="Cancel"
                                              ><Icon name="x" size={10} /></button
                                            >
                                          </div>
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingStorage = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                type: 'localStorage',
                                                key,
                                                value,
                                              })}
                                            title="Double-click, or use the pencil, to edit"
                                          >
                                            {value.length > 40 ? value.slice(0, 40) + '...' : value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td class="cell-action">
                                        <button
                                          class="icon-btn xs"
                                          onclick={() =>
                                            (editingStorage = {
                                              sessionId: session.id,
                                              origin: detail.origin,
                                              type: 'localStorage',
                                              key,
                                              value,
                                            })}
                                          title="Edit value"
                                          aria-label="Edit {key}"
                                        >
                                          <Icon name="edit-2" size={10} />
                                        </button>
                                        <button
                                          class="icon-btn danger xs"
                                          onclick={() =>
                                            handleDeleteStorage(
                                              session.id,
                                              detail.origin,
                                              'localStorage',
                                              key,
                                            )}
                                          title="Delete entry"
                                          aria-label="Delete {key}"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}

                          <!-- sessionStorage -->
                          {#if Object.keys(detail.sessionStorage).length > 0}
                            <details class="data-section">
                              <summary
                                >sessionStorage ({Object.keys(detail.sessionStorage)
                                  .length})</summary
                              >
                              <table class="data-table">
                                <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
                                <tbody>
                                  {#each Object.entries(detail.sessionStorage) as [key, value]}
                                    <tr>
                                      <td class="cell-name" title={key}>{key}</td>
                                      <td class="cell-value">
                                        {#if editingStorage?.sessionId === session.id && editingStorage?.key === key && editingStorage?.type === 'sessionStorage' && editingStorage?.origin === detail.origin}
                                          <div class="edit-row">
                                            <input
                                              class="edit-input"
                                              type="text"
                                              bind:value={editingStorage.value}
                                              onkeydown={(e) =>
                                                e.key === 'Enter' && handleSaveStorage()}
                                            />
                                            <button
                                              class="save-btn"
                                              onclick={handleSaveStorage}
                                              aria-label="Save"
                                              ><Icon name="check" size={10} /></button
                                            >
                                            <button
                                              class="cancel-btn"
                                              onclick={() => (editingStorage = null)}
                                              aria-label="Cancel"
                                              ><Icon name="x" size={10} /></button
                                            >
                                          </div>
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingStorage = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                type: 'sessionStorage',
                                                key,
                                                value,
                                              })}
                                            title="Double-click, or use the pencil, to edit"
                                          >
                                            {value.length > 40 ? value.slice(0, 40) + '...' : value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td class="cell-action">
                                        <button
                                          class="icon-btn xs"
                                          onclick={() =>
                                            (editingStorage = {
                                              sessionId: session.id,
                                              origin: detail.origin,
                                              type: 'sessionStorage',
                                              key,
                                              value,
                                            })}
                                          title="Edit value"
                                          aria-label="Edit {key}"
                                        >
                                          <Icon name="edit-2" size={10} />
                                        </button>
                                        <button
                                          class="icon-btn danger xs"
                                          onclick={() =>
                                            handleDeleteStorage(
                                              session.id,
                                              detail.origin,
                                              'sessionStorage',
                                              key,
                                            )}
                                          title="Delete entry"
                                          aria-label="Delete {key}"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</div>

{#if showCreate}
  <div class="modal-backdrop" onclick={() => !creating && (showCreate = false)} role="presentation">
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="New session"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && !creating && (showCreate = false)}
    >
      <SessionForm
        oncreate={handleCreate}
        oncancel={() => (showCreate = false)}
        existingNames={sessions.map((session) => session.name)}
        dismissStyle="close"
      />
    </div>
  </div>
{/if}

{#if toastData}
  <Toast message={toastData.message} type={toastData.type} ondismiss={() => (toastData = null)} />
{/if}

{#if confirmData}
  <ConfirmDialog
    title="Delete session"
    message={'Delete “' + confirmData.session.name + '”?'}
    detail="Its saved cookies and storage for every site are removed permanently. This cannot be undone from here."
    confirmLabel="Delete"
    danger={true}
    onconfirm={() => confirmData && executeDelete(confirmData.session.id)}
    oncancel={() => (confirmData = null)}
  />
{/if}
{#if originConfirm}
  <ConfirmDialog
    title="Delete site data"
    message={'Delete this session’s saved data for ' + originConfirm.origin + '?'}
    detail="The session itself and its data for other sites are kept."
    confirmLabel="Delete"
    danger={true}
    onconfirm={() =>
      originConfirm && handleDeleteOrigin(originConfirm.sessionId, originConfirm.origin)}
    oncancel={() => (originConfirm = null)}
  />
{/if}

<style>
  .sessions-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  /* Header */
  .sessions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .session-count {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    min-width: 20px;
    text-align: center;
    line-height: 16px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    flex: 1;
    max-width: 300px;
    transition: all var(--transition-smooth);
  }

  .search-box:focus-within {
    border-color: var(--color-accent);
    background: var(--color-bg-primary);
    box-shadow: var(--shadow-glow);
  }

  .search-box :global(svg:first-child) {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .search-box:focus-within :global(svg:first-child) {
    color: var(--color-accent);
  }

  .search-box input {
    flex: 1;
    border: none;
    outline: none;
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    background: transparent;
    color: var(--color-text-primary);
  }

  .search-box input::placeholder {
    color: var(--color-text-tertiary);
  }

  .clear-search {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    display: flex;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }

  .clear-search:hover {
    color: var(--color-text-secondary);
  }

  /* Loading / Empty states */
  .loading-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .skel {
    background: linear-gradient(
      90deg,
      var(--color-bg-tertiary) 25%,
      var(--color-bg-secondary) 50%,
      var(--color-bg-tertiary) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: var(--radius-xl);
  }

  .skel-card {
    height: 60px;
  }

  .skel-card.short {
    width: 70%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-10);
    color: var(--color-text-tertiary);
  }

  .empty-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-xl);
    background: var(--color-bg-tertiary);
    opacity: 0.6;
  }

  .empty-state p,
  .empty-small {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    text-align: center;
    margin: 0;
  }

  /* Domain folders */
  .domain-folder {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    overflow: hidden;
    box-shadow: var(--shadow-xs);
  }

  .domain-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background var(--transition-fast);
  }

  .domain-header:hover {
    background: var(--color-interactive-hover);
  }

  .domain-chevron {
    color: var(--color-text-tertiary);
    display: flex;
  }

  .domain-header :global(svg:nth-child(2)) {
    color: var(--color-text-tertiary);
  }

  .domain-name {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
    flex: 1;
    text-align: left;
  }

  .domain-count {
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    min-width: 20px;
    text-align: center;
    line-height: 16px;
  }

  .domain-sessions {
    border-top: 1px solid var(--color-border-secondary);
  }

  /* Session cards */
  .session-card {
    border-bottom: 1px solid var(--color-border-secondary);
  }

  .session-card:last-child {
    border-bottom: none;
  }

  .session-row {
    display: grid;
    grid-template-columns: 36px 1fr 112px 70px;
    align-items: center;
    padding: var(--space-4) var(--space-5);
    gap: var(--space-3);
    transition: background var(--transition-fast);
  }

  .session-row:hover {
    background: var(--color-interactive-hover);
  }

  .color-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .color-dot {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: transform var(--transition-fast);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--card-color) 15%, transparent);
  }

  .color-dot:hover {
    transform: scale(1.2);
  }

  .color-popover {
    position: absolute;
    top: -8px;
    left: 28px;
    z-index: var(--z-popover);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    padding: var(--space-5);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: max-content;
  }

  .popover-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .popover-label {
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .popover-done {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
  }

  .popover-done:hover {
    background: var(--color-interactive-hover);
  }

  .popover-done:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .name-cell {
    min-width: 0;
  }

  .session-name {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    cursor: default;
  }

  .meta-cell {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions-cell {
    display: flex;
    gap: var(--space-1);
    justify-content: flex-end;
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    display: flex;
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .icon-btn.danger:hover {
    color: var(--color-error);
    background: var(--color-error-soft);
  }

  .icon-btn.sm {
    padding: var(--space-1);
  }

  .icon-btn.xs {
    padding: 0;
    display: inline-flex;
  }

  .auto-refresh-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: none;
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .auto-refresh-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .auto-refresh-btn.active {
    color: var(--color-success);
    border-color: var(--color-success);
    background: var(--color-success-soft);
    position: relative;
  }

  .auto-refresh-btn.active::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--color-success);
    animation: pulse 2s ease-in-out infinite;
  }

  .auto-refresh-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .auto-refresh-btn:disabled:hover {
    color: var(--color-text-tertiary);
    background: none;
  }

  .auto-refresh-btn.dormant {
    color: var(--color-text-tertiary);
    border-color: var(--color-border-secondary);
    background: var(--color-bg-tertiary);
    opacity: 0.55;
  }

  /* Details panel */
  .details-panel {
    border-top: 1px solid var(--color-border-secondary);
    padding: var(--space-5);
    background: var(--color-bg-secondary);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .details-summary {
    display: flex;
    gap: var(--space-5);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Origin cards */
  .origin-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .undo-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    background: var(--color-bg-secondary);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .undo-text {
    flex: 1;
    min-width: 0;
  }

  .undo-btn {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
  }

  .undo-btn:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .undo-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .origin-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .origin-header > :global(svg:first-child) {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .origin-name {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    flex: 1;
  }

  .origin-stats {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .origin-meta {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    padding-left: var(--space-7);
  }

  /* Data sections */
  .data-section {
    margin-top: var(--space-2);
  }

  .data-section summary {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    cursor: pointer;
    margin-bottom: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    transition: background var(--transition-fast);
  }

  .data-section summary:hover {
    background: var(--color-interactive-hover);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    table-layout: fixed;
  }

  .data-table th {
    text-align: left;
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border-secondary);
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .data-table td {
    padding: var(--space-2) var(--space-3);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-secondary);
    vertical-align: middle;
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  .data-table tr:hover td {
    background: var(--color-interactive-hover);
  }

  .cell-name {
    width: 28%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--font-medium);
  }

  .cell-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-domain {
    width: 18%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-action {
    width: 52px;
    white-space: nowrap;
    text-align: right;
  }

  /* Inline editing */
  .editable {
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: color var(--transition-fast);
  }

  .editable:hover {
    color: var(--color-accent);
  }

  .edit-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .edit-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: monospace;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
  }

  .save-btn,
  .cancel-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-1);
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-sm);
  }

  .save-btn {
    color: var(--color-success);
  }

  .save-btn:hover {
    background: var(--color-success-soft);
  }

  .cancel-btn {
    color: var(--color-text-tertiary);
  }

  .cancel-btn:hover {
    background: var(--color-interactive-hover);
  }

  .new-session-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-on-accent);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .new-session-btn:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }

  .new-session-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .search-count {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .empty-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .empty-action:hover {
    background: var(--color-interactive-hover);
    border-color: var(--color-accent-muted);
  }

  .empty-action:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .name-display {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  /* Revealed on hover or keyboard focus — never hidden from keyboard users. */
  .rename-btn {
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .session-row:hover .rename-btn,
  .rename-btn:focus-visible {
    opacity: 1;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    z-index: var(--z-modal);
    backdrop-filter: blur(2px);
    animation: fadeIn var(--transition-fast) ease;
    overflow-y: auto;
  }

  .modal {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-2xl);
    padding: var(--space-7);
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-xl);
    animation: scaleIn var(--transition-fast) ease;
  }

  .modal:focus {
    outline: none;
  }
</style>
