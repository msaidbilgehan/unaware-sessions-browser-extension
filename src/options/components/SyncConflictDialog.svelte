<script lang="ts">
  import type { ConflictEntry } from '@shared/sync/sync-types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    conflicts: ConflictEntry[];
    onresolve: (resolutions: ConflictEntry[]) => void;
    oncancel: () => void;
  }

  let { conflicts, onresolve, oncancel }: Props = $props();

  let entries = $state<ConflictEntry[]>(conflicts.map((c) => ({ ...c })));

  function setResolution(index: number, resolution: 'local' | 'cloud') {
    entries[index] = { ...entries[index], resolution };
  }

  function setAllLocal() {
    entries = entries.map((e) => ({ ...e, resolution: 'local' }));
  }

  function setAllCloud() {
    entries = entries.map((e) => ({ ...e, resolution: 'cloud' }));
  }

  const allResolved = $derived(entries.every((e) => e.resolution !== null));

  function handleApply() {
    if (allResolved) {
      onresolve(entries);
    }
  }

  function formatTime(ts: number): string {
    if (!ts) return 'unknown';
    return new Date(ts).toLocaleString();
  }
</script>

<div class="backdrop" role="presentation" onclick={oncancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="conflict-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (e.key === 'Escape') oncancel(); }}
  >
    <h2 id="conflict-title">Resolve Sync Conflicts</h2>
    <p class="description">
      These items differ between local and cloud. Choose which version to keep.
    </p>

    <div class="bulk-actions">
      <button class="bulk-btn" onclick={setAllLocal}>
        All Local
      </button>
      <button class="bulk-btn" onclick={setAllCloud}>
        All Cloud
      </button>
    </div>

    <div class="conflict-list">
      {#each entries as entry, i (entry.sessionId + entry.origin)}
        <div class="conflict-row">
          <div class="conflict-info">
            <span class="conflict-session">{entry.sessionName}</span>
            <span class="conflict-origin">{entry.origin}</span>
            <div class="conflict-timestamps">
              <span class="ts-label">Local: {formatTime(entry.localTimestamp)}</span>
              <span class="ts-label">Cloud: {formatTime(entry.cloudTimestamp)}</span>
            </div>
          </div>
          <div class="resolution-toggle">
            <button
              class="res-btn"
              class:active={entry.resolution === 'local'}
              onclick={() => setResolution(i, 'local')}
              aria-pressed={entry.resolution === 'local'}
            >
              Local
            </button>
            <button
              class="res-btn"
              class:active={entry.resolution === 'cloud'}
              onclick={() => setResolution(i, 'cloud')}
              aria-pressed={entry.resolution === 'cloud'}
            >
              Cloud
            </button>
          </div>
        </div>
      {/each}
    </div>

    <div class="dialog-actions">
      <button class="btn cancel" onclick={oncancel}>Cancel</button>
      <button class="btn primary" onclick={handleApply} disabled={!allResolved}>
        <Icon name="check" size={14} />
        Apply
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-2xl);
    padding: var(--space-7);
    width: 540px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    box-shadow: var(--shadow-lg);
  }

  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .description {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    line-height: var(--leading-relaxed);
  }

  .bulk-actions {
    display: flex;
    gap: var(--space-3);
  }

  .bulk-btn {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .bulk-btn:hover {
    background: var(--color-interactive-hover);
  }

  .conflict-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-secondary);
    border-radius: var(--radius-lg);
    overflow: hidden;
    max-height: 400px;
    overflow-y: auto;
  }

  .conflict-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-elevated);
  }

  .conflict-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }

  .conflict-session {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .conflict-origin {
    font-size: var(--text-xs);
    color: var(--color-accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conflict-timestamps {
    display: flex;
    gap: var(--space-4);
  }

  .ts-label {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .resolution-toggle {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    flex-shrink: 0;
  }

  .res-btn {
    padding: var(--space-2) var(--space-4);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .res-btn:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .res-btn.active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .dialog-actions {
    display: flex;
    gap: var(--space-4);
    justify-content: flex-end;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-smooth);
  }

  .btn.cancel {
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
  }

  .btn.cancel:hover {
    background: var(--color-interactive-hover);
  }

  .btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
