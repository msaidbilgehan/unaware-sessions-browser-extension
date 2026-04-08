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
    <span class="loading">Loading stats...</span>
  {:else if error}
    <span class="error">{error}</span>
  {:else if stats}
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-label">Tabs</span>
        <span class="stat-value">{stats.tabCount}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Cookies</span>
        <span class="stat-value">{stats.cookieCount}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Storage</span>
        <span class="stat-value">{formatBytes(stats.storageBytes)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">IDB</span>
        <span class="stat-value">{stats.idbDatabases}</span>
      </div>
    </div>
    {#if stats.origins.length > 0}
      <div class="origins">
        <span class="origins-label">Origins:</span>
        {#each stats.origins as origin}
          <span class="origin-tag">
            <Icon name="globe" size={10} />
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
    margin-top: var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-secondary);
  }

  .loading,
  .error {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .error {
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
  }

  .stat-label {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .stat-value {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .origins {
    margin-top: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .origins-label {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-right: var(--space-1);
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
