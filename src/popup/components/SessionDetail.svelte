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

  // One loader for both the initial fetch and Retry — the retry path used to
  // carry its own copy of this promise chain inline in the markup.
  async function load(id: string) {
    loading = true;
    error = '';
    try {
      stats = await getSessionStats(id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not read this session’s data';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(sessionId);
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
    <div class="error-row" role="alert">
      <Icon name="alert-triangle" size={12} />
      <span class="error-text">{error}</span>
      <button class="retry-btn" onclick={() => load(sessionId)}>
        <Icon name="refresh-cw" size={11} />
        Retry
      </button>
    </div>
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
        <span class="stat-label">Databases</span>
      </div>
    </div>
    {#if stats.origins.length > 0}
      <div class="origins">
        {#each stats.origins as origin (origin)}
          <span class="origin-tag">
            <Icon name="globe" size={9} />
            {origin.replace(/^https?:\/\//, '')}
          </span>
        {/each}
      </div>
    {:else}
      <p class="no-origins">No saved data yet.</p>
    {/if}
  {/if}
</div>

<style>
  .detail-panel {
    padding: var(--space-4);
    margin: 0 var(--space-4) var(--space-4);
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

  .error-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-error);
  }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    flex: 1;
    min-width: 0;
  }

  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: 1px solid var(--color-error-border);
    color: var(--color-error);
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-medium);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .retry-btn:hover {
    background: var(--color-error-soft);
  }

  .retry-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
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
    font-size: var(--text-2xs);
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

  .no-origins {
    margin: var(--space-4) 0 0;
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    text-align: center;
  }
</style>
