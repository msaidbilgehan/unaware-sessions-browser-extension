<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import type { SessionProfile, SessionStats } from '@shared/types';
  import { getSessionStats } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    sessions: SessionProfile[];
  }

  let { sessions }: Props = $props();
  let stats = new SvelteMap<string, SessionStats>();
  let loading = $state(false);

  // Reload only when the set of sessions changes — a rename or a colour change
  // arriving through the storage listener must not restart every stats query.
  let loadedKey = '';
  let loadVersion = 0;

  async function loadStats(sessionList: SessionProfile[]) {
    const version = ++loadVersion;
    loading = true;
    // One round trip per session, but concurrently: serially awaiting N
    // messages made this the slowest thing on the page for large profiles.
    const results = await Promise.allSettled(sessionList.map((s) => getSessionStats(s.id)));
    if (version !== loadVersion) return;
    stats.clear();
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') stats.set(sessionList[i].id, result.value);
    });
    loading = false;
  }

  $effect(() => {
    const key = sessions.map((s) => s.id).join(',');
    if (key === loadedKey) return;
    loadedKey = key;
    if (sessions.length === 0) {
      stats.clear();
      return;
    }
    loadStats(sessions);
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const rows = $derived.by(() =>
    sessions
      .map((session) => {
        const s = stats.get(session.id);
        return s ? { session, stats: s, total: s.cookieBytes + s.storageBytes } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.total - a.total),
  );

  const maxBytes = $derived(Math.max(1, ...rows.map((r) => r.total)));
  const grandTotal = $derived(rows.reduce((sum, r) => sum + r.total, 0));
</script>

{#if sessions.length > 0}
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="database" size={16} />
      </div>
      <div>
        <h2>Storage used</h2>
        <p class="description">
          How much saved cookie and storage data each session holds, largest first.
        </p>
      </div>
      {#if grandTotal > 0}
        <span class="total-badge">{formatBytes(grandTotal)}</span>
      {/if}
    </div>

    {#if loading && rows.length === 0}
      <div class="loading">
        <span class="loading-spinner"></span>
        <span>Measuring…</span>
      </div>
    {:else if grandTotal === 0}
      <!-- Rows of empty bars all reading "0 B" is noise, not information. -->
      <p class="empty">
        Nothing saved yet. A session starts holding data the first time you visit a site with it.
      </p>
    {:else}
      <div class="dashboard">
        {#each rows as row (row.session.id)}
          <div class="row">
            <span class="row-label">
              <span class="dot" style="background-color: {row.session.color}"></span>
              <span class="name" title={row.session.name}>
                {row.session.emoji ?? ''}
                {row.session.name}
              </span>
            </span>
            <span class="bar-container">
              <span
                class="bar cookie-bar"
                style="width: {((row.stats.cookieBytes / maxBytes) * 100).toFixed(1)}%"
                title="Cookies: {formatBytes(row.stats.cookieBytes)}"
              ></span>
              <span
                class="bar storage-bar"
                style="width: {((row.stats.storageBytes / maxBytes) * 100).toFixed(1)}%"
                title="Storage: {formatBytes(row.stats.storageBytes)}"
              ></span>
            </span>
            <span class="size">{formatBytes(row.total)}</span>
          </div>
        {/each}
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot cookie"></span> Cookies</span>
        <span class="legend-item"
          ><span class="legend-dot storage"></span> Local &amp; session storage</span
        >
      </div>
    {/if}
  </section>
{/if}

<style>
  .card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    padding: var(--space-7);
    box-shadow: var(--shadow-xs);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .card-header {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
  }

  .card-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  h2 {
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-1) 0 0;
    line-height: var(--leading-relaxed);
  }

  .total-badge {
    margin-left: auto;
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border-primary);
    border-top-color: var(--color-accent);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .empty {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(80px, 160px) 1fr 72px;
    align-items: center;
    gap: var(--space-4);
  }

  .row-label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .name {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-container {
    display: flex;
    height: 12px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .bar {
    height: 100%;
    transition: width var(--transition-normal);
  }

  .cookie-bar {
    background: var(--color-accent);
  }

  .storage-bar {
    background: var(--color-success);
  }

  .size {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    text-align: right;
  }

  .legend {
    display: flex;
    gap: var(--space-6);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
  }

  .legend-dot.cookie {
    background: var(--color-accent);
  }

  .legend-dot.storage {
    background: var(--color-success);
  }
</style>
