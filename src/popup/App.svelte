<script lang="ts">
  import type { SessionProfile, TabSessionEntry } from '@shared/types';
  import { extractOrigin } from '@shared/utils';
  import {
    listSessions,
    createSession,
    deleteSession as deleteSessionApi,
    switchSession,
    getSessionForTab,
    assignTab,
    unassignTab,
    getCurrentTab,
    getAllTabCounts,
    updateSession,
    reorderSessions,
    duplicateSession as duplicateSessionApi,
    getSessionsForOrigin,
    saveSessionData,
    detectSession,
  } from '@shared/api';
  import { fly } from 'svelte/transition';
  import Icon from '@shared/components/Icon.svelte';
  import ThemeToggle from '@shared/components/ThemeToggle.svelte';
  import AppLogo from '@shared/components/AppLogo.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
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
  let currentTab = $state<chrome.tabs.Tab | undefined>(undefined);
  let currentTabEntry = $state<TabSessionEntry | undefined>(undefined);

  // View routing
  let view = $state<'list' | 'new'>('list');

  // UI state
  let loading = $state(true);
  let searchQuery = $state('');
  let showKeyboardOverlay = $state(false);

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

        if (!currentTabEntry && tab.url) {
          const origin = extractOrigin(tab.url);
          if (origin) {
            const detectedId = await detectSession(origin);
            if (detectedId) {
              await assignTab(tab.id, detectedId, origin);
              currentTabEntry = { sessionId: detectedId, origin };
            }
          }
        }
      }
      const origin = tab?.url ? extractOrigin(tab.url) : '';
      if (origin) {
        const ids = await getSessionsForOrigin(origin);
        sessionsWithOriginData = new Set(ids);
      } else {
        sessionsWithOriginData = new Set();
      }
    } catch (err) {
      console.error('[Unaware Sessions] Failed to load state:', err);
    } finally {
      loading = false;
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
      sessions = [...sessions, session];

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
    if (!currentTab?.id) return;
    try {
      await switchSession(currentTab.id, sessionId);
      // Update local state immediately so the UI reflects the new session
      currentTabEntry = { sessionId, origin: currentOrigin };
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to switch session', 'error');
    }
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
  }

  async function handleUndoDelete() {
    if (!deletedSession) return;
    try {
      const restored = await createSession(
        deletedSession.name,
        deletedSession.color,
        deletedSession.emoji,
      );
      sessions = [...sessions, restored];
      deletedSession = null;
      toastData = null;
      showToast('Session restored', 'success');
    } catch {
      showToast('Failed to restore session', 'error');
    }
  }

  async function handleRename(sessionId: string, newName: string) {
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
      await unassignTab(currentTab.id);
      currentTabEntry = undefined;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to unassign tab', 'error');
    }
  }

  let refreshing = $state(false);

  async function handleUpdateSessionData() {
    refreshing = true;
    try {
      if (currentTab?.id && currentTabEntry) {
        await saveSessionData(currentTab.id);
      }
      await loadState();
      showToast('Session data updated', 'success');
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
          /* Inline edit is triggered via double-click */
        },
      },
      {
        label: 'Duplicate',
        icon: 'copy',
        onclick: async () => {
          try {
            const dup = await duplicateSessionApi(sessionId);
            sessions = [...sessions, dup];
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
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main onkeydown={handleKeydown}>
  {#if loading}
    <div class="loading">Loading...</div>
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
          <AppLogo size={22} />
          <h1>Unaware Sessions</h1>
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
        currentSessionName={currentSession?.name}
        currentSessionColor={currentSession?.color}
        currentSessionEmoji={currentSession?.emoji}
        {sessions}
        onswitch={handleSwitch}
        onunassign={handleUnassign}
        onrefresh={handleUpdateSessionData}
        {refreshing}
      />

      {#if sessions.length > 5}
        <SearchBar query={searchQuery} onchange={(q) => (searchQuery = q)} />
      {/if}

      <SessionList
        {sessions}
        activeSessionId={currentTabEntry?.sessionId}
        {tabCounts}
        {sessionsWithOriginData}
        {searchQuery}
        onswitch={handleSwitch}
        ondelete={handleDeleteRequest}
        onrename={handleRename}
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
</main>

<style>
  main {
    width: 380px;
    min-height: 200px;
    max-height: 580px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popup-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-5);
    overflow-y: auto;
    flex: 1;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    border-radius: var(--radius-sm);
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
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-tertiary);
    border: 1px dashed var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .new-btn:hover {
    background: var(--color-interactive-hover);
    border-color: var(--color-text-tertiary);
    color: var(--color-text-primary);
  }

  .loading {
    text-align: center;
    padding: var(--space-7);
    font-size: var(--text-base);
    color: var(--color-text-tertiary);
  }
</style>
