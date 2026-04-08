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

<section>
  <h2>Import / Export</h2>

  <DragDropZone onfiles={handleFileDrop} />

  <div class="actions-row">
    <button class="btn" onclick={handleExport} disabled={sessions.length === 0}>
      <Icon name="download" size={14} />
      Export Sessions (JSON)
    </button>
    <button class="btn" onclick={handleImportClick}>
      <Icon name="upload" size={14} />
      Import Sessions (JSON)
    </button>
  </div>

  {#if importError}
    <p class="error">{importError}</p>
  {/if}
  {#if importSuccess}
    <p class="success">{importSuccess}</p>
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

<style>
  section {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
  }

  .actions-row {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-family: var(--font-sans);
    cursor: pointer;
    color: var(--color-text-primary);
    transition: all var(--transition-fast);
  }

  .btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    color: var(--color-error);
    font-size: var(--text-sm);
    margin: 0;
  }

  .success {
    color: var(--color-success);
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
