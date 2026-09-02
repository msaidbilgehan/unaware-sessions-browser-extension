<script lang="ts">
  import type { SessionProfile, FullExportData } from '@shared/types';
  import { createSession, clearAllSessions, exportFull, importFull } from '@shared/api';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import AuthGate from '@shared/components/AuthGate.svelte';
  import { checkAuth } from '@shared/auth-check';
  import Icon from '@shared/components/Icon.svelte';
  import DragDropZone from './DragDropZone.svelte';
  import ImportDiff from './ImportDiff.svelte';
  import ExportSelector from './ExportSelector.svelte';
  import StorageDashboard from './StorageDashboard.svelte';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let showClearConfirm = $state(false);
  let importError = $state('');
  let importSuccess = $state('');
  let importedProfiles = $state<SessionProfile[] | null>(null);
  let fullExporting = $state(false);
  let fullImportData = $state<FullExportData | null>(null);
  let fullImporting = $state(false);
  let selectedFileName = $state('');

  // Auth gate state
  let authGateData = $state<{ onauth: () => void } | null>(null);

  async function withAuth(action: () => void | Promise<void>) {
    const result = await checkAuth();
    if (result !== 'auth-required') {
      await action();
    } else {
      authGateData = {
        onauth: () => {
          authGateData = null;
          action();
        },
      };
    }
  }

  async function handleClearAll() {
    await withAuth(async () => {
      showClearConfirm = false;
      try {
        // One message: looping DELETE_SESSION cost a round trip, a profile
        // write, a tombstone read-modify-write and a context menu rebuild per
        // session, and a failure partway left half the sessions deleted.
        await clearAllSessions();
        onupdate();
      } catch (err) {
        console.error('[Unaware Sessions] Failed to clear all sessions:', err);
      }
    });
  }

  async function handleFullExport(sessionIds: string[]) {
    await withAuth(async () => {
      fullExporting = true;
      importError = '';
      try {
        const data = await exportFull(sessionIds);
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const suffix = sessionIds.length === sessions.length ? 'full' : 'partial';
        a.download = `unaware-sessions-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        importError = `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      } finally {
        fullExporting = false;
      }
    });
  }

  function isFullExport(data: unknown): data is FullExportData {
    return (
      typeof data === 'object' &&
      data !== null &&
      'version' in data &&
      (data as FullExportData).version === 1 &&
      'sessions' in data &&
      'cookieSnapshots' in data &&
      'storageSnapshots' in data
    );
  }

  async function processFile(file: File) {
    importError = '';
    importSuccess = '';
    importedProfiles = null;
    fullImportData = null;
    selectedFileName = file.name;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Detect full export format
      if (isFullExport(parsed)) {
        fullImportData = parsed;
        return;
      }

      // Legacy format: plain array of session profiles
      if (!Array.isArray(parsed)) {
        importError = 'Invalid file: expected a session export file';
        return;
      }

      const profiles = (parsed as SessionProfile[]).filter((p) => p.name && p.color);
      if (profiles.length === 0) {
        importError = 'No valid sessions found in file';
        return;
      }
      importedProfiles = profiles;
    } catch (err) {
      importError = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  }

  function handleFiles(files: FileList) {
    const file = files[0];
    if (file) processFile(file);
  }

  async function handleConfirmImport(selected: SessionProfile[]) {
    importError = '';
    let created = 0;
    try {
      for (const profile of selected) {
        await createSession(profile.name, profile.color, profile.emoji);
        created++;
      }
      importSuccess = `Imported ${created} ${created === 1 ? 'session' : 'sessions'}`;
      importedProfiles = null;
      selectedFileName = '';
    } catch (err) {
      // Sessions are created one at a time, so a mid-run failure leaves some
      // already imported. Saying only "failed" would send the user back for a
      // second pass and duplicate everything that did land.
      const reason = err instanceof Error ? err.message : 'Unknown error';
      importError =
        created > 0
          ? `Imported ${created} of ${selected.length} before failing: ${reason}`
          : `Import failed: ${reason}`;
    } finally {
      onupdate();
    }
  }

  async function handleConfirmFullImport() {
    if (!fullImportData) return;
    await withAuth(async () => {
      if (!fullImportData) return;
      fullImporting = true;
      importError = '';
      try {
        const result = await importFull(fullImportData);
        importSuccess = `Imported ${result.imported} ${
          result.imported === 1 ? 'session' : 'sessions'
        } with their cookies and storage`;
        fullImportData = null;
        selectedFileName = '';
        onupdate();
      } catch (err) {
        importError = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      } finally {
        fullImporting = false;
      }
    });
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  const fullExportStats = $derived.by(() => {
    if (!fullImportData) return null;
    const totalCookies = fullImportData.cookieSnapshots.reduce(
      (sum, s) => sum + s.cookies.length,
      0,
    );
    const totalStorageEntries = fullImportData.storageSnapshots.reduce(
      (sum, s) => sum + Object.keys(s.localStorage).length + Object.keys(s.sessionStorage).length,
      0,
    );
    const origins = new Set([
      ...fullImportData.cookieSnapshots.map((s) => s.origin),
      ...fullImportData.storageSnapshots.map((s) => s.origin),
    ]);
    return {
      sessions: fullImportData.sessions.length,
      cookies: totalCookies,
      storageEntries: totalStorageEntries,
      origins: origins.size,
      exportedAt: fullImportData.exportedAt,
    };
  });
</script>

<div class="data-layout">
  <!-- Export Section -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon export">
        <Icon name="download" size={16} />
      </div>
      <div>
        <h2>Export</h2>
        <p class="description">
          Save the selected sessions to a JSON file, including their cookies and storage — enough to
          restore your signed-in state on another browser.
        </p>
      </div>
    </div>

    {#if sessions.length === 0}
      <p class="empty-hint">No sessions to export yet.</p>
    {:else}
      <ExportSelector {sessions} exporting={fullExporting} onexport={handleFullExport} />
    {/if}

    <div class="export-hint">
      <p>
        <Icon name="alert-triangle" size={12} />
        The file contains live login cookies in plain text. Anyone who opens it can sign in as you — store
        it somewhere you would keep a password.
      </p>
    </div>
  </section>

  <!-- Import Section -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon import">
        <Icon name="upload" size={16} />
      </div>
      <div>
        <h2>Import</h2>
        <p class="description">
          Restore from a file exported here or on another device. Sessions whose name already exists
          are skipped, so importing twice will not duplicate them.
        </p>
      </div>
    </div>

    <DragDropZone onfiles={handleFiles} selectedName={selectedFileName} />

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

    {#if fullImportData}
      {@const stats = fullExportStats}
      <div class="full-import-preview">
        <h3>Ready to import</h3>
        {#if stats}
          <div class="stats-grid">
            <div class="stat">
              <span class="stat-value">{stats.sessions}</span>
              <span class="stat-label">Sessions</span>
            </div>
            <div class="stat">
              <span class="stat-value">{stats.cookies}</span>
              <span class="stat-label">Cookies</span>
            </div>
            <div class="stat">
              <span class="stat-value">{stats.storageEntries}</span>
              <span class="stat-label">Storage entries</span>
            </div>
            <div class="stat">
              <span class="stat-value">{stats.origins}</span>
              <span class="stat-label">Origins</span>
            </div>
          </div>
          <p class="export-date">
            Exported: {formatDate(stats.exportedAt)}
          </p>
        {/if}

        <div class="session-list-preview">
          {#each fullImportData.sessions as profile}
            {@const exists = sessions.some((s) => s.name === profile.name)}
            <div class="preview-row" class:dimmed={exists}>
              <span class="dot" style="background-color: {profile.color}"></span>
              <span class="preview-name">
                {profile.emoji ?? ''}
                {profile.name}
              </span>
              {#if exists}
                <span class="preview-badge skip">exists</span>
              {:else}
                <span class="preview-badge new">new</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="preview-actions">
          <button class="btn cancel-btn" onclick={() => (fullImportData = null)}> Cancel </button>
          <button class="btn primary" onclick={handleConfirmFullImport} disabled={fullImporting}>
            {#if fullImporting}
              <span class="spinner"></span>
              Importing...
            {:else}
              <Icon name="database" size={14} />
              Import All
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </section>

  <StorageDashboard {sessions} />

  <!-- Data Management card -->
  <section class="card danger-zone">
    <div class="card-header">
      <div class="card-icon danger">
        <Icon name="alert-triangle" size={16} />
      </div>
      <div>
        <h2>Delete everything</h2>
        <p class="description">
          Remove every session along with its saved cookies and storage. Export first if you might
          want any of it back.
        </p>
      </div>
    </div>

    <button
      class="btn danger"
      onclick={() => (showClearConfirm = true)}
      disabled={sessions.length === 0}
    >
      <Icon name="trash-2" size={14} />
      Delete all sessions
      {#if sessions.length > 0}
        <span class="count">({sessions.length} session{sessions.length === 1 ? '' : 's'})</span>
      {/if}
    </button>
  </section>
</div>

{#if showClearConfirm}
  <ConfirmDialog
    title="Delete all sessions"
    message={`Permanently delete all ${sessions.length} ${
      sessions.length === 1 ? 'session' : 'sessions'
    }?`}
    detail="Every saved cookie and storage snapshot goes with them. There is no undo for this one."
    confirmLabel="Delete everything"
    danger={true}
    onconfirm={handleClearAll}
    oncancel={() => (showClearConfirm = false)}
  />
{/if}

{#if authGateData}
  <AuthGate onauth={authGateData.onauth} oncancel={() => (authGateData = null)} />
{/if}

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

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .export-hint {
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .export-hint p {
    margin: 0;
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .export-hint :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-warning);
  }

  /* Full import preview */
  .full-import-preview {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .full-import-preview h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .stat-value {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: var(--color-text-primary);
  }

  .stat-label {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .export-date {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .session-list-preview {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
    max-height: 200px;
    overflow-y: auto;
  }

  .preview-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-elevated);
    font-size: var(--text-sm);
  }

  .preview-row.dimmed {
    opacity: 0.5;
  }

  .preview-name {
    flex: 1;
    color: var(--color-text-primary);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .preview-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
  }

  .preview-badge.new {
    color: var(--color-success);
    background: var(--color-success-soft);
  }

  .preview-badge.skip {
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
  }

  .preview-actions {
    display: flex;
    gap: var(--space-4);
    justify-content: flex-end;
  }

  .cancel-btn {
    background: var(--color-bg-tertiary);
    border-color: var(--color-border-primary);
    color: var(--color-text-secondary);
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

  /* Data Management */
  .card.danger-zone {
    border-color: var(--color-error-border);
  }

  .card-icon.danger {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .btn.danger {
    color: var(--color-error);
    border-color: var(--color-error-border);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--color-error-soft);
  }

  .count {
    font-weight: var(--font-normal);
    opacity: 0.7;
  }
</style>
