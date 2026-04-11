<script lang="ts">
  import type {
    SessionProfile,
    CookieDiffResult,
    RestoreFailureEntry,
    LogEntry,
  } from '@shared/types';
  import type { LogLevel } from '@shared/types';
  import {
    getCookieDiff,
    getRestoreFailures,
    getExtensionLogs,
    clearExtensionLogs,
  } from '@shared/api';
  import {
    getLogLevel,
    setLogLevel,
    onSettingsChange,
  } from '@shared/settings-store';
  import Icon from '@shared/components/Icon.svelte';
  import Toast from '@shared/components/Toast.svelte';

  interface Props {
    sessions: SessionProfile[];
  }

  let { sessions }: Props = $props();

  // Cookie Diff state
  let originInput = $state('https://www.google.com');
  let selectedSessionId = $state('');
  let diffResult = $state<CookieDiffResult | null>(null);
  let diffLoading = $state(false);
  let filterStatus = $state<string>('all');

  // Restore failures state
  let failures = $state<RestoreFailureEntry[]>([]);
  let failuresLoading = $state(false);

  // Toast
  let toasts: Array<{ id: string; message: string; type: 'error' | 'success' | 'info' }> = $state(
    [],
  );

  function showToast(message: string, type: 'error' | 'success' | 'info' = 'info') {
    const id = crypto.randomUUID();
    toasts.push({ id, message, type });
  }

  function dismissToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  // Auto-select first session
  $effect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      selectedSessionId = sessions[0].id;
    }
  });

  async function runDiff() {
    if (!originInput.trim() || !selectedSessionId) return;

    diffLoading = true;
    diffResult = null;
    try {
      diffResult = await getCookieDiff(selectedSessionId, originInput.trim());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to run diff', 'error');
    } finally {
      diffLoading = false;
    }
  }

  async function loadFailures() {
    failuresLoading = true;
    try {
      failures = await getRestoreFailures();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load failures', 'error');
    } finally {
      failuresLoading = false;
    }
  }

  // Load failures on mount
  $effect(() => {
    loadFailures();
  });

  const filteredEntries = $derived(
    diffResult
      ? filterStatus === 'all'
        ? diffResult.entries
        : diffResult.entries.filter((e) => e.status === filterStatus)
      : [],
  );

  const statusLabels: Record<string, string> = {
    match: 'Match',
    value_changed: 'Value Changed',
    flags_changed: 'Flags Changed',
    missing_in_browser: 'Missing in Browser',
    extra_in_browser: 'Extra in Browser',
    expired: 'Expired',
  };

  const statusColors: Record<string, string> = {
    match: 'status-match',
    value_changed: 'status-warning',
    flags_changed: 'status-info',
    missing_in_browser: 'status-error',
    extra_in_browser: 'status-info',
    expired: 'status-error',
  };

  function truncate(value: string | undefined, max: number = 40): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  function getSessionName(id: string): string {
    const session = sessions.find((s) => s.id === id);
    return session?.name ?? id.slice(0, 8);
  }

  // ── Log Level Setting ─────────────────────────────────────────
  let logLevel = $state<LogLevel>(getLogLevel());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      logLevel = settings.logLevel;
    });
    return unsub;
  });

  const logLevelOptions: { value: LogLevel; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warning' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' },
  ];

  async function handleLogLevelChange(level: LogLevel) {
    await setLogLevel(level);
  }

  // ── Extension Logs ────────────────────────────────────────────
  let logs = $state<LogEntry[]>([]);
  let logsLoading = $state(false);
  let logFilterLevel = $state<string>('all');

  async function loadLogs() {
    logsLoading = true;
    try {
      logs = await getExtensionLogs();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load logs', 'error');
    } finally {
      logsLoading = false;
    }
  }

  async function handleClearLogs() {
    try {
      await clearExtensionLogs();
      logs = [];
      showToast('Logs cleared', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear logs', 'error');
    }
  }

  function exportLogs() {
    if (logs.length === 0) {
      showToast('No logs to export', 'info');
      return;
    }
    const exportData = {
      exportedAt: new Date().toISOString(),
      entryCount: logs.length,
      entries: logs,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unaware-sessions-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLogs = $derived(
    logFilterLevel === 'all' ? logs : logs.filter((e) => e.level === logFilterLevel),
  );

  const logLevelColors: Record<string, string> = {
    error: 'log-error',
    warn: 'log-warn',
    info: 'log-info',
    debug: 'log-debug',
  };

  // Load logs on mount
  $effect(() => {
    loadLogs();
  });
</script>

<div class="debug-layout">
  <!-- Cookie Diff Tool -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="search" size={16} />
      </div>
      <div>
        <h2>Cookie Diff Tool</h2>
        <p class="description">
          Compare saved session cookies against live browser cookies for a given origin.
        </p>
      </div>
    </div>

    <div class="diff-controls">
      <div class="control-row">
        <label class="control-label" for="origin-input">Origin URL</label>
        <input
          id="origin-input"
          type="text"
          class="text-input"
          placeholder="https://www.google.com"
          bind:value={originInput}
          onkeydown={(e) => e.key === 'Enter' && runDiff()}
        />
      </div>

      <div class="control-row">
        <label class="control-label" for="session-select">Session</label>
        <select id="session-select" class="select-input" bind:value={selectedSessionId}>
          {#each sessions as session}
            <option value={session.id}>
              {session.emoji ?? ''}
              {session.name}
            </option>
          {/each}
        </select>
      </div>

      <button
        class="btn btn-primary"
        onclick={runDiff}
        disabled={diffLoading || !originInput.trim() || !selectedSessionId}
      >
        {#if diffLoading}
          <span class="spinner"></span>
          Running...
        {:else}
          <Icon name="search" size={14} />
          Run Diff
        {/if}
      </button>
    </div>

    {#if diffResult}
      <!-- Summary bar -->
      <div class="summary-bar">
        <div class="summary-meta">
          <span class="meta-item">
            Snapshot: <strong>{diffResult.totalSnapshot}</strong> cookies
          </span>
          <span class="meta-item">
            Live: <strong>{diffResult.totalLive}</strong> cookies
          </span>
          {#if diffResult.snapshotTimestamp}
            <span class="meta-item">
              Saved: <strong>{formatTimestamp(diffResult.snapshotTimestamp)}</strong>
            </span>
          {:else}
            <span class="meta-item meta-warning">No snapshot found</span>
          {/if}
        </div>

        <div class="summary-chips">
          {#if diffResult.summary.missingInBrowser > 0}
            <span class="chip chip-error">
              {diffResult.summary.missingInBrowser} missing
            </span>
          {/if}
          {#if diffResult.summary.expired > 0}
            <span class="chip chip-error">
              {diffResult.summary.expired} expired
            </span>
          {/if}
          {#if diffResult.summary.valueChanged > 0}
            <span class="chip chip-warning">
              {diffResult.summary.valueChanged} changed
            </span>
          {/if}
          {#if diffResult.summary.flagsChanged > 0}
            <span class="chip chip-info">
              {diffResult.summary.flagsChanged} flags
            </span>
          {/if}
          {#if diffResult.summary.extraInBrowser > 0}
            <span class="chip chip-info">
              {diffResult.summary.extraInBrowser} extra
            </span>
          {/if}
          {#if diffResult.summary.matched > 0}
            <span class="chip chip-success">
              {diffResult.summary.matched} matched
            </span>
          {/if}
        </div>
      </div>

      <!-- Filter -->
      <div class="filter-row">
        <label class="control-label" for="filter-select">Filter</label>
        <select id="filter-select" class="select-input select-sm" bind:value={filterStatus}>
          <option value="all">All ({diffResult.entries.length})</option>
          {#each Object.entries(diffResult.summary) as [key, count]}
            {#if count > 0}
              <option
                value={key === 'matched'
                  ? 'match'
                  : key === 'valueChanged'
                    ? 'value_changed'
                    : key === 'flagsChanged'
                      ? 'flags_changed'
                      : key === 'missingInBrowser'
                        ? 'missing_in_browser'
                        : key === 'extraInBrowser'
                          ? 'extra_in_browser'
                          : key}
              >
                {statusLabels[
                  key === 'matched'
                    ? 'match'
                    : key === 'valueChanged'
                      ? 'value_changed'
                      : key === 'flagsChanged'
                        ? 'flags_changed'
                        : key === 'missingInBrowser'
                          ? 'missing_in_browser'
                          : key === 'extraInBrowser'
                            ? 'extra_in_browser'
                            : key
                ] ?? key} ({count})
              </option>
            {/if}
          {/each}
        </select>
      </div>

      <!-- Diff table -->
      <div class="table-wrapper">
        <table class="diff-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Domain</th>
              <th>Snapshot Value</th>
              <th>Live Value</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredEntries as entry}
              <tr class={statusColors[entry.status] ?? ''}>
                <td>
                  <span class="status-badge {statusColors[entry.status] ?? ''}">
                    {statusLabels[entry.status] ?? entry.status}
                  </span>
                </td>
                <td class="cell-name" title={entry.name}>{entry.name}</td>
                <td class="cell-domain" title={entry.domain}>{entry.domain}</td>
                <td class="cell-value" title={entry.snapshotValue ?? ''}>
                  {truncate(entry.snapshotValue)}
                </td>
                <td class="cell-value" title={entry.liveValue ?? ''}>
                  {truncate(entry.liveValue)}
                </td>
                <td class="cell-details">
                  {#if entry.flagDiffs}
                    {#each entry.flagDiffs as diff}
                      <span class="flag-diff">{diff}</span>
                    {/each}
                  {/if}
                  {#if entry.status === 'expired'}
                    <span class="flag-diff">Cookie has expired in snapshot</span>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if filteredEntries.length === 0}
              <tr>
                <td colspan="6" class="empty-row">
                  {diffResult.entries.length === 0
                    ? 'No cookies found in snapshot or browser for this origin.'
                    : 'No cookies match the selected filter.'}
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- Extension Logs -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="file-text" size={16} />
      </div>
      <div>
        <h2>Extension Logs</h2>
        <p class="description">
          Internal extension events recorded by the logger. Logs are kept in memory and cleared on extension restart.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost btn-sm" onclick={loadLogs} disabled={logsLoading}>
          <Icon name="refresh-cw" size={14} />
          Refresh
        </button>
        <button class="btn btn-ghost btn-sm" onclick={exportLogs} disabled={logs.length === 0}>
          <Icon name="download" size={14} />
          Export
        </button>
        <button
          class="btn btn-ghost btn-sm btn-danger-ghost"
          onclick={handleClearLogs}
          disabled={logs.length === 0}
        >
          <Icon name="trash-2" size={14} />
          Clear
        </button>
      </div>
    </div>

    <div class="log-level-row">
      <span class="log-level-label">Log level</span>
      <div class="log-level-options">
        {#each logLevelOptions as opt (opt.value)}
          <button
            class="log-level-pill"
            class:active={logLevel === opt.value}
            onclick={() => handleLogLevelChange(opt.value)}
            aria-pressed={logLevel === opt.value}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    {#if logsLoading}
      <div class="loading-inline">
        <span class="spinner"></span>
        Loading...
      </div>
    {:else if logs.length === 0}
      <div class="empty-state">
        <Icon name="file-text" size={20} />
        <p>No logs recorded. Select a log level above to start capturing events.</p>
      </div>
    {:else}
      <!-- Filter -->
      <div class="filter-row">
        <label class="control-label" for="log-filter-select">Filter</label>
        <select id="log-filter-select" class="select-input select-sm" bind:value={logFilterLevel}>
          <option value="all">All ({logs.length})</option>
          {#each ['error', 'warn', 'info', 'debug'] as level}
            {@const count = logs.filter((e) => e.level === level).length}
            {#if count > 0}
              <option value={level}
                >{level.charAt(0).toUpperCase() + level.slice(1)} ({count})</option
              >
            {/if}
          {/each}
        </select>
        <span class="log-count">{filteredLogs.length} entries</span>
      </div>

      <div class="table-wrapper log-table-wrapper">
        <table class="diff-table log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Source</th>
              <th>Message</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {#each [...filteredLogs].reverse() as entry}
              <tr class={logLevelColors[entry.level] ?? ''}>
                <td class="cell-time">{formatTimestamp(entry.timestamp)}</td>
                <td>
                  <span class="log-level-badge {logLevelColors[entry.level] ?? ''}">
                    {entry.level.toUpperCase()}
                  </span>
                </td>
                <td class="cell-source">{entry.source}</td>
                <td class="cell-message" title={entry.message}>{entry.message}</td>
                <td class="cell-data" title={entry.data != null ? JSON.stringify(entry.data) : ''}>
                  {entry.data != null ? truncate(JSON.stringify(entry.data), 60) : ''}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- Restore Failures Log -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon card-icon-error">
        <Icon name="alert-triangle" size={16} />
      </div>
      <div>
        <h2>Restore Failures</h2>
        <p class="description">
          Recent cookie restoration failures logged by the service worker. Cleared on extension
          restart.
        </p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick={loadFailures} disabled={failuresLoading}>
        <Icon name="refresh-cw" size={14} />
        Refresh
      </button>
    </div>

    {#if failuresLoading}
      <div class="loading-inline">
        <span class="spinner"></span>
        Loading...
      </div>
    {:else if failures.length === 0}
      <div class="empty-state">
        <Icon name="check" size={20} />
        <p>No restore failures recorded. Switch sessions to trigger logging.</p>
      </div>
    {:else}
      <div class="table-wrapper">
        <table class="diff-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Session</th>
              <th>Origin</th>
              <th>Cookie</th>
              <th>Domain</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {#each [...failures].reverse() as failure}
              <tr>
                <td class="cell-time">{formatTimestamp(failure.timestamp)}</td>
                <td class="cell-name" title={failure.sessionId}>
                  {getSessionName(failure.sessionId)}
                </td>
                <td class="cell-domain" title={failure.origin}>
                  {truncate(failure.origin, 30)}
                </td>
                <td class="cell-name" title={failure.cookieName}>{failure.cookieName}</td>
                <td class="cell-domain" title={failure.cookieDomain}>{failure.cookieDomain}</td>
                <td class="cell-reason" title={failure.reason}>{failure.reason}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

{#each toasts as toast}
  <Toast message={toast.message} type={toast.type} ondismiss={() => dismissToast(toast.id)} />
{/each}

<style>
  .debug-layout {
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
    gap: var(--space-6);
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
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .card-icon-error {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  .card-header div:nth-child(2) {
    flex: 1;
  }

  h2 {
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-1) 0 0;
  }

  /* Controls */
  .diff-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .control-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .control-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .text-input,
  .select-input {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    transition: border-color var(--transition-fast);
  }

  .text-input:focus,
  .select-input:focus {
    outline: none;
    border-color: var(--color-border-focus);
    box-shadow: var(--shadow-focus);
  }

  .select-sm {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-inverse);
    align-self: flex-start;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: var(--color-border-primary);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--color-interactive-hover);
  }

  .btn-sm {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    margin-left: auto;
  }

  /* Summary */
  .summary-bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .meta-item strong {
    color: var(--color-text-primary);
  }

  .meta-warning {
    color: var(--color-warning);
    font-weight: var(--font-medium);
  }

  .summary-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .chip-error {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  .chip-warning {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .chip-info {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .chip-success {
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  /* Table */
  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
  }

  .diff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  .diff-table thead {
    background: var(--color-bg-secondary);
  }

  .diff-table th {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-primary);
    white-space: nowrap;
  }

  .diff-table td {
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border-secondary);
    vertical-align: top;
  }

  .diff-table tbody tr:hover {
    background: var(--color-interactive-hover);
  }

  .cell-name {
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-domain {
    color: var(--color-text-secondary);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-value {
    font-family: monospace;
    color: var(--color-text-secondary);
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
  }

  .cell-time {
    white-space: nowrap;
    color: var(--color-text-tertiary);
  }

  .cell-reason {
    color: var(--color-error);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .status-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-weight: var(--font-medium);
    white-space: nowrap;
  }

  .status-match .status-badge {
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .status-warning .status-badge {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .status-error .status-badge {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  .status-info .status-badge {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  tr.status-error {
    background: color-mix(in srgb, var(--color-error-soft) 30%, transparent);
  }

  tr.status-warning {
    background: color-mix(in srgb, var(--color-warning-soft) 30%, transparent);
  }

  .flag-diff {
    display: inline-block;
    padding: 0 var(--space-2);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-family: monospace;
    color: var(--color-text-secondary);
  }

  .empty-row {
    text-align: center;
    padding: var(--space-7) !important;
    color: var(--color-text-tertiary);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-7);
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
  }

  .loading-inline {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5);
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-primary);
    border-top-color: var(--color-accent);
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Extension Logs ─────────────────────────────────────────── */
  .log-level-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .log-level-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .log-level-options {
    display: flex;
    gap: var(--space-2);
  }

  .log-level-pill {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-full);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .log-level-pill:hover {
    background: var(--color-interactive-hover);
  }

  .log-level-pill.active {
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
    margin-left: auto;
    flex-shrink: 0;
  }

  .btn-danger-ghost {
    color: var(--color-error);
  }

  .btn-danger-ghost:hover:not(:disabled) {
    background: var(--color-error-soft);
  }

  .log-count {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  .log-table-wrapper {
    max-height: 420px;
    overflow-y: auto;
  }

  .log-table .cell-source {
    font-family: monospace;
    font-size: var(--text-xs);
    color: var(--color-accent);
    white-space: nowrap;
  }

  .log-table .cell-message {
    color: var(--color-text-primary);
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-table .cell-data {
    font-family: monospace;
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-level-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    white-space: nowrap;
    text-transform: uppercase;
  }

  .log-error .log-level-badge {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  .log-warn .log-level-badge {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .log-info .log-level-badge {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .log-debug .log-level-badge {
    background: var(--color-bg-tertiary);
    color: var(--color-text-tertiary);
  }

  tr.log-error {
    background: color-mix(in srgb, var(--color-error-soft) 20%, transparent);
  }

  tr.log-warn {
    background: color-mix(in srgb, var(--color-warning-soft) 20%, transparent);
  }
</style>
