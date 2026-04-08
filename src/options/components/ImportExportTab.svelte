<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { createSession } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';
  import DragDropZone from './DragDropZone.svelte';
  import ImportDiff from './ImportDiff.svelte';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let importError = $state('');
  let importSuccess = $state('');
  let importedProfiles = $state<SessionProfile[] | null>(null);

  function handleExport() {
    const data = JSON.stringify(sessions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unaware-sessions-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function processFile(file: File) {
    importError = '';
    importSuccess = '';
    importedProfiles = null;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SessionProfile[];

      if (!Array.isArray(parsed)) {
        importError = 'Invalid file: expected an array of session profiles';
        return;
      }

      importedProfiles = parsed.filter((p) => p.name && p.color);
      if (importedProfiles.length === 0) {
        importError = 'No valid sessions found in file';
        importedProfiles = null;
      }
    } catch (err) {
      importError = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  }

  function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) processFile(file);
    };
    input.click();
  }

  function handleFileDrop(files: FileList) {
    const file = files[0];
    if (file) processFile(file);
  }

  async function handleConfirmImport(selected: SessionProfile[]) {
    importError = '';
    try {
      let created = 0;
      for (const profile of selected) {
        await createSession(profile.name, profile.color, profile.emoji);
        created++;
      }
      importSuccess = `Imported ${created} session(s)`;
      importedProfiles = null;
      onupdate();
    } catch (err) {
      importError = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  }
</script>

<div class="data-layout">
  <!-- Export Section -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon export">
        <Icon name="download" size={16} />
      </div>
      <div>
        <h2>Export Sessions</h2>
        <p class="description">
          Download all session profiles as a JSON file. Cookie and storage data is not included.
        </p>
      </div>
    </div>

    <button class="btn primary" onclick={handleExport} disabled={sessions.length === 0}>
      <Icon name="download" size={14} />
      Export {sessions.length} Session{sessions.length === 1 ? '' : 's'}
    </button>
  </section>

  <!-- Import Section -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon import">
        <Icon name="upload" size={16} />
      </div>
      <div>
        <h2>Import Sessions</h2>
        <p class="description">
          Import session profiles from a previously exported JSON file.
        </p>
      </div>
    </div>

    <DragDropZone onfiles={handleFileDrop} />

    <button class="btn" onclick={handleImportClick}>
      <Icon name="upload" size={14} />
      Choose File
    </button>

    {#if importError}
      <div class="message error">
        <Icon name="alert-triangle" size={13} />
        <p>{importError}</p>
      </div>
    {/if}
    {#if importSuccess}
      <div class="message success">
        <Icon name="check" size={13} />
        <p>{importSuccess}</p>
      </div>
    {/if}

    {#if importedProfiles}
      <ImportDiff
        existing={sessions}
        imported={importedProfiles}
        onconfirm={handleConfirmImport}
        oncancel={() => (importedProfiles = null)}
      />
    {/if}
  </section>
</div>

<style>
  .data-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

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
    flex-shrink: 0;
  }

  .card-icon.export {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .card-icon.import {
    background: var(--color-success-soft);
    color: var(--color-success);
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

  .btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
    box-shadow: var(--shadow-xs);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  .message {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
  }

  .message p {
    margin: 0;
  }

  .message.error {
    color: var(--color-error);
    background: var(--color-error-soft);
  }

  .message.success {
    color: var(--color-success);
    background: var(--color-success-soft);
  }
</style>
