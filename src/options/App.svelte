<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { listSessions } from '@shared/api';
  import { STORAGE_KEYS } from '@shared/constants';
  import TabBar from './components/TabBar.svelte';
  import SessionsTab from './components/SessionsTab.svelte';
  import ImportExportTab from './components/ImportExportTab.svelte';
  import SettingsTab from './components/SettingsTab.svelte';
  import AboutTab from './components/AboutTab.svelte';
  import DebugTab from './components/DebugTab.svelte';
  import AppLogo from '@shared/components/AppLogo.svelte';

  let sessions = $state<SessionProfile[]>([]);
  let loading = $state(true);
  let activeTab = $state('sessions');

  const tabs = [
    { id: 'sessions', label: 'Sessions', icon: 'layers' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'import-export', label: 'Data', icon: 'arrow-right-left' },
    { id: 'about', label: 'About', icon: 'info' },
    { id: 'debug', label: 'Debug', icon: 'zap' },
  ];

  // Full initial load with loading spinner — called once on mount
  async function loadSessions() {
    loading = true;
    try {
      sessions = await listSessions();
    } catch (err) {
      console.error('[Unaware Sessions] Failed to load sessions:', err);
    } finally {
      loading = false;
    }
  }

  // Silent update — only replace sessions if the data actually changed,
  // to avoid resetting child component state (expanded sessions, editing, etc.)
  async function updateSessionsQuietly() {
    try {
      const fresh = await listSessions();
      if (JSON.stringify(fresh) !== JSON.stringify(sessions)) {
        sessions = fresh;
      }
    } catch {
      // Silently ignore
    }
  }

  $effect(() => {
    loadSessions();
  });

  // Silently update when storage changes externally (e.g., auto-refresh, popup actions)
  $effect(() => {
    function handleStorageChange(
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) {
      if (area !== 'local') return;
      if (STORAGE_KEYS.SESSIONS in changes || STORAGE_KEYS.SESSION_ORDER in changes) {
        updateSessionsQuietly();
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  });

  // Auto-refresh is handled by the service worker alarm (background/auto-refresh.ts).
  // The storage listener above picks up changes and updates the UI quietly.
</script>

<main>
  <div class="page-header">
    <div class="header-content">
      <AppLogo size={28} />
      <div class="header-text">
        <h1>Unaware Sessions</h1>
        <p class="subtitle">Manage your browsing sessions and extension preferences</p>
      </div>
    </div>
  </div>

  <TabBar {tabs} {activeTab} onchange={(t) => (activeTab = t)} />

  <div class="tab-content">
    {#if loading}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading sessions...</p>
      </div>
    {:else if activeTab === 'sessions'}
      <SessionsTab {sessions} onupdate={loadSessions} />
    {:else if activeTab === 'settings'}
      <SettingsTab />
    {:else if activeTab === 'import-export'}
      <ImportExportTab {sessions} onupdate={loadSessions} />
    {:else if activeTab === 'about'}
      <AboutTab {sessions} onupdate={loadSessions} />
    {:else if activeTab === 'debug'}
      <DebugTab {sessions} onupdate={loadSessions} />
    {/if}
  </div>
</main>

<style>
  main {
    max-width: 780px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-7);
  }

  .page-header {
    margin-bottom: var(--space-7);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
    letter-spacing: -0.02em;
  }

  .subtitle {
    margin: 0;
    font-size: var(--text-md);
    color: var(--color-text-tertiary);
    line-height: var(--leading-snug);
  }

  .tab-content {
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-10);
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border-primary);
    border-top-color: var(--color-accent);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  .loading p {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
