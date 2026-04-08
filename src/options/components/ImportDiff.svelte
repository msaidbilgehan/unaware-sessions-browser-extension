<script lang="ts">
  import type { SessionProfile } from '@shared/types';

  interface DiffEntry {
    imported: SessionProfile;
    status: 'new' | 'update' | 'unchanged';
    selected: boolean;
  }

  interface Props {
    existing: SessionProfile[];
    imported: SessionProfile[];
    onconfirm: (selected: SessionProfile[]) => void;
    oncancel: () => void;
  }

  let { existing, imported, onconfirm, oncancel }: Props = $props();

  let entries = $state<DiffEntry[]>(
    imported.map((imp) => {
      const match = existing.find((e) => e.id === imp.id || e.name === imp.name);
      let status: DiffEntry['status'] = 'new';
      if (match) {
        const changed =
          match.name !== imp.name || match.color !== imp.color || match.emoji !== imp.emoji;
        status = changed ? 'update' : 'unchanged';
      }
      return { imported: imp, status, selected: status !== 'unchanged' };
    }),
  );

  const selectedCount = $derived(entries.filter((e) => e.selected).length);

  function toggleAll() {
    const allSelected = entries.every((e) => e.selected);
    entries = entries.map((e) => ({ ...e, selected: !allSelected }));
  }

  function _toggleEntry(index: number) {
    entries[index].selected = !entries[index].selected;
  }

  function handleConfirm() {
    onconfirm(entries.filter((e) => e.selected).map((e) => e.imported));
  }
</script>

<div class="import-diff">
  <h3>Import Preview</h3>
  <p class="summary">{imported.length} session(s) found, {selectedCount} selected for import</p>

  <div class="diff-table">
    <div class="diff-header">
      <label class="checkbox-cell">
        <input type="checkbox" checked={entries.every((e) => e.selected)} onchange={toggleAll} />
      </label>
      <span>Name</span>
      <span>Status</span>
    </div>
    {#each entries as entry, _i}
      <div class="diff-row" class:dimmed={!entry.selected}>
        <label class="checkbox-cell">
          <input type="checkbox" bind:checked={entry.selected} />
        </label>
        <span class="diff-name">
          <span class="dot" style="background-color: {entry.imported.color}"></span>
          {entry.imported.name}
        </span>
        <span class="status-badge {entry.status}">{entry.status}</span>
      </div>
    {/each}
  </div>

  <div class="actions">
    <button class="btn cancel" onclick={oncancel}>Cancel</button>
    <button class="btn confirm" onclick={handleConfirm} disabled={selectedCount === 0}>
      Import {selectedCount} session(s)
    </button>
  </div>
</div>

<style>
  .import-diff {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }

  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .summary {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-5);
  }

  .diff-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--space-5);
  }

  .diff-header,
  .diff-row {
    display: grid;
    grid-template-columns: 32px 1fr 80px;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    gap: var(--space-3);
  }

  .diff-header {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
  }

  .diff-row.dimmed {
    opacity: 0.5;
  }

  .checkbox-cell {
    display: flex;
    align-items: center;
  }

  .diff-name {
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

  .status-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    text-align: center;
  }

  .status-badge.new {
    color: var(--color-success);
    background: var(--color-success-soft);
  }

  .status-badge.update {
    color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .status-badge.unchanged {
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
  }

  .actions {
    display: flex;
    gap: var(--space-4);
    justify-content: flex-end;
  }

  .btn {
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn.cancel {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-secondary);
  }

  .btn.confirm {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--color-text-inverse);
  }

  .btn.confirm:hover {
    background: var(--color-accent-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
