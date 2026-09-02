<script lang="ts">
  import type {
    SessionProfile,
    TabSessionEntry,
    AutoRefreshInterval,
    IsolationMode,
  } from '@shared/types';
  import { extractOrigin, extractDomain, isValidUrl } from '@shared/utils';
  import {
    getAutoRefreshInterval,
    isDomainAutoRefreshEnabled,
    setDomainAutoRefresh,
    getDomainIsolationMode,
    setDomainIsolationMode,
    onSettingsChange,
    onDomainRefreshChange,
    onDomainIsolationChange,
  } from '@shared/settings-store';
  import { STORAGE_KEYS } from '@shared/constants';
  import { initSyncStore, getSyncConfig, onSyncConfigChange } from '@shared/sync/sync-store';
  import {
    listSessions,
    createSession,
    deleteSession as deleteSessionApi,
    switchSession,
    getSessionForTab,
    assignTab,
    getCurrentTab,
    getAllTabCounts,
    updateSession,
    reorderSessions,
    duplicateSession as duplicateSessionApi,
    getSessionsForOrigin,
    getAllSessionOrigins,
    saveSessionData,
    clearOriginData,
    detectSession,
  } from '@shared/api';
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '@shared/components/Icon.svelte';
  import ThemeToggle from '@shared/components/ThemeToggle.svelte';
  import AppLogo from '@shared/components/AppLogo.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import AuthGate from '@shared/components/AuthGate.svelte';
  import { checkAuth } from '@shared/auth-check';
  import Toast from '@shared/components/Toast.svelte';
  import SessionList from './components/SessionList.svelte';
  import SessionForm from '@shared/components/SessionForm.svelte';
  import CurrentTabPanel from './components/CurrentTabPanel.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import type { ContextMenuItem } from './components/ContextMenu.svelte';
  import ShortcutsOverlay from './components/ShortcutsOverlay.svelte';
  import { groupSessions } from './session-grouping';

  /** How long "Undo" stays available before a delete is committed. */
  const UNDO_WINDOW_MS = 7000;
  /** Below this, a search field is more clutter than help. */
  const SEARCH_THRESHOLD = 6;

  // Primary data
  let sessions = $state<SessionProfile[]>([]);
  let tabCounts = $state<Record<string, number>>({});
  let sessionsWithOriginData = $state<Set<string>>(new Set());
  let sessionOriginMap = $state<Record<string, string[]>>({});
  let currentTab = $state<chrome.tabs.Tab | undefined>(undefined);
  let currentTabEntry = $state<TabSessionEntry | undefined>(undefined);

  // View routing
  let view = $state<'list' | 'new'>('list');

  // UI state
  let loading = $state(true);
  let searchQuery = $state('');
  let searchRevealed = $state(false);
  let showShortcuts = $state(false);
  let editingSessionId = $state<string | null>(null);
  let switchingSessionId = $state<string | null>(null);
  let searchBar = $state<ReturnType<typeof SearchBar> | undefined>(undefined);

  // Toast state
  // Every toast needs a distinct identity. Toast owns its auto-dismiss deadline
  // in an $effect that tracks only `held`, `ondismiss` and `duration` — all
  // three are identical between two delete toasts (same stable dismissToast,
  // same UNDO_WINDOW_MS), so replacing one with another would NOT re-arm the
  // timer and the second toast would inherit the first's remaining time. Two
  // deletes 6.5 s apart would leave the second 0.5 s of undo before it was
  // committed. Keying the render on this counter remounts the component, which
  // gives a fresh timer (and a fresh fly-in) even for an identical message.
  let toastSeq = 0;

  let toastData = $state<{
    id: number;
    message: string;
    type: 'error' | 'success' | 'info';
    action?: { label: string; onclick: () => void };
    duration?: number;
    /** Runs when the toast goes away by any route: timeout, close, or replacement. */
    ondismiss?: () => void;
  } | null>(null);

  // Confirm dialog state
  let confirmData = $state<{
    title: string;
    message: string;
    detail?: string;
    confirmLabel: string;
    danger: boolean;
    onconfirm: () => void;
  } | null>(null);

  // Auth gate state
  let authGateData = $state<{ onauth: () => void } | null>(null);

  async function withAuth(action: () => void | Promise<void>) {
    const result = await checkAuth();
    if (result !== 'auth-required') {
      await action();
    } else {
      authGateData = {
        onauth: () => {
          authGateData = null;
          action();
        },
      };
    }
  }

  // Context menu state
  let contextMenuData = $state<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  // Derived
  const currentOrigin = $derived(currentTab?.url ? extractOrigin(currentTab.url) : '');
  const currentDomain = $derived(currentOrigin ? extractDomain(currentOrigin) : '');
  const currentSession = $derived(
    currentTabEntry ? sessions.find((s) => s.id === currentTabEntry!.sessionId) : undefined,
  );
  // chrome://, about: and extension pages have no cookie jar to isolate, so the
  // panel says so rather than offering controls that quietly do nothing.
  const tabSupported = $derived(isValidUrl(currentTab?.url ?? ''));

  // Sessions awaiting an undoable delete are hidden from every view but still
  // exist in the background until the window closes.
  let pendingDeleteIds = new SvelteSet<string>();
  const visibleSessions = $derived(sessions.filter((s) => !pendingDeleteIds.has(s.id)));

  const grouping = $derived(
    groupSessions({
      sessions: visibleSessions,
      sessionsWithOriginData,
      sessionOriginMap,
      currentOrigin,
      activeSessionId: currentTabEntry?.sessionId,
      searchQuery,
    }),
  );

  const showSearch = $derived(
    visibleSessions.length > SEARCH_THRESHOLD || searchRevealed || !!searchQuery,
  );

  // Full initial load with loading skeleton — called once on mount
  async function loadState() {
    loading = true;
    try {
      const [sessionList, tab, counts] = await Promise.all([
        listSessions(),
        getCurrentTab(),
        getAllTabCounts(),
      ]);
      sessions = sessionList;
      currentTab = tab;
      tabCounts = counts;
      if (tab?.id) {
        currentTabEntry = await getSessionForTab(tab.id);
      }
      const origin = tab?.url ? extractOrigin(tab.url) : '';

      // Auto-detect session from cookies when tab-session mapping is lost
      if (!currentTabEntry && origin && tab?.id) {
        const detectedId = await detectSession(origin, tab.id);
        if (detectedId) {
          await assignTab(tab.id, detectedId, origin);
          currentTabEntry = { sessionId: detectedId, origin };
        }
      }

      const [originIds, allOrigins] = await Promise.all([
        origin ? getSessionsForOrigin(origin) : Promise.resolve([]),
        getAllSessionOrigins(),
      ]);
      sessionsWithOriginData = new Set(originIds);
      sessionOriginMap = allOrigins;
    } catch (err) {
      console.error('[Unaware Sessions] Failed to load state:', err);
      showToast('Could not load sessions. Try reopening the popup.', 'error');
    } finally {
      loading = false;
    }
  }

  // Silent data update — no loading skeleton, no full rebuild.
  // Svelte reactivity handles re-rendering only the changed parts.
  async function updateSessionsQuietly() {
    try {
      const [sessionList, counts, allOrigins] = await Promise.all([
        listSessions(),
        getAllTabCounts(),
        getAllSessionOrigins(),
      ]);
      sessions = sessionList;
      tabCounts = counts;
      sessionOriginMap = allOrigins;

      if (currentTab?.url) {
        const origin = extractOrigin(currentTab.url);
        if (origin) {
          const ids = await getSessionsForOrigin(origin);
          sessionsWithOriginData = new Set(ids);
        }
      }
    } catch {
      // Silently ignore — UI stays with current data
    }
  }

  function showToast(
    message: string,
    type: 'error' | 'success' | 'info' = 'info',
    action?: { label: string; onclick: () => void },
    duration?: number,
  ) {
    // Replacing a toast retires it, so its deferred work has to run — otherwise
    // an unrelated message appearing mid-countdown would strand a pending
    // delete with no visible way left to undo or complete it.
    const retired = toastData?.ondismiss;
    toastData = { id: ++toastSeq, message, type, action, duration };
    retired?.();
  }

  /** Clear the current toast, running whatever it deferred. */
  function dismissToast() {
    const pending = toastData?.ondismiss;
    toastData = null;
    pending?.();
  }

  function errorMessage(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  let creatingSession = false;

  async function handleCreate(name: string, color: string, emoji?: string) {
    if (creatingSession) return;
    creatingSession = true;
    try {
      // Attach + capture happen in the background as part of creation: the new
      // session immediately adopts the current tab's cookies and storage, so
      // its data is durable even if the popup or tab closes right after.
      const captureTabId =
        currentTab?.id && currentOrigin && isValidUrl(currentTab.url ?? '')
          ? currentTab.id
          : undefined;
      const session = await createSession(name, color, emoji, captureTabId);
      // Fetch the authoritative list from the background instead of appending
      // locally — the storage-change listener may have already added the session
      // via updateSessionsQuietly(), and duplicates crash the keyed {#each}.
      sessions = await listSessions();

      if (captureTabId != null && currentOrigin) {
        currentTabEntry = { sessionId: session.id, origin: currentOrigin };
        sessionsWithOriginData = new Set([...sessionsWithOriginData, session.id]);
      }

      view = 'list';
      showToast(`“${name}” created`, 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to create session'), 'error');
    } finally {
      creatingSession = false;
    }
  }

  async function handleSwitch(sessionId: string) {
    if (!currentTab?.id || switchingSessionId) return;
    await withAuth(async () => {
      if (!currentTab?.id || switchingSessionId) return;
      switchingSessionId = sessionId;
      try {
        await switchSession(currentTab.id, sessionId);
        currentTabEntry = { sessionId, origin: currentOrigin };
        sessions = await listSessions();
      } catch (err) {
        showToast(errorMessage(err, 'Failed to switch session'), 'error');
      } finally {
        switchingSessionId = null;
      }
    });
  }

  // ── Undoable delete ─────────────────────────────────────────────────
  //
  // Nothing is deleted while the toast is up: the session is only hidden, and
  // its id is journalled so a popup that closes mid-countdown does not leave a
  // session the user believes is gone. Undo therefore restores the real
  // session — cookies, storage and id intact — rather than minting a lookalike.
  let pendingDelete: { session: SessionProfile } | null = null;

  async function readDeleteJournal(): Promise<string[]> {
    try {
      const stored = await chrome.storage.session.get(STORAGE_KEYS.PENDING_SESSION_DELETES);
      const ids = stored[STORAGE_KEYS.PENDING_SESSION_DELETES];
      return Array.isArray(ids) ? (ids as string[]) : [];
    } catch {
      return [];
    }
  }

  async function writeDeleteJournal(ids: string[]): Promise<void> {
    try {
      await chrome.storage.session.set({ [STORAGE_KEYS.PENDING_SESSION_DELETES]: ids });
    } catch {
      // Journalling is a safety net; a failure here must not block the delete.
    }
  }

  /** Finish any delete a previous popup started but never committed. */
  async function flushOrphanedDeletes() {
    const ids = await readDeleteJournal();
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => deleteSessionApi(id)));
    await writeDeleteJournal([]);
    await updateSessionsQuietly();
  }

  function requestDelete(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    confirmData = {
      title: 'Delete session',
      message: `Delete “${session.name}”?`,
      detail: 'Its saved cookies and storage go with it. You can undo for a few seconds.',
      confirmLabel: 'Delete',
      danger: true,
      onconfirm: () => {
        confirmData = null;
        void startDelete(session);
      },
    };
  }

  async function startDelete(session: SessionProfile) {
    await withAuth(async () => {
      await commitPendingDelete();

      pendingDeleteIds.add(session.id);
      if (currentTabEntry?.sessionId === session.id) currentTabEntry = undefined;
      await writeDeleteJournal([...pendingDeleteIds]);
      pendingDelete = { session };

      // The toast owns the deadline. A separate timer would keep running while
      // the toast is held open under the pointer, and the Undo button the user
      // is reaching for would quietly stop working before they reached it.
      toastData = {
        id: ++toastSeq,
        message: `“${session.name}” deleted`,
        type: 'info',
        duration: UNDO_WINDOW_MS,
        action: { label: 'Undo', onclick: () => void undoDelete() },
        ondismiss: () => void commitPendingDelete(),
      };
    });
  }

  async function commitPendingDelete() {
    const entry = pendingDelete;
    if (!entry) return;
    pendingDelete = null;
    try {
      await deleteSessionApi(entry.session.id);
      sessions = sessions.filter((s) => s.id !== entry.session.id);
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete session'), 'error');
    } finally {
      // Either the session is gone or the delete failed and it must come back
      // into view; both cases stop hiding it.
      pendingDeleteIds.delete(entry.session.id);
      await writeDeleteJournal([...pendingDeleteIds]);
    }
  }

  async function undoDelete() {
    const entry = pendingDelete;
    if (!entry) return;
    pendingDelete = null;
    pendingDeleteIds.delete(entry.session.id);
    await writeDeleteJournal([...pendingDeleteIds]);
    // pendingDelete is already cleared, so the outgoing toast's commit hook is
    // a no-op — replacing it directly keeps the restore message immediate.
    showToast(`“${entry.session.name}” restored`, 'success');
  }

  async function handleRename(sessionId: string, newName: string) {
    editingSessionId = null;
    try {
      const updated = await updateSession(sessionId, { name: newName });
      sessions = sessions.map((s) => (s.id === sessionId ? updated : s));
    } catch (err) {
      showToast(errorMessage(err, 'Failed to rename session'), 'error');
    }
  }

  function handleDetach() {
    if (!currentTab?.id || !currentTabEntry) {
      // Already detached — nothing to clear, and reloading would be surprising.
      return;
    }
    confirmData = {
      title: 'Browse without a session',
      message: `Detach this tab from “${currentSession?.name ?? 'the current session'}”?`,
      detail:
        'The session keeps its saved data. This site’s cookies are cleared here and the page reloads, so you will be signed out in this tab.',
      confirmLabel: 'Detach',
      danger: false,
      onconfirm: () => {
        confirmData = null;
        void executeDetach();
      },
    };
  }

  async function executeDetach() {
    if (!currentTab?.id) return;
    try {
      await clearOriginData(currentTab.id);
      currentTabEntry = undefined;
    } catch (err) {
      showToast(errorMessage(err, 'Failed to detach this tab'), 'error');
    }
  }

  let refreshing = $state(false);

  async function handleUpdateSessionData() {
    refreshing = true;
    try {
      if (currentTab?.id && currentTabEntry) {
        await saveSessionData(currentTab.id);
      }

      await updateSessionsQuietly();

      // Auto-detect session if no mapping exists
      let detected = false;
      if (!currentTabEntry && currentOrigin && currentTab?.id) {
        const detectedId = await detectSession(currentOrigin, currentTab.id);
        if (detectedId) {
          await assignTab(currentTab.id, detectedId, currentOrigin);
          currentTabEntry = { sessionId: detectedId, origin: currentOrigin };
          detected = true;
        }
      }

      if (currentTabEntry && !detected) showToast('Session data saved', 'success');
      else if (detected) showToast(`Matched “${currentSession?.name ?? 'a session'}”`, 'success');
      else showToast('No saved session matches this site yet', 'info');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to save session data'), 'error');
    } finally {
      refreshing = false;
    }
  }

  async function handleReorder(visibleOrder: string[]) {
    const previous = sessions;
    // The list only knows about visible rows, so anything hidden behind an undo
    // toast has to be carried over — dropping it here would delete it from the
    // local list and from the stored order, and Undo would restore nothing.
    const seen = new Set(visibleOrder);
    const orderedIds = [
      ...visibleOrder,
      ...sessions.filter((s) => !seen.has(s.id)).map((s) => s.id),
    ];

    sessions = orderedIds
      .map((id) => previous.find((s) => s.id === id))
      .filter((s): s is SessionProfile => s !== undefined);
    try {
      await reorderSessions(orderedIds);
    } catch {
      sessions = previous;
      showToast('Failed to reorder sessions', 'error');
    }
  }

  function openMenu(position: { x: number; y: number }, sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const items: ContextMenuItem[] = [
      {
        label: 'Rename',
        icon: 'edit-2',
        shortcut: 'F2',
        onclick: () => {
          editingSessionId = sessionId;
        },
      },
      {
        label: 'Duplicate',
        icon: 'copy',
        onclick: async () => {
          try {
            const copy = await duplicateSessionApi(sessionId);
            sessions = await listSessions();
            showToast(`“${copy.name}” created`, 'success');
          } catch (err) {
            showToast(errorMessage(err, 'Failed to duplicate session'), 'error');
          }
        },
      },
      {
        label: session.pinned ? 'Unpin' : 'Pin to top',
        icon: 'pin',
        onclick: async () => {
          try {
            const updated = await updateSession(sessionId, { pinned: !session.pinned });
            sessions = sessions.map((s) => (s.id === sessionId ? updated : s));
          } catch (err) {
            showToast(errorMessage(err, 'Failed to update session'), 'error');
          }
        },
      },
      {
        label: 'Delete',
        icon: 'trash-2',
        shortcut: 'Del',
        danger: true,
        separatorBefore: true,
        onclick: () => requestDelete(sessionId),
      },
    ];

    contextMenuData = { ...position, items };
  }

  // Shortcuts are bound to the window, not to <main>: a freshly opened popup
  // leaves focus on <body>, whose keydown events never reach a handler on a
  // descendant element — so every shortcut used to be dead until the user
  // clicked inside.
  function handleKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

    const target = e.target as HTMLElement | null;
    const isTextEntry =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    if (e.key === 'Escape') {
      if (contextMenuData) {
        contextMenuData = null;
      } else if (showShortcuts) {
        showShortcuts = false;
      } else if (view === 'new') {
        view = 'list';
      } else if (searchQuery || searchRevealed) {
        searchQuery = '';
        searchRevealed = false;
      }
      return;
    }

    if (isTextEntry || view !== 'list' || confirmData || authGateData || showShortcuts) return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      view = 'new';
    } else if (e.key === '/') {
      e.preventDefault();
      void revealSearch();
    } else if (e.key === '?') {
      e.preventDefault();
      showShortcuts = true;
    } else if (e.key >= '1' && e.key <= '9') {
      const session = grouping.visibleOrder[Number(e.key) - 1];
      if (session) {
        e.preventDefault();
        void handleSwitch(session.id);
      }
    }
  }

  async function revealSearch() {
    searchRevealed = true;
    // The field may not be mounted yet when search was below the threshold.
    await tick();
    searchBar?.focus();
  }

  $effect(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // A popup that closes mid-countdown must not strand a half-deleted session.
  $effect(() => {
    function flush() {
      void commitPendingDelete();
    }
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  });

  $effect(() => {
    loadState().then(flushOrphanedDeletes);
  });

  // Silently update when storage changes externally (e.g., auto-save, settings page, context menu).
  // Debounce with setTimeout: a single operation can fire multiple storage changes across
  // separate async ticks (e.g., touchSessionRefresh writes SESSIONS twice sequentially).
  // A short timer coalesces them into one LIST_SESSIONS call.
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) {
      if (area !== 'local') return;
      if (STORAGE_KEYS.SESSIONS in changes || STORAGE_KEYS.SESSION_ORDER in changes) {
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          updateSessionsQuietly();
        }, 50);
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      if (timer != null) clearTimeout(timer);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  });

  // Auto-save — hierarchical toggle: global interval is the master switch,
  // per-domain toggles control individual session:origin pairs.
  let autoRefreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());
  const globalAutoRefreshOn = $derived(autoRefreshInterval > 0);

  // Per-domain auto-save state for the current tab's session:origin
  let domainAutoRefreshOn = $state(false);

  $effect(() => {
    const unsub = onSettingsChange((s) => {
      autoRefreshInterval = s.autoRefreshInterval;
      // Re-evaluate per-domain state: autoRefreshDefaultEnabled may have changed,
      // which affects isDomainAutoRefreshEnabled for sessions with no explicit entry.
      if (currentTabEntry && currentOrigin) {
        domainAutoRefreshOn = isDomainAutoRefreshEnabled(currentTabEntry.sessionId, currentOrigin);
      }
    });
    return unsub;
  });

  // Recompute per-domain state when session, origin, or domain map changes
  $effect(() => {
    if (currentTabEntry && currentOrigin) {
      domainAutoRefreshOn = isDomainAutoRefreshEnabled(currentTabEntry.sessionId, currentOrigin);
    } else {
      domainAutoRefreshOn = false;
    }
  });

  $effect(() => {
    const unsub = onDomainRefreshChange(() => {
      if (currentTabEntry && currentOrigin) {
        domainAutoRefreshOn = isDomainAutoRefreshEnabled(currentTabEntry.sessionId, currentOrigin);
      }
    });
    return unsub;
  });

  async function handleAutoRefreshToggle() {
    if (!currentTabEntry || !currentOrigin) {
      showToast('Attach this tab to a session first', 'info');
      return;
    }
    await setDomainAutoRefresh(currentTabEntry.sessionId, currentOrigin, !domainAutoRefreshOn);
  }

  // Isolation mode (per-domain: soft/strict)
  let isolationMode = $state<IsolationMode>('soft');

  $effect(() => {
    if (currentDomain) {
      isolationMode = getDomainIsolationMode(currentDomain);
    }
  });

  $effect(() => {
    const unsub = onDomainIsolationChange(() => {
      if (currentDomain) {
        isolationMode = getDomainIsolationMode(currentDomain);
      }
    });
    return unsub;
  });

  async function handleIsolationToggle() {
    if (!currentDomain) return;
    const newMode: IsolationMode = isolationMode === 'soft' ? 'strict' : 'soft';
    await setDomainIsolationMode(currentDomain, newMode);
    showToast(
      newMode === 'strict'
        ? `Strict isolation on for ${currentDomain} — switching always clears its cookies`
        : `Soft isolation on for ${currentDomain} — unrelated logins are preserved`,
      'info',
    );
  }

  // Cloud-sync conflict warning. pendingConflicts is persisted, so a conflict
  // raised by a background auto-sync the user never saw still surfaces here.
  // Register the listener before initSyncStore so the post-hydration notify
  // isn't missed; initSyncStore also wires the storage listener that relays
  // the background's writes into this popup context.
  let syncConflictCount = $state(0);

  $effect(() => {
    const unsub = onSyncConfigChange((cfg) => {
      syncConflictCount = cfg.pendingConflicts?.length ?? 0;
    });
    initSyncStore().then(() => {
      syncConflictCount = getSyncConfig().pendingConflicts?.length ?? 0;
    });
    return unsub;
  });

  /**
   * Open the options page, optionally on a specific card. openOptionsPage()
   * cannot carry a hash, so a targeted jump goes through tabs.create — landing
   * on the Sessions tab and leaving the user to find "Cloud Sync" is what made
   * the conflict banner feel like a dead end.
   */
  function openSettings(hash?: string) {
    if (!hash) {
      chrome.runtime.openOptionsPage();
      return;
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html#${hash}`) });
  }
</script>

<main>
  {#if loading}
    <div class="popup-content">
      <header class="header">
        <div class="header-title">
          <AppLogo size={20} />
          <h1>Sessions</h1>
        </div>
      </header>
      <div class="loading-skeleton" aria-busy="true" aria-label="Loading sessions">
        <div class="skel skel-panel"></div>
        <div class="skel skel-item"></div>
        <div class="skel skel-item short"></div>
      </div>
    </div>
  {:else if view === 'new'}
    <div
      class="popup-content"
      in:fly={{ x: 200, duration: 200 }}
      out:fly={{ x: -200, duration: 150 }}
    >
      <SessionForm
        oncreate={handleCreate}
        oncancel={() => (view = 'list')}
        captureDomain={currentDomain}
        existingNames={sessions.map((s) => s.name)}
      />
    </div>
  {:else}
    <div
      class="popup-content"
      in:fly={{ x: -200, duration: 200 }}
      out:fly={{ x: 200, duration: 150 }}
    >
      <header class="header">
        <div class="header-title">
          <AppLogo size={20} />
          <h1>Sessions</h1>
        </div>
        <div class="header-actions">
          {#if visibleSessions.length > 0 && !showSearch}
            <button
              class="icon-btn"
              onclick={revealSearch}
              aria-label="Search sessions"
              title="Search sessions (/)"
            >
              <Icon name="search" size={15} />
            </button>
          {/if}
          <ThemeToggle />
          <button
            class="icon-btn"
            onclick={() => openSettings()}
            aria-label="Open settings"
            title="Settings"
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </header>

      <div class="scroll-body">
        {#if syncConflictCount > 0}
          <button class="sync-conflict-banner" onclick={() => openSettings('sync')}>
            <Icon name="alert-triangle" size={14} />
            <span class="conflict-banner-label">
              {syncConflictCount} sync {syncConflictCount === 1 ? 'conflict' : 'conflicts'} — auto-sync
              paused
            </span>
            <Icon name="chevron-right" size={14} />
          </button>
        {/if}

        <CurrentTabPanel
          {currentOrigin}
          supported={tabSupported}
          currentSessionColor={currentSession?.color}
          currentSessionEmoji={currentSession?.emoji}
          currentSessionName={currentSession?.name}
          onrefresh={handleUpdateSessionData}
          {refreshing}
          {globalAutoRefreshOn}
          {domainAutoRefreshOn}
          onautorefreshToggle={handleAutoRefreshToggle}
          {isolationMode}
          onisolationToggle={handleIsolationToggle}
          onopensettings={() => openSettings('auto-save')}
        />

        {#if showSearch}
          <SearchBar
            bind:this={searchBar}
            query={searchQuery}
            onchange={(q) => (searchQuery = q)}
            ondismiss={() => (searchRevealed = false)}
            resultCount={grouping.filtered.length}
            totalCount={visibleSessions.length}
          />
        {/if}

        <SessionList
          {grouping}
          sessions={visibleSessions}
          activeSessionId={currentTabEntry?.sessionId}
          {switchingSessionId}
          {tabCounts}
          {sessionsWithOriginData}
          {searchQuery}
          onswitch={handleSwitch}
          ondetach={handleDetach}
          ondelete={requestDelete}
          onrename={handleRename}
          {editingSessionId}
          onmenu={openMenu}
          oncreate={() => (view = 'new')}
          onclearsearch={() => (searchQuery = '')}
          onreorder={handleReorder}
        />
      </div>

      {#if visibleSessions.length > 0}
        <footer class="footer">
          <button class="new-btn" onclick={() => (view = 'new')}>
            <Icon name="plus" size={14} />
            New session
          </button>
          <button
            class="hint-btn"
            onclick={() => (showShortcuts = true)}
            title="Keyboard shortcuts"
          >
            <kbd>?</kbd>
            Shortcuts
          </button>
        </footer>
      {/if}
    </div>
  {/if}

  {#if toastData}
    {#key toastData.id}
      <Toast
        message={toastData.message}
        type={toastData.type}
        action={toastData.action}
        duration={toastData.duration}
        ondismiss={dismissToast}
      />
    {/key}
  {/if}

  {#if confirmData}
    <ConfirmDialog
      title={confirmData.title}
      message={confirmData.message}
      detail={confirmData.detail}
      confirmLabel={confirmData.confirmLabel}
      danger={confirmData.danger}
      onconfirm={confirmData.onconfirm}
      oncancel={() => (confirmData = null)}
    />
  {/if}

  {#if contextMenuData}
    <ContextMenu
      x={contextMenuData.x}
      y={contextMenuData.y}
      items={contextMenuData.items}
      onclose={() => (contextMenuData = null)}
    />
  {/if}

  {#if showShortcuts}
    <ShortcutsOverlay onclose={() => (showShortcuts = false)} />
  {/if}

  {#if authGateData}
    <AuthGate onauth={authGateData.onauth} oncancel={() => (authGateData = null)} />
  {/if}
</main>

<style>
  main {
    width: var(--popup-width);
    min-height: 220px;
    background: var(--color-bg-primary);
  }

  .popup-content {
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
    gap: var(--space-4);
  }

  /* The header and the primary action stay put while the list scrolls, so
     "New session" is never a scroll away in a tall list. */
  .header {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-6) var(--space-4);
    margin: calc(-1 * var(--space-6)) calc(-1 * var(--space-6)) 0;
    background: var(--color-bg-primary);
  }

  .scroll-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .footer {
    position: sticky;
    bottom: 0;
    z-index: var(--z-sticky);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6) var(--space-6);
    margin: 0 calc(-1 * var(--space-6)) calc(-1 * var(--space-6));
    background: var(--color-bg-primary);
    border-top: 1px solid var(--color-border-secondary);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  h1 {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
    letter-spacing: -0.01em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    line-height: 1;
    display: flex;
    align-items: center;
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-interactive-hover);
  }

  .icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    flex: 1;
    padding: var(--space-4) var(--space-5);
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-semibold);
    color: var(--color-on-accent);
    cursor: pointer;
    transition: all var(--transition-smooth);
  }

  .new-btn:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
    box-shadow: var(--shadow-sm);
  }

  .new-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .hint-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .hint-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .hint-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .hint-btn kbd {
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-2);
    line-height: 15px;
  }

  /* Sync conflict banner */
  .sync-conflict-banner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: var(--color-warning-soft);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-lg);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .sync-conflict-banner:hover {
    filter: brightness(0.98);
  }

  .sync-conflict-banner:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .sync-conflict-banner :global(svg) {
    color: var(--color-warning);
    flex-shrink: 0;
  }

  .conflict-banner-label {
    flex: 1;
    min-width: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    line-height: var(--leading-snug);
  }

  /* Loading skeleton */
  .loading-skeleton {
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
    border-radius: var(--radius-lg);
  }

  .skel-panel {
    height: 72px;
  }

  .skel-item {
    height: 44px;
  }

  .skel-item.short {
    width: 60%;
  }
</style>
