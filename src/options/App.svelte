<script lang="ts">
  import type { SessionProfile, AutoRefreshInterval } from '@shared/types';
  import { listSessions } from '@shared/api';
  import { getAutoRefreshInterval, onSettingsChange } from '@shared/settings-store';
  import TabBar from './components/TabBar.svelte';
  import SessionsTab from './components/SessionsTab.svelte';
  import ImportExportTab from './components/ImportExportTab.svelte';
  import SettingsTab from './components/SettingsTab.svelte';
  import AboutTab from './components/AboutTab.svelte';
  import AppLogo from '@shared/components/AppLogo.svelte';

  let sessions = $state<SessionProfile[]>([]);
  let loading = $state(true);
  let activeTab = $state('sessions');

  const tabs = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'settings', label: 'Settings' },
    { id: 'import-export', label: 'Import / Export' },
    { id: 'about', label: 'About' },
  ];

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

  $effect(() => {
    loadSessions();
  });

  // Auto-refresh
  let autoRefreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());

  $effect(() => {
    const unsub = onSettingsChange((s) => {
      autoRefreshInterval = s.autoRefreshInterval;
    });
    return unsub;
  });

  $effect(() => {
    const intervalSec = autoRefreshInterval;
    if (intervalSec === 0) return;

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadSessions();
      }
    }, intervalSec * 1000);

    return () => clearInterval(id);
  });
</script>

<main>
  <div class="page-header">
    <AppLogo size={32} />
    <h1>Unaware Sessions — Settings</h1>
  </div>

  <TabBar {tabs} {activeTab} onchange={(t) => (activeTab = t)} />

  {#if loading}
    <p class="loading">Loading...</p>
  {:else if activeTab === 'sessions'}
    <SessionsTab {sessions} onupdate={loadSessions} />
  {:else if activeTab === 'settings'}
    <SettingsTab />
  {:else if activeTab === 'import-export'}
    <ImportExportTab {sessions} onupdate={loadSessions} />
  {:else if activeTab === 'about'}
    <AboutTab {sessions} onupdate={loadSessions} />
  {/if}
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--space-7);
  }

  .page-header {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    margin-bottom: var(--space-7);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
  }

  .loading {
    text-align: center;
    color: var(--color-text-tertiary);
    padding: var(--space-7);
  }
</style>
