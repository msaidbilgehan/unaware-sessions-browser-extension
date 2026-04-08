<script lang="ts">
  import type { SessionStats } from '@shared/types';
  import { getSessionStats } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    sessionId: string;
  }

  let { sessionId }: Props = $props();
  let stats = $state<SessionStats | undefined>(undefined);
  let loading = $state(true);
  let error = $state('');

  $effect(() => {
    loading = true;
    error = '';
    getSessionStats(sessionId)
      .then((s) => {
        stats = s;
      })
      .catch((err) => {
        error = err instanceof Error ? err.message : 'Failed to load stats';
      })
      .finally(() => {
        loading = false;
      });
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="detail-panel">
  {#if loading}
    <div class="loading-row">
      <div class="skel skel-stat"></div>
      <div class="skel skel-stat"></div>
      <div class="skel skel-stat"></div>
      <div class="skel skel-stat"></div>
    </div>
  {:else if error}
    <span class="error-text">{error}</span>
  {:else if stats}
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-value">{stats.tabCount}</span>
        <span class="stat-label">Tabs</span>
      </div>
      <div class="stat">
        <span class="stat-value">{stats.cookieCount}</span>
        <span class="stat-label">Cookies</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatBytes(stats.storageBytes)}</span>
        <span class="stat-label">Storage</span>
      </div>
      <div class="stat">
        <span class="stat-value">{stats.idbDatabases}</span>
        <span class="stat-label">IDB</span>
      </div>
    </div>
    {#if stats.origins.length > 0}
      <div class="origins">
        {#each stats.origins as origin}
          <span class="origin-tag">
            <Icon name="globe" size={9} />
            {origin.replace(/^https?:\/\//, '')}
          </span>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .detail-panel {
    padding: var(--space-4);
    margin-top: var(--space-2);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
  }

  .loading-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
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
    border-radius: var(--radius-sm);
  }

  .skel-stat {
    height: 36px;
  }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) 0;
  }

  .stat-value {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    color: var(--color-text-primary);
    line-height: 1;
  }

  .stat-label {
    font-size: 10px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .origins {
    margin-top: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .origin-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
  }
</style>
