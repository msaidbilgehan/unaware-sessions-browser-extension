<script lang="ts">
  import type {
    SessionProfile,
    TabSessionEntry,
    AutoRefreshInterval,
    IsolationMode,
  } from '@shared/types';
  import { extractOrigin, extractDomain } from '@shared/utils';
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
  import { fly } from 'svelte/transition';
  import Icon from '@shared/components/Icon.svelte';
  import ThemeToggle from '@shared/components/ThemeToggle.svelte';
  import AppLogo from '@shared/components/AppLogo.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import AuthGate from '@shared/components/AuthGate.svelte';
  import { checkAuth } from '@shared/auth-check';
  import Toast from '@shared/components/Toast.svelte';
  import SessionList from './components/SessionList.svelte';
  import NewSessionForm from './components/NewSessionForm.svelte';
  import CurrentTabPanel from './components/CurrentTabPanel.svelte';
  import SearchBar from './components/SearchBar.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import type { ContextMenuItem } from './components/ContextMenu.svelte';
  import KeyboardOverlay from './components/KeyboardOverlay.svelte';

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
  let showKeyboardOverlay = $state(false);
  let editingSessionId = $state<string | null>(null);
  let switchingSessionId = $state<string | null>(null);

  // Toast state
  let toastData = $state<{
    message: string;
    type: 'error' | 'success' | 'info';
    action?: { label: string; onclick: () => void };
  } | null>(null);

  // Confirm dialog state
  let confirmData = $state<{
    title: string;
    message: string;
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

  // Undo state
  let deletedSession = $state<SessionProfile | null>(null);

  // Derived
  const currentOrigin = $derived(currentTab?.url ? extractOrigin(currentTab.url) : '');
  const currentSession = $derived(
    currentTabEntry ? sessions.find((s) => s.id === currentTabEntry!.sessionId) : undefined,
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
  ) {
    toastData = { message, type, action };
  }

  async function handleCreate(name: string, color: string, emoji?: string) {
    try {
      const session = await createSession(name, color, emoji);
      // Fetch the authoritative list from the background instead of appending
      // locally — the storage-change listener may have already added the session
      // via updateSessionsQuietly(), and duplicates crash the keyed {#each}.
      sessions = await listSessions();

      if (currentTab?.id && currentOrigin) {
        await assignTab(currentTab.id, session.id, currentOrigin);
        currentTabEntry = { sessionId: session.id, origin: currentOrigin };
      }

      view = 'list';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create session', 'error');
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
        showToast(err instanceof Error ? err.message : 'Failed to switch session', 'error');
      } finally {
        switchingSessionId = null;
      }
    });
  }

  function handleDeleteRequest(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    confirmData = {
      title: 'Delete Session',
      message: `Delete "${session.name}"? Cookie and storage data will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
      onconfirm: () => executeDelete(session),
    };
  }

  async function executeDelete(session: SessionProfile) {
    await withAuth(async () => {
      confirmData = null;
      try {
        await deleteSessionApi(session.id);
        sessions = sessions.filter((s) => s.id !== session.id);
        if (currentTabEntry?.sessionId === session.id) {
          currentTabEntry = undefined;
        }
        deletedSession = session;
        showToast(`"${session.name}" deleted`, 'info', {
          label: 'Undo',
          onclick: handleUndoDelete,
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to delete session', 'error');
      }
    });
  }

  async function handleUndoDelete() {
    if (!deletedSession) return;
    try {
      await createSession(deletedSession.name, deletedSession.color, deletedSession.emoji);
      sessions = await listSessions();
      deletedSession = null;
      toastData = null;
      showToast('Session restored', 'success');
    } catch {
      showToast('Failed to restore session', 'error');
    }
  }

  async function handleRename(sessionId: string, newName: string) {
    editingSessionId = null;
    try {
      const updated = await updateSession(sessionId, { name: newName });
      sessions = sessions.map((s) => (s.id === sessionId ? updated : s));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to rename session', 'error');
    }
  }

  async function handleUnassign() {
    if (!currentTab?.id) return;
    try {
      await clearOriginData(currentTab.id);
      currentTabEntry = undefined;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear session', 'error');
    }
  }

  let refreshing = $state(false);

  async function handleUpdateSessionData() {
    refreshing = true;
    try {
      if (currentTab?.id && currentTabEntry) {
        await saveSessionData(currentTab.id);
      }

      // Refresh UI quietly — no loading skeleton
      await updateSessionsQuietly();

      // Auto-detect session if no mapping exists
      if (!currentTabEntry && currentOrigin && currentTab?.id) {
        const detectedId = await detectSession(currentOrigin, currentTab.id);
        if (detectedId) {
          await assignTab(currentTab.id, detectedId, currentOrigin);
          currentTabEntry = { sessionId: detectedId, origin: currentOrigin };
        }
      }

      showToast(currentTabEntry ? 'Session data updated' : 'Session detected', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      refreshing = false;
    }
  }

  async function handleReorder(orderedIds: string[]) {
    try {
      await reorderSessions(orderedIds);
      sessions = orderedIds
        .map((id) => sessions.find((s) => s.id === id))
        .filter((s): s is SessionProfile => s !== undefined);
    } catch {
      showToast('Failed to reorder sessions', 'error');
    }
  }

  function handleContextMenu(e: MouseEvent, sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const items: ContextMenuItem[] = [
      {
        label: 'Rename',
        icon: 'edit-2',
        onclick: () => {
          editingSessionId = sessionId;
        },
      },
      {
        label: 'Duplicate',
        icon: 'copy',
        onclick: async () => {
          try {
            await duplicateSessionApi(sessionId);
            sessions = await listSessions();
          } catch {
            showToast('Failed to duplicate session', 'error');
          }
        },
      },
      {
        label: session.pinned ? 'Unpin' : 'Pin',
        icon: 'pin',
        onclick: async () => {
          try {
            const updated = await updateSession(sessionId, { pinned: !session.pinned });
            sessions = sessions.map((s) => (s.id === sessionId ? updated : s));
          } catch {
            showToast('Failed to update session', 'error');
          }
        },
      },
      {
        label: 'Delete',
        icon: 'trash-2',
        danger: true,
        onclick: () => handleDeleteRequest(sessionId),
      },
    ];

    contextMenuData = { x: e.clientX, y: e.clientY, items };
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      if (contextMenuData) {
        contextMenuData = null;
        return;
      }
      if (view === 'new') {
        view = 'list';
        return;
      }
    }

    if (isInput) return;

    if (e.key === 'n' && view === 'list') {
      e.preventDefault();
      view = 'new';
    } else if (e.key === '/' && view === 'list') {
      e.preventDefault();
      searchQuery = '';
    } else if (e.key === '?' && view === 'list') {
      e.preventDefault();
      showKeyboardOverlay = true;
    }
  }

  $effect(() => {
    loadState();
  });

  // Silently update when storage changes externally (e.g., auto-refresh, settings page, context menu).
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

  // Auto-refresh — hierarchical toggle: global interval is the master switch,
  // per-domain toggles control individual session:origin pairs.
  let autoRefreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());
  const globalAutoRefreshOn = $derived(autoRefreshInterval > 0);

  // Per-domain auto-refresh state for the current tab's session:origin
  let domainAutoRefreshOn = $state(false);

  // Effective state: global is on AND this domain is on
  const autoRefreshEffective = $derived(globalAutoRefreshOn && domainAutoRefreshOn);

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

  // Toggle per-domain auto-refresh for the current session:origin
  async function handleAutoRefreshToggle() {
    if (!currentTabEntry || !currentOrigin) return;
    await setDomainAutoRefresh(currentTabEntry.sessionId, currentOrigin, !domainAutoRefreshOn);
  }

  // Isolation mode (per-domain: soft/strict)
  const currentDomain = $derived(currentOrigin ? extractDomain(currentOrigin) : '');
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
  }

  // Auto-refresh is handled by the service worker alarm (background/auto-refresh.ts).
  // The storage listener above picks up changes and updates the UI quietly.
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main onkeydown={handleKeydown}>
  {#if loading}
    <div class="popup-content">
      <div class="header">
        <div class="header-title">
          <AppLogo size={20} />
          <h1>Sessions</h1>
        </div>
      </div>
      <div class="loading-skeleton">
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
      <NewSessionForm oncreate={handleCreate} oncancel={() => (view = 'list')} />
    </div>
  {:else}
    <div
      class="popup-content"
      in:fly={{ x: -200, duration: 200 }}
      out:fly={{ x: 200, duration: 150 }}
    >
      <div class="header">
        <div class="header-title">
          <AppLogo size={20} />
          <h1>Sessions</h1>
        </div>
        <div class="header-actions">
          <ThemeToggle />
          <button
            class="icon-btn"
            onclick={() => chrome.runtime.openOptionsPage()}
            aria-label="Settings"
            title="Settings"
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </div>

      <CurrentTabPanel
        {currentOrigin}
        currentSessionColor={currentSession?.color}
        currentSessionEmoji={currentSession?.emoji}
        currentSessionName={currentSession?.name}
        onrefresh={handleUpdateSessionData}
        {refreshing}
        {globalAutoRefreshOn}
        {domainAutoRefreshOn}
        {autoRefreshEffective}
        onautorefreshToggle={handleAutoRefreshToggle}
        {isolationMode}
        onisolationToggle={handleIsolationToggle}
      />

      {#if sessions.length > 5}
        <SearchBar query={searchQuery} onchange={(q) => (searchQuery = q)} />
      {/if}

      <SessionList
        {sessions}
        activeSessionId={currentTabEntry?.sessionId}
        {switchingSessionId}
        {tabCounts}
        {sessionsWithOriginData}
        {sessionOriginMap}
        {currentOrigin}
        {searchQuery}
        onswitch={handleSwitch}
        onunassign={handleUnassign}
        ondelete={handleDeleteRequest}
        onrename={handleRename}
        {editingSessionId}
        oncontextmenu={handleContextMenu}
        oncreate={() => (view = 'new')}
        ondragend={handleReorder}
      />

      <button class="new-btn" onclick={() => (view = 'new')}>
        <Icon name="plus" size={14} />
        New Session
      </button>
    </div>
  {/if}

  {#if toastData}
    <Toast
      message={toastData.message}
      type={toastData.type}
      action={toastData.action}
      ondismiss={() => (toastData = null)}
    />
  {/if}

  {#if confirmData}
    <ConfirmDialog
      title={confirmData.title}
      message={confirmData.message}
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

  {#if showKeyboardOverlay}
    <KeyboardOverlay
      {sessions}
      onswitch={handleSwitch}
      onclose={() => (showKeyboardOverlay = false)}
    />
  {/if}

  {#if authGateData}
    <AuthGate onauth={authGateData.onauth} oncancel={() => (authGateData = null)} />
  {/if}
</main>

<style>
  main {
    width: 380px;
    min-height: 200px;
    background: var(--color-bg-primary);
  }

  .popup-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-2);
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
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border: 1px dashed var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-smooth);
    flex-shrink: 0;
  }

  .new-btn:hover {
    background: var(--color-accent-soft);
    border-color: var(--color-accent-muted);
    border-style: solid;
    color: var(--color-accent);
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
    height: 56px;
  }

  .skel-item {
    height: 44px;
  }

  .skel-item.short {
    width: 60%;
  }
</style>
