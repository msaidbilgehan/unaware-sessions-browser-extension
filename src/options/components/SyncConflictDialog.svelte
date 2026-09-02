<script lang="ts">
  import { untrack } from 'svelte';
  import type { ConflictEntry } from '@shared/sync/sync-types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    conflicts: ConflictEntry[];
    onresolve: (resolutions: ConflictEntry[]) => void;
    oncancel: () => void;
  }

  let { conflicts, onresolve, oncancel }: Props = $props();

  // Snapshot on open: the dialog is remounted per conflict set, and a remote
  // change arriving mid-review must not silently rewrite the choices on screen.
  let entries = $state<ConflictEntry[]>(untrack(() => conflicts.map((c) => ({ ...c }))));

  function setResolution(index: number, resolution: 'local' | 'cloud') {
    entries[index] = { ...entries[index], resolution };
  }

  function setAllLocal() {
    entries = entries.map((e) => ({ ...e, resolution: 'local' }));
  }

  function setAllCloud() {
    entries = entries.map((e) => ({ ...e, resolution: 'cloud' }));
  }

  const resolvedCount = $derived(entries.filter((e) => e.resolution !== null).length);
  const allResolved = $derived(resolvedCount === entries.length);

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);

  $effect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef?.focus();
    return () => opener?.focus?.();
  });

  function handleApply() {
    if (allResolved) {
      onresolve(entries);
    }
  }

  function formatTime(ts: number): string {
    if (!ts) return 'unknown';
    return new Date(ts).toLocaleString();
  }

  /** Which side changed more recently — the single most useful cue for choosing. */
  function newerSide(entry: ConflictEntry): 'local' | 'cloud' | null {
    if (!entry.localTimestamp || !entry.cloudTimestamp) return null;
    if (entry.localTimestamp === entry.cloudTimestamp) return null;
    return entry.localTimestamp > entry.cloudTimestamp ? 'local' : 'cloud';
  }
</script>

<div class="backdrop" role="presentation" onclick={oncancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="conflict-title"
    bind:this={dialogRef}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') oncancel();
    }}
  >
    <h2 id="conflict-title">Resolve sync conflicts</h2>
    <p class="description">
      These sites changed both on this device and in the cloud since the last sync. Pick the copy to
      keep for each — the other is discarded. Auto-sync stays paused until all are resolved.
    </p>

    <div class="bulk-actions">
      <button class="bulk-btn" onclick={setAllLocal}>Keep all local</button>
      <button class="bulk-btn" onclick={setAllCloud}>Keep all cloud</button>
      <span class="progress" aria-live="polite">{resolvedCount} of {entries.length} chosen</span>
    </div>

    <div class="conflict-list">
      {#each entries as entry, i (entry.sessionId + entry.origin)}
        {@const newer = newerSide(entry)}
        <div class="conflict-row">
          <div class="conflict-info">
            <span class="conflict-session">{entry.sessionName}</span>
            <span class="conflict-origin">{entry.origin}</span>
            <div class="conflict-timestamps">
              <span class="ts-label" class:newer={newer === 'local'}>
                Local: {formatTime(entry.localTimestamp)}
                {#if newer === 'local'}<span class="newer-tag">newer</span>{/if}
              </span>
              <span class="ts-label" class:newer={newer === 'cloud'}>
                Cloud: {formatTime(entry.cloudTimestamp)}
                {#if newer === 'cloud'}<span class="newer-tag">newer</span>{/if}
              </span>
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
      <button
        class="btn primary"
        onclick={handleApply}
        disabled={!allResolved}
        title={allResolved
          ? 'Apply these choices and resume syncing'
          : `Choose a copy for all ${entries.length} sites first`}
      >
        <Icon name="check" size={14} />
        Apply and resume sync
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(2px);
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

  .progress {
    margin-left: auto;
    align-self: center;
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .ts-label.newer {
    color: var(--color-text-secondary);
    font-weight: var(--font-medium);
  }

  .newer-tag {
    margin-left: var(--space-2);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--color-accent);
    background: var(--color-accent-soft);
    border-radius: var(--radius-full);
    padding: 0 var(--space-2);
  }

  .dialog:focus {
    outline: none;
  }
</style>
