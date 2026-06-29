<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    webDavBackupNow,
    webDavConnect,
    webDavDisconnect,
    webDavGetState,
    webDavTestConnection,
    webDavListBackups,
    webDavRestore,
    webDavDeleteFile,
    webDavPruneOldBackups,
  } from '@shared/api';
  import {
    getWebDavConfig,
    initWebDavStore,
    onWebDavConfigChange,
    setWebDavConfig,
  } from '@shared/webdav/webdav-store';
  import { testWebDavConnection } from '@shared/webdav/webdav-client';
  import type {
    WebDavConfig,
    WebDavMaxBackups,
    WebDavState,
    WebDavSyncInterval,
    WebDavFile,
  } from '@shared/webdav/webdav-types';
  import {
    WEBDAV_MAX_BACKUP_OPTIONS,
    WEBDAV_SYNC_INTERVAL_OPTIONS,
  } from '@shared/constants';
  import { formatRelativeTime, generateId } from '@shared/utils';
  import Icon from '@shared/components/Icon.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import Toast from '@shared/components/Toast.svelte';

  // ── WebDAV Backup state ───────────────────────────────────

  let webDavCfg = $state<WebDavConfig>(getWebDavConfig());
  let webDavState = $state<WebDavState>({ status: 'idle', progress: '' });
  let showWebDavDisconnectConfirm = $state(false);
  let webDavConnecting = $state(false);
  let webDavTesting = $state(false);
  let webDavSaving = $state(false);
  let webDavBackingUp = $state(false);
  let webDavHost = $state(webDavCfg.host);
  let webDavUsername = $state(webDavCfg.username);
  let webDavPassword = $state(webDavCfg.password);
  let showWebDavPassword = $state(false);
  let webDavEncryptionPassword = $state(webDavCfg.encryptionPassword || '');
  let showWebDavEncryptionPassword = $state(false);
  let webDavPath = $state(webDavCfg.path);
  let webDavSyncInterval = $state<WebDavSyncInterval>(webDavCfg.syncInterval);
  let webDavMaxBackups = $state<WebDavMaxBackups>(webDavCfg.maxBackups);

  // Backup manager state
  let webDavBackups = $state<WebDavFile[]>([]);
  let webDavBackupsLoading = $state(false);
  let webDavBackupPage = $state(1);
  let showWebDavRestoreConfirm = $state<WebDavFile | null>(null);
  let showWebDavDeleteConfirm = $state<WebDavFile | null>(null);
  let webDavBackupRestoring = $state(false);
  let webDavBackupDeleting = $state(false);
  let syncToast = $state<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  $effect(() => {
    initWebDavStore().then(() => {
      webDavCfg = getWebDavConfig();
      syncWebDavForm(webDavCfg);
    });
    const unsub = onWebDavConfigChange((config) => {
      webDavCfg = config;
      syncWebDavForm(config);
    });
    return unsub;
  });

  function syncWebDavForm(config: WebDavConfig) {
    webDavHost = config.host;
    webDavUsername = config.username;
    webDavPassword = config.password;
    webDavEncryptionPassword = config.encryptionPassword || '';
    webDavPath = config.path;
    webDavSyncInterval = config.syncInterval;
    webDavMaxBackups = config.maxBackups;
  }

  async function refreshWebDavState() {
    try {
      webDavState = await webDavGetState();
    } catch {
      // Ignore — WebDAV may not be initialized yet
    }
  }

  async function refreshWebDavConfigFromStore() {
    await initWebDavStore();
    webDavCfg = getWebDavConfig();
    syncWebDavForm(webDavCfg);
  }

  function getWebDavFormConfig() {
    return {
      host: webDavHost.trim(),
      username: webDavUsername.trim(),
      password: webDavPassword,
      encryptionPassword: webDavEncryptionPassword.trim(),
      path: webDavPath.trim() || '/backup',
      syncInterval: webDavSyncInterval,
      maxBackups: webDavMaxBackups,
    };
  }

  function getSafeWebDavConsoleConfig() {
    return {
      host: webDavHost.trim(),
      username: webDavUsername.trim(),
      password: webDavPassword ? '***' : '',
      encryptionPassword: webDavEncryptionPassword ? '***' : '',
      path: webDavPath.trim() || '/backup',
      syncInterval: webDavSyncInterval,
      maxBackups: webDavMaxBackups,
    };
  }

  function logWebDavError(action: string, err: unknown) {
    console.error(`[WebDAV] ${action} failed`, err, {
      error: err instanceof Error ? err.message : String(err),
      config: getSafeWebDavConsoleConfig(),
    });
  }

  function isUnknownMessageTypeError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes('Unknown message type: WEBDAV_');
  }

  async function saveWebDavConfigLocally(extra: Partial<WebDavConfig> = {}) {
    const existing = getWebDavConfig();
    await setWebDavConfig({
      ...getWebDavFormConfig(),
      deviceId: existing.deviceId || generateId(),
      lastSyncError: '',
      ...extra,
    });
  }

  async function loadWebDavBackups() {
    if (!webDavCfg.enabled || !webDavCfg.host) return;
    webDavBackupsLoading = true;
    try {
      webDavBackups = await webDavListBackups();
      // Sort backups by modified time descending
      webDavBackups.sort((a, b) => b.lastModified - a.lastModified);
    } catch (err) {
      console.error('[WebDAV] Failed to load backups', err);
      syncToast = { message: $_('options.settings.webdavListFailed', { values: { error: err instanceof Error ? err.message : String(err) } }), type: 'error' };
    } finally {
      webDavBackupsLoading = false;
    }
  }

  async function handleWebDavRestore(file: WebDavFile) {
    showWebDavRestoreConfirm = null;
    webDavBackupRestoring = true;
    try {
      await webDavRestore(file.fileName);
      syncToast = { message: $_('options.settings.webdavRestoreSucceeded'), type: 'success' };
    } catch (err) {
      console.error('[WebDAV] Restore failed', err);
      syncToast = { message: $_('options.settings.webdavRestoreFailed', { values: { error: err instanceof Error ? err.message : String(err) } }), type: 'error' };
    } finally {
      webDavBackupRestoring = false;
    }
  }

  async function handleWebDavDeleteBackup(file: WebDavFile) {
    showWebDavDeleteConfirm = null;
    webDavBackupDeleting = true;
    try {
      await webDavDeleteFile(file.fileName);
      syncToast = { message: $_('options.settings.webdavDeleteSucceeded'), type: 'success' };
      await loadWebDavBackups();
      // Adjust page if current page exceeds total pages
      const totalPages = Math.ceil(webDavBackups.length / 5);
      if (webDavBackupPage > totalPages && totalPages > 0) {
        webDavBackupPage = totalPages;
      }
    } catch (err) {
      console.error('[WebDAV] Delete failed', err);
      syncToast = { message: $_('options.settings.webdavDeleteFailed', { values: { error: err instanceof Error ? err.message : String(err) } }), type: 'error' };
    } finally {
      webDavBackupDeleting = false;
    }
  }

  async function handleWebDavSaveAccount() {
    webDavSaving = true;
    try {
      await saveWebDavConfigLocally();
      await refreshWebDavConfigFromStore();
      syncToast = { message: $_('options.settings.webdavSettingsSaved'), type: 'success' };
    } catch (err) {
      logWebDavError('Save account', err);
      syncToast = { message: $_('options.settings.webdavSaveFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      webDavSaving = false;
    }
  }

  async function handleWebDavTestConnection() {
    webDavTesting = true;
    try {
      try {
        await webDavTestConnection(getWebDavFormConfig());
      } catch (err) {
        if (!isUnknownMessageTypeError(err)) throw err;
        console.warn('[WebDAV] Service worker is missing WEBDAV_TEST_CONNECTION, testing from options page fallback');
        await saveWebDavConfigLocally();
        await testWebDavConnection(getWebDavFormConfig());
        await setWebDavConfig({ lastSyncError: '' });
      }
      await refreshWebDavConfigFromStore();
      console.info('[WebDAV] Test connection succeeded', { config: getSafeWebDavConsoleConfig() });
      syncToast = { message: $_('options.settings.webdavTestSucceeded'), type: 'success' };
    } catch (err) {
      await setWebDavConfig({ lastSyncError: err instanceof Error ? err.message : String(err) });
      logWebDavError('Test connection', err);
      syncToast = { message: $_('options.settings.webdavTestFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      webDavTesting = false;
    }
  }

  async function handleWebDavConnect() {
    webDavConnecting = true;
    try {
      try {
        await webDavConnect(getWebDavFormConfig());
      } catch (err) {
        if (!isUnknownMessageTypeError(err)) throw err;
        console.warn('[WebDAV] Service worker is missing WEBDAV_CONNECT, connecting from options page fallback');
        await saveWebDavConfigLocally();
        await testWebDavConnection(getWebDavFormConfig());
        await setWebDavConfig({ enabled: true, lastSyncError: '' });
      }
      await refreshWebDavConfigFromStore();
      syncToast = { message: $_('options.settings.connectedWebdav'), type: 'success' };
    } catch (err) {
      logWebDavError('Connect', err);
      await setWebDavConfig({ lastSyncError: err instanceof Error ? err.message : String(err) });
      await refreshWebDavConfigFromStore();
      syncToast = { message: $_('options.settings.webdavConnectionFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      webDavConnecting = false;
    }
  }

  async function handleWebDavDisconnect() {
    showWebDavDisconnectConfirm = false;
    try {
      try {
        await webDavDisconnect();
      } catch (err) {
        if (!isUnknownMessageTypeError(err)) throw err;
        console.warn('[WebDAV] Service worker is missing WEBDAV_DISCONNECT, disconnecting from options page fallback');
        await setWebDavConfig({
          enabled: false,
          host: '',
          username: '',
          password: '',
          path: '/backup',
          syncInterval: 0,
          maxBackups: 0,
          lastSyncAt: 0,
          lastSyncError: '',
          deviceId: '',
        });
      }
      await refreshWebDavConfigFromStore();
      webDavState = { status: 'idle', progress: '' };
      syncToast = { message: $_('options.settings.disconnectedWebdav'), type: 'info' };
    } catch (err) {
      logWebDavError('Disconnect', err);
      syncToast = { message: $_('options.settings.webdavDisconnectFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    }
  }

  async function handleWebDavBackupNow() {
    webDavBackingUp = true;
    try {
      const state = await webDavBackupNow();
      webDavState = state;
      await refreshWebDavConfigFromStore();
      if (state.status === 'error') {
        syncToast = { message: state.progress, type: 'error' };
      } else {
        syncToast = { message: $_('options.settings.webdavBackupCompleted'), type: 'success' };
        await loadWebDavBackups();
      }
    } catch (err) {
      logWebDavError('Backup', err);
      webDavState = { status: 'error', progress: err instanceof Error ? err.message : String(err) };
      await setWebDavConfig({ lastSyncError: webDavState.progress });
      syncToast = { message: $_('options.settings.webdavBackupFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      webDavBackingUp = false;
    }
  }

  async function handleWebDavIntervalChange(interval: WebDavSyncInterval) {
    webDavSyncInterval = interval;
    await setWebDavConfig({ syncInterval: interval });
    await refreshWebDavConfigFromStore();
  }

  async function handleWebDavMaxBackupsChange(maxBackups: WebDavMaxBackups) {
    webDavMaxBackups = maxBackups;
    await setWebDavConfig({ maxBackups });
    await refreshWebDavConfigFromStore();
    // Immediately prune old backups when max backups changes
    if (maxBackups > 0 && webDavCfg.enabled) {
      try {
        await webDavPruneOldBackups();
        await loadWebDavBackups();
      } catch (err) {
        console.error('[WebDAV] Failed to prune old backups', err);
      }
    }
  }

  $effect(() => {
    if (webDavCfg.enabled) {
      refreshWebDavState();
      loadWebDavBackups();
    }
  });
</script>

<!-- WebDAV Backup -->
<section class="card">
  <div class="card-header">
    <div class="card-icon webdav">
      <Icon name="database" size={16} />
    </div>
    <div>
      <h2>{$_('options.settings.webdavSync')}</h2>
      <p class="description">
        {$_('options.settings.webdavSyncDesc')}
      </p>
    </div>
  </div>

  <div class="webdav-grid">
    <label class="field">
      <span class="field-label">{$_('options.settings.webdavHost')}</span>
      <input
        class="text-input"
        type="url"
        bind:value={webDavHost}
        placeholder={$_('options.settings.webdavHostPlaceholder')}
        autocomplete="url"
      />
    </label>
    <label class="field">
      <span class="field-label">{$_('options.settings.webdavPath')}</span>
      <input
        class="text-input"
        type="text"
        bind:value={webDavPath}
        placeholder={$_('options.settings.webdavPathPlaceholder')}
        autocomplete="off"
      />
    </label>
    <label class="field">
      <span class="field-label">{$_('options.settings.webdavUsername')}</span>
      <input
        class="text-input"
        type="text"
        bind:value={webDavUsername}
        autocomplete="username"
      />
    </label>
    <label class="field">
      <span class="field-label">{$_('options.settings.webdavPassword')}</span>
      <div class="password-input-container">
        <input
          class="text-input"
          type={showWebDavPassword ? 'text' : 'password'}
          bind:value={webDavPassword}
          autocomplete="current-password"
        />
        <button
          type="button"
          class="password-toggle-btn"
          onclick={() => (showWebDavPassword = !showWebDavPassword)}
          aria-label="Toggle password visibility"
        >
          <Icon name={showWebDavPassword ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
    </label>
    <label class="field">
      <span class="field-label">{$_('options.settings.webdavEncryptionPassword')}</span>
      <div class="password-input-container">
        <input
          class="text-input"
          type={showWebDavEncryptionPassword ? 'text' : 'password'}
          bind:value={webDavEncryptionPassword}
          placeholder={$_('options.settings.webdavEncryptionPasswordPlaceholder')}
          autocomplete="new-password"
        />
        <button
          type="button"
          class="password-toggle-btn"
          onclick={() => (showWebDavEncryptionPassword = !showWebDavEncryptionPassword)}
          aria-label="Toggle passphrase visibility"
        >
          <Icon name={showWebDavEncryptionPassword ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
    </label>
  </div>

  {#if webDavCfg.enabled}
    <div class="sync-status-row">
      <div class="sync-status-indicator" class:syncing={webDavBackingUp || webDavState.status === 'syncing'} class:error={webDavState.status === 'error'}>
        {#if webDavBackingUp || webDavState.status === 'syncing'}
          <span class="spinner-sm"></span>
        {:else if webDavState.status === 'error'}
          <Icon name="alert-triangle" size={14} />
        {:else}
          <Icon name="check" size={14} />
        {/if}
        <span class="sync-status-text">
          {#if webDavBackingUp || webDavState.status === 'syncing'}
            {$_('common.syncing')}
          {:else if webDavState.status === 'error'}
            {$_('common.error')}
          {:else}
            {$_('common.connected')}
          {/if}
        </span>
      </div>
      {#if webDavCfg.lastSyncAt > 0}
        <span class="sync-last-time">{$_('options.settings.lastSync', { values: { time: formatRelativeTime(webDavCfg.lastSyncAt) } })}</span>
      {/if}
    </div>
    {#if webDavState.status === 'error' && webDavState.progress}
      <p class="sync-error-text">{webDavState.progress}</p>
    {:else if webDavCfg.lastSyncError}
      <p class="sync-error-text">{webDavCfg.lastSyncError}</p>
    {/if}
  {/if}

  <div class="divider"></div>

  <div class="setting-row">
    <span class="setting-label">{$_('options.settings.autoSyncInterval')}</span>
    <div class="interval-options webdav-intervals">
      {#each WEBDAV_SYNC_INTERVAL_OPTIONS as opt (opt.value)}
        <button
          class="interval-pill"
          class:active={webDavSyncInterval === opt.value}
          onclick={() => handleWebDavIntervalChange(opt.value)}
          aria-pressed={webDavSyncInterval === opt.value}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="setting-row">
    <div class="toggle-info">
      <span class="setting-label">{$_('options.settings.webdavMaxBackups')}</span>
      <span class="toggle-description">
        {$_('options.settings.webdavMaxBackupsDesc')}
      </span>
    </div>
    <div class="interval-options">
      {#each WEBDAV_MAX_BACKUP_OPTIONS as opt (opt.value)}
        <button
          class="interval-pill"
          class:active={webDavMaxBackups === opt.value}
          onclick={() => handleWebDavMaxBackupsChange(opt.value)}
          aria-pressed={webDavMaxBackups === opt.value}
        >
          {opt.value === 0 ? $_('options.settings.unlimited') : opt.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="divider"></div>

  <div class="sync-actions">
    <button
      class="security-text-btn"
      onclick={handleWebDavSaveAccount}
      disabled={webDavSaving}
    >
      {#if webDavSaving}
        <span class="spinner-sm"></span>
        {$_('common.saving')}
      {:else}
        <Icon name="check" size={14} />
        {$_('options.settings.saveWebdavAccount')}
      {/if}
    </button>
    <button
      class="security-text-btn"
      onclick={handleWebDavTestConnection}
      disabled={webDavTesting}
    >
      {#if webDavTesting}
        <span class="spinner-sm"></span>
        {$_('options.settings.testing')}
      {:else}
        <Icon name="refresh-cw" size={14} />
        {$_('options.settings.testWebdav')}
      {/if}
    </button>
    <button
      class="security-text-btn primary"
      onclick={handleWebDavConnect}
      disabled={webDavConnecting}
    >
      {#if webDavConnecting}
        <span class="spinner-sm"></span>
        {$_('common.connecting')}
      {:else}
        <Icon name="check" size={14} />
        {webDavCfg.enabled ? $_('options.settings.saveWebdav') : $_('options.settings.connectWebdav')}
      {/if}
    </button>
    {#if webDavCfg.enabled}
      <button
        class="security-text-btn"
        onclick={handleWebDavBackupNow}
        disabled={webDavBackingUp}
      >
        {#if webDavBackingUp}
          <span class="spinner-sm"></span>
          {$_('common.syncing')}
        {:else}
          <Icon name="upload" size={14} />
          {$_('options.settings.backupNow')}
        {/if}
      </button>
      <button
        class="security-text-btn"
        onclick={() => (showWebDavDisconnectConfirm = true)}
      >
        <Icon name="cloud-off" size={14} />
        {$_('common.disconnect')}
      </button>
    {/if}
  </div>

  <div class="isolation-explainer">
    <div class="explainer-row">
      <Icon name="lock" size={14} />
      <div>
        {$_('options.settings.webdavEncryptionDesc')}
      </div>
    </div>
  </div>
</section>

{#if webDavCfg.enabled}
  <!-- WebDAV Backup Manager -->
  <section class="card webdav-backup-manager">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="archive" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.backupsManager')}</h2>
        <p class="description">{$_('options.settings.backupsManagerDesc')}</p>
      </div>
    </div>

    <div class="backup-manager-actions">
      <button class="security-text-btn" onclick={loadWebDavBackups} disabled={webDavBackupsLoading}>
        {#if webDavBackupsLoading}
          <span class="spinner-sm"></span>
          {$_('common.loading')}
        {:else}
          <Icon name="refresh-cw" size={14} />
          {$_('options.settings.refresh')}
        {/if}
      </button>
    </div>

    {#if webDavBackupsLoading && webDavBackups.length === 0}
      <div class="backup-manager-loading">
        <span class="spinner"></span>
      </div>
    {:else if webDavBackups.length === 0}
      <div class="no-backups-state">
        <Icon name="info" size={24} />
        <p>{$_('options.settings.noBackups')}</p>
      </div>
    {:else}
      <div class="table-container">
        <table class="backups-table">
          <thead>
            <tr>
              <th>{$_('options.settings.fileName')}</th>
              <th>{$_('options.settings.modifiedAt')}</th>
              <th>{$_('options.settings.fileSize')}</th>
              <th>{$_('options.settings.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each webDavBackups.slice((webDavBackupPage - 1) * 5, webDavBackupPage * 5) as file}
              <tr>
                <td class="file-name-cell" title={file.fileName}>
                  <span class="file-name-txt">{file.fileName}</span>
                </td>
                <td>{new Date(file.lastModified).toLocaleString()}</td>
                <td>{(file.size / 1024).toFixed(1)} KB</td>
                <td>
                  <div class="action-buttons">
                    <button
                      class="action-btn restore-btn"
                      onclick={() => (showWebDavRestoreConfirm = file)}
                      disabled={webDavBackupRestoring}
                      title={$_('options.settings.restore')}
                    >
                      <Icon name="download" size={14} />
                      <span>{$_('options.settings.restore')}</span>
                    </button>
                    <button
                      class="action-btn delete-btn"
                      onclick={() => (showWebDavDeleteConfirm = file)}
                      disabled={webDavBackupDeleting}
                      title={$_('options.settings.delete')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if Math.ceil(webDavBackups.length / 5) > 1}
        <div class="pagination">
          <button
            class="pagination-btn"
            disabled={webDavBackupPage === 1}
            onclick={() => (webDavBackupPage = webDavBackupPage - 1)}
          >
            {$_('options.settings.prevPage')}
          </button>
          <span class="pagination-info">
            {$_('options.settings.page', {
              values: {
                current: webDavBackupPage,
                total: Math.ceil(webDavBackups.length / 5)
              }
            })}
          </span>
          <button
            class="pagination-btn"
            disabled={webDavBackupPage === Math.ceil(webDavBackups.length / 5)}
            onclick={() => (webDavBackupPage = webDavBackupPage + 1)}
          >
            {$_('options.settings.nextPage')}
          </button>
        </div>
      {/if}
    {/if}
  </section>
{/if}

{#if showWebDavDisconnectConfirm}
  <ConfirmDialog
    title={$_('options.settings.webdavDisconnectTitle')}
    message={$_('options.settings.webdavDisconnectMessage')}
    confirmLabel={$_('common.disconnect')}
    danger={true}
    onconfirm={handleWebDavDisconnect}
    oncancel={() => (showWebDavDisconnectConfirm = false)}
  />
{/if}

{#if showWebDavRestoreConfirm}
  <ConfirmDialog
    title={$_('options.settings.webdavRestoreConfirmTitle')}
    message={$_('options.settings.webdavRestoreConfirmMessage', { values: { file: showWebDavRestoreConfirm.fileName } })}
    confirmLabel={$_('options.settings.restore')}
    danger={true}
    onconfirm={() => handleWebDavRestore(showWebDavRestoreConfirm!)}
    oncancel={() => (showWebDavRestoreConfirm = null)}
  />
{/if}

{#if showWebDavDeleteConfirm}
  <ConfirmDialog
    title={$_('options.settings.webdavDeleteConfirmTitle')}
    message={$_('options.settings.webdavDeleteConfirmMessage', { values: { file: showWebDavDeleteConfirm.fileName } })}
    confirmLabel={$_('options.settings.delete')}
    danger={true}
    onconfirm={() => handleWebDavDeleteBackup(showWebDavDeleteConfirm!)}
    oncancel={() => (showWebDavDeleteConfirm = null)}
  />
{/if}

{#if syncToast}
  <Toast
    message={syncToast.message}
    type={syncToast.type}
    ondismiss={() => (syncToast = null)}
  />
{/if}

<style>
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

  .card-icon.webdav {
    background: #eef2ff;
    color: #4f46e5;
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

  .divider {
    height: 1px;
    background: var(--color-border-secondary);
    margin: 0;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .setting-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .interval-options {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
  }

  .interval-pill {
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

  .interval-pill:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .interval-pill.active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .webdav-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .text-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    transition: all var(--transition-smooth);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .password-input-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-toggle-btn {
    position: absolute;
    right: var(--space-2);
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--transition-fast);
  }

  .password-toggle-btn:hover {
    color: var(--color-text-secondary);
  }

  .sync-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-bg-secondary);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
  }

  .sync-status-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-success);
  }

  .sync-status-indicator.syncing {
    color: var(--color-accent);
  }

  .sync-status-indicator.error {
    color: var(--color-error);
  }

  .sync-status-text {
    font-size: var(--text-xs);
  }

  .sync-last-time {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .sync-error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin: var(--space-2) 0 0;
  }

  .sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .security-text-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--transition-smooth);
  }

  .security-text-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
  }

  .security-text-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .security-text-btn.primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .security-text-btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }

  .isolation-explainer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }

  .explainer-row {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .explainer-row :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--color-text-tertiary);
  }

  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: currentColor;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Backup Manager Styles */
  .webdav-backup-manager {
    border-top: 1px solid var(--color-border-secondary);
  }

  .backup-manager-actions {
    display: flex;
    justify-content: flex-end;
  }

  .table-container {
    overflow-x: auto;
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
  }

  .backups-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    text-align: left;
  }

  .backups-table th {
    background: var(--color-bg-tertiary);
    padding: var(--space-4);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-secondary);
  }

  .backups-table td {
    padding: var(--space-4);
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-secondary);
    vertical-align: middle;
  }

  .backups-table tr:last-child td {
    border-bottom: none;
  }

  .file-name-cell {
    max-width: 200px;
  }

  .file-name-txt {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-primary);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
    color: var(--color-text-primary);
  }

  .restore-btn {
    color: var(--color-accent);
    border-color: var(--color-accent-soft);
    background: var(--color-accent-soft);
  }

  .restore-btn:hover:not(:disabled) {
    background: var(--color-accent);
    color: white;
  }

  .delete-btn:hover:not(:disabled) {
    background: var(--color-error-soft);
    color: var(--color-error);
    border-color: var(--color-error-soft);
  }

  .backup-manager-loading, .no-backups-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-10);
    color: var(--color-text-tertiary);
    gap: var(--space-4);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border-secondary);
    border-radius: 50%;
    border-top-color: var(--color-accent);
    animation: spin 1s linear infinite;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  .pagination-btn {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-primary);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-info {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  @media (max-width: 640px) {
    .webdav-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
