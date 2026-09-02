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
  import ThemeToggle from '@shared/components/ThemeToggle.svelte';

  const tabs = [
    { id: 'sessions', label: 'Sessions', icon: 'layers' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'data', label: 'Data', icon: 'arrow-right-left' },
    { id: 'about', label: 'About', icon: 'info' },
    { id: 'debug', label: 'Debug', icon: 'zap' },
  ];
  const tabIds = tabs.map((t) => t.id);

  /**
   * Fragments that address a card rather than a tab. The popup links straight
   * to the setting it is complaining about, so "Review" is one click instead of
   * a hunt through the Settings page.
   */
  const CARD_LINKS: Record<string, { tab: string; anchor: string }> = {
    sync: { tab: 'settings', anchor: 'sync' },
    'auto-save': { tab: 'settings', anchor: 'auto-save' },
    security: { tab: 'settings', anchor: 'security' },
    isolation: { tab: 'settings', anchor: 'isolation' },
  };

  function routeFromHash(): { tab: string; anchor: string } {
    const raw = location.hash.replace(/^#/, '');
    if (CARD_LINKS[raw]) return CARD_LINKS[raw];
    if (tabIds.includes(raw)) return { tab: raw, anchor: '' };
    return { tab: 'sessions', anchor: '' };
  }

  let sessions = $state<SessionProfile[]>([]);
  let loading = $state(true);
  let activeTab = $state(routeFromHash().tab);
  let pendingAnchor = $state(routeFromHash().anchor);

  // Sessions/Data/Debug read the session list; Settings and About do not, and
  // blocking them behind a spinner made the whole page feel slower than it is.
  const needsSessions = $derived(activeTab !== 'settings' && activeTab !== 'about');

  function selectTab(id: string) {
    activeTab = id;
    pendingAnchor = '';
    // replaceState keeps the back button out of tab switching while still
    // making the current tab reload-safe and linkable.
    history.replaceState(null, '', `#${id}`);
  }

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

  $effect(() => {
    function onHashChange() {
      const route = routeFromHash();
      activeTab = route.tab;
      pendingAnchor = route.anchor;
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  // Scroll to the addressed card once its tab has rendered.
  $effect(() => {
    if (!pendingAnchor || activeTab !== 'settings') return;
    const anchor = pendingAnchor;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('card-highlight');
      setTimeout(() => el.classList.remove('card-highlight'), 2000);
      pendingAnchor = '';
    });
    return () => cancelAnimationFrame(frame);
  });

  // Silently update when storage changes externally (e.g., auto-save, popup actions).
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
</script>

<main>
  <div class="page-header">
    <div class="header-content">
      <AppLogo size={28} />
      <div class="header-text">
        <h1>Unaware Sessions</h1>
        <p class="subtitle">Manage your browsing sessions and extension preferences</p>
      </div>
      <ThemeToggle />
    </div>
  </div>

  <TabBar {tabs} {activeTab} onchange={selectTab} />

  <div
    class="tab-content"
    id="tabpanel-{activeTab}"
    role="tabpanel"
    aria-labelledby="tab-{activeTab}"
  >
    {#if loading && needsSessions}
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Loading sessions…</p>
      </div>
    {:else if activeTab === 'sessions'}
      <SessionsTab {sessions} onupdate={loadSessions} />
    {:else if activeTab === 'settings'}
      <SettingsTab />
    {:else if activeTab === 'data'}
      <ImportExportTab {sessions} onupdate={loadSessions} />
    {:else if activeTab === 'about'}
      <AboutTab />
    {:else if activeTab === 'debug'}
      <DebugTab {sessions} />
    {/if}
  </div>
</main>

<style>
  main {
    max-width: 780px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-7) var(--space-10);
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
    flex: 1;
    min-width: 0;
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

  /* Applied by the deep-link handler so a linked card is findable at a glance. */
  :global(.card-highlight) {
    box-shadow: var(--shadow-glow), var(--shadow-sm);
    border-color: var(--color-accent) !important;
    transition:
      box-shadow var(--transition-smooth),
      border-color var(--transition-smooth);
  }
</style>
