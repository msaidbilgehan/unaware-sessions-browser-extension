<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import type { SessionProfile, SessionStats } from '@shared/types';
  import { getSessionStats } from '@shared/api';

  interface Props {
    sessions: SessionProfile[];
  }

  let { sessions }: Props = $props();
  let stats: SvelteMap<string, SessionStats> = new SvelteMap();
  let loading = $state(false);

  async function loadStats() {
    if (sessions.length === 0) return;
    loading = true;
    const newStats = new SvelteMap<string, SessionStats>();
    for (const session of sessions) {
      try {
        const s = await getSessionStats(session.id);
        newStats.set(session.id, s);
      } catch {
        // Skip failed stats
      }
    }
    stats = newStats;
    loading = false;
  }

  $effect(() => {
    loadStats();
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const maxBytes = $derived(() => {
    let max = 0;
    for (const s of stats.values()) {
      const total = s.cookieBytes + s.storageBytes;
      if (total > max) max = total;
    }
    return max || 1;
  });
</script>

{#if sessions.length > 0}
  <section>
    <h2>Storage Usage</h2>
    {#if loading}
      <p class="loading">Loading storage data...</p>
    {:else}
      <div class="dashboard">
        {#each sessions as session (session.id)}
          {@const s = stats.get(session.id)}
          {#if s}
            <div class="row">
              <div class="row-label">
                <span class="dot" style="background-color: {session.color}"></span>
                <span class="name" title={session.name}>{session.name}</span>
              </div>
              <div class="bar-container">
                <div
                  class="bar cookie-bar"
                  style="width: {((s.cookieBytes / maxBytes()) * 100).toFixed(1)}%"
                  title="Cookies: {formatBytes(s.cookieBytes)}"
                ></div>
                <div
                  class="bar storage-bar"
                  style="width: {((s.storageBytes / maxBytes()) * 100).toFixed(1)}%"
                  title="Storage: {formatBytes(s.storageBytes)}"
                ></div>
              </div>
              <span class="size">{formatBytes(s.cookieBytes + s.storageBytes)}</span>
            </div>
          {/if}
        {/each}
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot cookie"></span> Cookies</span>
        <span class="legend-item"><span class="legend-dot storage"></span> Storage</span>
      </div>
    {/if}
  </section>
{/if}

<style>
  section {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-top: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-5);
    color: var(--color-text-primary);
  }

  .loading {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
  }

  .dashboard {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .row {
    display: grid;
    grid-template-columns: 120px 1fr 60px;
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
    min-width: 2px;
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
    margin-top: var(--space-4);
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
