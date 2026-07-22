<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    sessions: SessionProfile[];
    exporting: boolean;
    onexport: (sessionIds: string[]) => void;
  }

  const { sessions, exporting, onexport }: Props = $props();

  // Selection is tracked as "deselected ids" rather than "entries with a
  // selected flag" so newly-created sessions default to selected without
  // needing an $effect to reconcile against the sessions prop.
  let deselected = new SvelteSet<string>();

  const selectedCount = $derived(sessions.length - deselected.size);
  const allSelected = $derived(sessions.length > 0 && deselected.size === 0);

  function toggleAll() {
    if (allSelected) {
      for (const s of sessions) deselected.add(s.id);
    } else {
      deselected.clear();
    }
  }

  function toggleOne(id: string) {
    if (deselected.has(id)) deselected.delete(id);
    else deselected.add(id);
  }

  function handleExport() {
    onexport(sessions.filter((s) => !deselected.has(s.id)).map((s) => s.id));
  }
</script>

<div class="export-selector">
  <div class="selector-table">
    <div class="selector-header">
      <label class="checkbox-cell">
        <input type="checkbox" checked={allSelected} onchange={toggleAll} />
      </label>
      <span>Session</span>
    </div>
    {#each sessions as session (session.id)}
      <div class="selector-row" class:dimmed={deselected.has(session.id)}>
        <label class="checkbox-cell">
          <input
            type="checkbox"
            checked={!deselected.has(session.id)}
            onchange={() => toggleOne(session.id)}
          />
        </label>
        <span class="session-name">
          <span class="dot" style="background-color: {session.color}"></span>
          {session.emoji ?? ''} {session.name}
        </span>
      </div>
    {/each}
  </div>

  <button class="btn primary" onclick={handleExport} disabled={selectedCount === 0 || exporting}>
    {#if exporting}
      <span class="spinner"></span>
      Exporting...
    {:else}
      <Icon name="database" size={14} />
      Export {selectedCount} Session{selectedCount === 1 ? '' : 's'}
    {/if}
  </button>
</div>

<style>
  .export-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .selector-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    max-height: 240px;
    overflow-y: auto;
  }

  .selector-header,
  .selector-row {
    display: grid;
    grid-template-columns: 32px 1fr;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    gap: var(--space-3);
  }

  .selector-header {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .selector-row.dimmed {
    opacity: 0.6;
    background: var(--color-bg-sunken);
  }

  .checkbox-cell {
    display: flex;
    align-items: center;
  }

  .session-name {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    cursor: pointer;
    color: var(--color-text-primary);
    transition: all var(--transition-smooth);
    width: fit-content;
  }

  .btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    box-shadow: var(--shadow-sm);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-primary);
    border-top-color: var(--color-text-inverse);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
