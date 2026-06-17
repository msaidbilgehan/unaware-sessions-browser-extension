<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { setLocale } from '@shared/i18n';
  import '@shared/i18n';
  import { getTheme, toggleTheme, onThemeChange } from '@shared/theme-store';

  // Force re-render when locale changes
  $effect(() => { void $locale; });
  import type { ThemePreference } from '@shared/theme-store';
  import {
    getAutoRefreshInterval,
    getAutoRefreshDefaultEnabled,
    getIsolationModeDefault,
    setAutoRefreshInterval,
    setAutoRefreshDefaultEnabled,
    setIsolationModeDefault,
    onSettingsChange,
  } from '@shared/settings-store';
  import type { AutoRefreshInterval, IsolationMode, GracePeriodMs } from '@shared/types';
  import { GRACE_PERIOD_OPTIONS } from '@shared/constants';
  import {
    isPasscodeEnabled,
    isBiometricEnabled,
    isBiometricAvailable,
    getGracePeriodMs,
    setupPasscode,
    removePasscode,
    changePasscode,
    setupBiometric,
    removeBiometric,
    verifyBiometric,
    verifyAndUnlock,
    setGracePeriodDuration,
    onSecurityChange,
  } from '@shared/security-store';
  import { tick } from 'svelte';
  import Icon from '@shared/components/Icon.svelte';
  import Toast from '@shared/components/Toast.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import SyncConflictDialog from './SyncConflictDialog.svelte';
  import {
    syncConnect,
    syncDisconnect,
    syncNow,
    syncGetState,
    syncConfigure,
    syncResolveConflicts,
    exportFull,
    webDavBackupNow,
    webDavConnect,
    webDavDisconnect,
    webDavGetState,
    webDavTestConnection,
    webDavListBackups,
    webDavRestore,
  } from '@shared/api';
  import {
    getSyncConfig,
    initSyncStore,
    onSyncConfigChange,
  } from '@shared/sync/sync-store';
  import type { SyncConfig, SyncState, MergeStrategy, SyncInterval, ConflictEntry } from '@shared/sync/sync-types';
  import {
    SYNC_INTERVAL_OPTIONS,
    WEBDAV_MAX_BACKUP_OPTIONS,
    WEBDAV_SYNC_INTERVAL_OPTIONS,
  } from '@shared/constants';
  import {
    getWebDavConfig,
    initWebDavStore,
    onWebDavConfigChange,
    setWebDavConfig,
  } from '@shared/webdav/webdav-store';
  import type {
    WebDavConfig,
    WebDavConnectionConfig,
    WebDavMaxBackups,
    WebDavState,
    WebDavSyncInterval,
    WebDavFile,
  } from '@shared/webdav/webdav-types';
  import { formatRelativeTime, generateId } from '@shared/utils';

  let theme = $state<ThemePreference>(getTheme());
  $effect(() => {
    const unsub = onThemeChange((t) => {
      theme = t;
    });
    return unsub;
  });

  async function setTheme(preference: ThemePreference) {
    while (getTheme() !== preference) {
      await toggleTheme();
    }
    theme = preference;
  }

  // Auto-refresh interval
  let refreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());
  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      refreshInterval = settings.autoRefreshInterval;
    });
    return unsub;
  });

  const intervalOptions: { value: AutoRefreshInterval; label: string }[] = [
    { value: 0, label: 'Off' },
    { value: 60, label: '1m' },
    { value: 120, label: '2m' },
    { value: 300, label: '5m' },
  ];

  async function handleIntervalChange(value: AutoRefreshInterval) {
    await setAutoRefreshInterval(value);
  }
  let defaultEnabled = $state<boolean>(getAutoRefreshDefaultEnabled());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      defaultEnabled = settings.autoRefreshDefaultEnabled;
    });
    return unsub;
  });

  async function handleDefaultEnabledChange(enabled: boolean) {
    await setAutoRefreshDefaultEnabled(enabled);
  }

  const themeOptions = $derived([
    { value: 'light' as ThemePreference, label: $_('options.settings.light'), icon: 'sun' },
    { value: 'dark' as ThemePreference, label: $_('options.settings.dark'), icon: 'moon' },
    { value: 'system' as ThemePreference, label: $_('options.settings.system'), icon: 'monitor' },
  ]);

  // Isolation mode default
  let isolationDefault = $state<IsolationMode>(getIsolationModeDefault());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      isolationDefault = settings.isolationModeDefault;
    });
    return unsub;
  });

  const isolationOptions = $derived([
    { value: 'soft' as IsolationMode, label: $_('options.settings.soft'), icon: 'shield' },
    { value: 'strict' as IsolationMode, label: $_('options.settings.strict'), icon: 'lock' },
  ]);

  async function handleIsolationDefaultChange(mode: IsolationMode) {
    await setIsolationModeDefault(mode);
  }

  // ── Security state ──────────────────────────────────────────────
  let passcodeOn = $state(isPasscodeEnabled());
  let biometricOn = $state(isBiometricEnabled());
  let biometricSupported = $state(false);
  let gracePeriod = $state<GracePeriodMs>(getGracePeriodMs());

  // Passcode setup flow
  type SecurityFlow = 'idle' | 'setup-enter' | 'setup-confirm' | 'verify-then-disable' | 'verify-then-change' | 'verify-then-biometric' | 'change-enter' | 'change-confirm';
  let securityFlow = $state<SecurityFlow>('idle');
  let pinDigits = $state<string[]>(['', '', '', '']);
  let pinConfirm = $state<string[]>(['', '', '', '']);
  let pinError = $state('');
  let pinInputRefs = $state<(HTMLInputElement | null)[]>([null, null, null, null]);

  $effect(() => {
    isBiometricAvailable().then((v) => {
      biometricSupported = v;
    });
  });

  $effect(() => {
    const unsub = onSecurityChange((config) => {
      passcodeOn = config.passcodeEnabled;
      biometricOn = config.biometricEnabled;
      gracePeriod = config.gracePeriodMs;
    });
    return unsub;
  });

  function resetPinState() {
    securityFlow = 'idle';
    pinDigits = ['', '', '', ''];
    pinConfirm = ['', '', '', ''];
    pinError = '';
  }

  async function focusFirstPin() {
    await tick();
    pinInputRefs[0]?.focus();
  }

  function handlePinDigitInput(index: number, e: Event, target: 'digits' | 'confirm') {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    const arr = target === 'digits' ? pinDigits : pinConfirm;
    arr[index] = value.slice(-1);
    input.value = arr[index];

    if (arr[index] && index < 3) {
      pinInputRefs[index + 1]?.focus();
    }
  }

  function handlePinDigitKeydown(index: number, e: KeyboardEvent, target: 'digits' | 'confirm') {
    const arr = target === 'digits' ? pinDigits : pinConfirm;
    if (e.key === 'Backspace') {
      if (!arr[index] && index > 0) {
        e.preventDefault();
        arr[index - 1] = '';
        pinInputRefs[index - 1]?.focus();
      } else {
        arr[index] = '';
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      pinInputRefs[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 3) {
      e.preventDefault();
      pinInputRefs[index + 1]?.focus();
    }
    if (e.key === 'Escape') {
      resetPinState();
    }
  }

  function startPasscodeSetup() {
    resetPinState();
    securityFlow = 'setup-enter';
    focusFirstPin();
  }

  function handleSetupEnterComplete() {
    const pin = pinDigits.join('');
    if (pin.length !== 4) return;
    securityFlow = 'setup-confirm';
    pinInputRefs = [null, null, null, null];
    focusFirstPin();
  }

  async function handleSetupConfirmComplete() {
    const pin = pinDigits.join('');
    const confirm = pinConfirm.join('');
    if (confirm.length !== 4) return;
    if (pin !== confirm) {
      pinError = $_('options.settings.pinsNoMatch');
      pinConfirm = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    await setupPasscode(pin);
    resetPinState();
  }

  function startPasscodeDisable() {
    resetPinState();
    securityFlow = 'verify-then-disable';
    focusFirstPin();
  }

  function startPasscodeChange() {
    resetPinState();
    securityFlow = 'verify-then-change';
    focusFirstPin();
  }

  async function handleVerifyComplete() {
    const pin = pinDigits.join('');
    if (pin.length !== 4) return;
    const valid = await verifyAndUnlock(pin);
    if (!valid) {
      pinError = $_('options.settings.incorrectPasscode');
      pinDigits = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    if (securityFlow === 'verify-then-disable') {
      if (biometricOn) await removeBiometric();
      await removePasscode();
      resetPinState();
    } else if (securityFlow === 'verify-then-change') {
      pinDigits = ['', '', '', ''];
      pinError = '';
      securityFlow = 'change-enter';
      pinInputRefs = [null, null, null, null];
      focusFirstPin();
    } else if (securityFlow === 'verify-then-biometric') {
      resetPinState();
      await doBiometricToggle();
    }
  }

  function handleChangeEnterComplete() {
    const pin = pinDigits.join('');
    if (pin.length !== 4) return;
    securityFlow = 'change-confirm';
    pinInputRefs = [null, null, null, null];
    focusFirstPin();
  }

  async function handleChangeConfirmComplete() {
    const pin = pinDigits.join('');
    const confirm = pinConfirm.join('');
    if (confirm.length !== 4) return;
    if (pin !== confirm) {
      pinError = $_('options.settings.pinsNoMatch');
      pinConfirm = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    await changePasscode(pin);
    resetPinState();
  }

  async function handleBiometricToggle() {
    if (!passcodeOn) return; // Passcode must be enabled first
    if (biometricOn) {
      // Disabling: try biometric verification first, fall back to passcode
      await handleBiometricDisable();
    } else {
      // Enabling: verify via biometric registration (WebAuthn prompt is inherently verified)
      // but require passcode first to prove identity
      resetPinState();
      securityFlow = 'verify-then-biometric';
      focusFirstPin();
    }
  }

  async function handleBiometricDisable() {
    try {
      const verified = await verifyBiometric();
      if (verified) {
        await removeBiometric();
        return;
      }
    } catch {
      // Biometric failed — fall back to passcode
    }
    // Fallback: require passcode to disable biometric
    resetPinState();
    securityFlow = 'verify-then-biometric';
    focusFirstPin();
  }

  async function doBiometricToggle() {
    try {
      if (biometricOn) {
        await removeBiometric();
      } else {
        await setupBiometric();
      }
    } catch {
      // setupBiometric can fail if user cancels the WebAuthn prompt
    }
  }

  async function handleGracePeriodChange(ms: GracePeriodMs) {
    await setGracePeriodDuration(ms);
  }

  // ── Cloud Sync state ──────────────────────────────────────

  let syncCfg = $state<SyncConfig>(getSyncConfig());
  let syncState = $state<SyncState>({ status: 'idle', progress: '', conflicts: [] });
  let showDisconnectConfirm = $state(false);
  let showConflictDialog = $state(false);
  let syncing = $state(false);
  let connecting = $state(false);
  let syncToast = $state<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  $effect(() => {
    initSyncStore().then(() => {
      syncCfg = getSyncConfig();
    });
    const unsub = onSyncConfigChange((config) => {
      syncCfg = config;
    });
    return unsub;
  });

  const mergeOptions = $derived([
    { value: 'trust-cloud' as MergeStrategy, label: $_('options.settings.trustCloud') },
    { value: 'trust-local' as MergeStrategy, label: $_('options.settings.trustLocal') },
    { value: 'ask' as MergeStrategy, label: $_('options.settings.ask') },
  ]);

  async function handleSyncConnect() {
    connecting = true;
    try {
      await syncConnect();
      syncCfg = getSyncConfig();
      syncToast = { message: $_('options.settings.connectedDrive'), type: 'success' };
    } catch (err) {
      syncToast = { message: $_('options.settings.connectionFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      connecting = false;
    }
  }

  async function handleSyncDisconnect() {
    showDisconnectConfirm = false;
    try {
      await syncDisconnect();
      syncCfg = getSyncConfig();
      syncState = { status: 'idle', progress: '', conflicts: [] };
      syncToast = { message: $_('options.settings.disconnectedDrive'), type: 'info' };
    } catch (err) {
      syncToast = { message: $_('options.settings.disconnectFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    }
  }

  async function handleSyncNow() {
    syncing = true;
    try {
      const state = await syncNow();
      syncState = state;

      if (state.status === 'conflict') {
        showConflictDialog = true;
      } else if (state.status === 'error') {
        syncToast = { message: state.progress, type: 'error' };
      } else {
        syncToast = { message: $_('options.settings.syncCompleted'), type: 'success' };
      }
    } catch (err) {
      syncToast = { message: $_('options.settings.syncFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      syncing = false;
    }
  }

  async function handleConflictResolve(resolutions: ConflictEntry[]) {
    showConflictDialog = false;
    syncing = true;
    try {
      const state = await syncResolveConflicts(resolutions);
      syncState = state;
      if (state.status === 'error') {
        syncToast = { message: state.progress, type: 'error' };
      } else {
        syncToast = { message: $_('options.settings.syncCompletedResolved'), type: 'success' };
      }
    } catch (err) {
      syncToast = { message: $_('options.settings.syncFailed', { values: { error: err instanceof Error ? err.message : 'Unknown error' } }), type: 'error' };
    } finally {
      syncing = false;
    }
  }

  async function handleMergeStrategyChange(strategy: MergeStrategy) {
    await syncConfigure({ mergeStrategy: strategy });
  }

  async function handleSyncIntervalChange(interval: SyncInterval) {
    await syncConfigure({ syncInterval: interval });
  }

  async function refreshSyncState() {
    try {
      syncState = await syncGetState();
    } catch {
      // Ignore — sync may not be initialized
    }
  }

  $effect(() => {
    if (syncCfg.enabled) {
      refreshSyncState();
    }
  });

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
  let webDavEncryptionPassword = $state(webDavCfg.encryptionPassword || '');
  let showWebDavEncryptionPassword = $state(false);
  let webDavPath = $state(webDavCfg.path);
  let webDavSyncInterval = $state<WebDavSyncInterval>(webDavCfg.syncInterval);
  let webDavMaxBackups = $state<WebDavMaxBackups>(webDavCfg.maxBackups);
  let webDavSkipFileData = $state(webDavCfg.skipFileData || false);

  // Backup manager state
  let webDavBackups = $state<WebDavFile[]>([]);
  let webDavBackupsLoading = $state(false);
  let webDavBackupPage = $state(1);
  let showWebDavRestoreConfirm = $state<WebDavFile | null>(null);
  let showWebDavDeleteConfirm = $state<WebDavFile | null>(null);
  let webDavBackupRestoring = $state(false);
  let webDavBackupDeleting = $state(false);

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
    webDavSkipFileData = config.skipFileData || false;
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
      skipFileData: webDavSkipFileData,
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
      skipFileData: webDavSkipFileData,
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
  }

  $effect(() => {
    if (webDavCfg.enabled) {
      refreshWebDavState();
      loadWebDavBackups();
    }
  });

</script>

<div class="settings-layout">
  <!-- Language -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="globe" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.language')}</h2>
        <p class="description">{$_('options.settings.languageDesc')}</p>
      </div>
    </div>
    <div class="setting-row">
      <span class="setting-label">{$_('options.settings.language')}</span>
      <div class="interval-options">
        <button
          class="interval-pill"
          class:active={$locale === 'en'}
          onclick={() => setLocale('en')}
          aria-pressed={$locale === 'en'}
        >
          English
        </button>
        <button
          class="interval-pill"
          class:active={$locale === 'zh'}
          onclick={() => setLocale('zh')}
          aria-pressed={$locale === 'zh'}
        >
          中文
        </button>
        <button
          class="interval-pill"
          class:active={$locale === 'de'}
          onclick={() => setLocale('de')}
          aria-pressed={$locale === 'de'}
        >
          Deutsch
        </button>
        <button
          class="interval-pill"
          class:active={$locale === 'ja'}
          onclick={() => setLocale('ja')}
          aria-pressed={$locale === 'ja'}
        >
          日本語
        </button>
      </div>
    </div>
  </section>

  <!-- Appearance -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="sun" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.appearance')}</h2>
        <p class="description">{$_('options.settings.appearanceDesc')}</p>
      </div>
    </div>

    <div class="theme-options">
      {#each themeOptions as opt}
        <button
          class="theme-option"
          class:active={theme === opt.value}
          onclick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
        >
          <Icon name={opt.icon} size={16} />
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Cookie Isolation -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="shield" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.cookieIsolation')}</h2>
        <p class="description">
          {$_('options.settings.cookieIsolationDesc')}
        </p>
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">{$_('options.settings.defaultMode')}</span>
      <div class="interval-options">
        {#each isolationOptions as opt (opt.value)}
          <button
            class="interval-pill"
            class:active={isolationDefault === opt.value}
            onclick={() => handleIsolationDefaultChange(opt.value)}
            aria-pressed={isolationDefault === opt.value}
          >
            <Icon name={opt.icon} size={12} />
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="isolation-explainer">
      <div class="explainer-row">
        <Icon name="shield" size={14} />
        <div>
          <strong>{$_('options.settings.soft')}</strong> — {$_('options.settings.softDesc')}
        </div>
      </div>
      <div class="explainer-row">
        <Icon name="lock" size={14} />
        <div>
          <strong>{$_('options.settings.strict')}</strong> — {$_('options.settings.strictDesc')}
        </div>
      </div>
    </div>
  </section>

  <!-- Data Refresh -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="refresh-cw" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.autoRefresh')}</h2>
        <p class="description">
          {$_('options.settings.autoRefreshDesc')}
        </p>
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">{$_('options.settings.refreshInterval')}</span>
      <div class="interval-options">
        {#each intervalOptions as opt (opt.value)}
          <button
            class="interval-pill"
            class:active={refreshInterval === opt.value}
            onclick={() => handleIntervalChange(opt.value)}
            aria-pressed={refreshInterval === opt.value}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="divider"></div>

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">{$_('options.settings.autoRefreshNewDomains')}</span>
        <span class="toggle-description">
          {$_('options.settings.autoRefreshNewDomainsDesc')}
        </span>
      </div>
      <button
        class="toggle-switch"
        class:on={defaultEnabled}
        onclick={() => handleDefaultEnabledChange(!defaultEnabled)}
        role="switch"
        aria-checked={defaultEnabled}
        aria-label={$_('options.settings.autoRefreshNewDomains')}
      >
        <span class="toggle-thumb"></span>
      </button>
    </label>
  </section>

  <!-- Security -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon security">
        <Icon name="lock" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.security')}</h2>
        <p class="description">
          {$_('options.settings.securityDesc')}
        </p>
      </div>
    </div>

    <!-- Passcode toggle row -->
    <div class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">{$_('options.settings.passcode')}</span>
        <span class="toggle-description">
          {$_('options.settings.passcodeDesc')}
        </span>
      </div>
      {#if passcodeOn && securityFlow === 'idle'}
        <div class="security-actions">
          <button class="security-text-btn" onclick={startPasscodeChange}>{$_('options.settings.change')}</button>
          <button
            class="toggle-switch on"
            onclick={startPasscodeDisable}
            role="switch"
            aria-checked={true}
            aria-label={$_('options.settings.disablePasscode')}
          >
            <span class="toggle-thumb"></span>
          </button>
        </div>
      {:else if !passcodeOn && securityFlow === 'idle'}
        <button
          class="toggle-switch"
          onclick={startPasscodeSetup}
          role="switch"
          aria-checked={false}
          aria-label={$_('options.settings.enablePasscode')}
        >
          <span class="toggle-thumb"></span>
        </button>
      {/if}
    </div>

    <!-- Inline PIN entry flows -->
    {#if securityFlow === 'setup-enter'}
      <div class="pin-flow">
        <span class="pin-flow-label">{$_('options.settings.enterPasscode')}</span>
        <div class="pin-row">
          {#each pinDigits as _, i}
            <input
              bind:this={pinInputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-box"
              class:filled={pinDigits[i].length > 0}
              oninput={(e) => handlePinDigitInput(i, e, 'digits')}
              onkeydown={(e) => handlePinDigitKeydown(i, e, 'digits')}
              aria-label="Digit {i + 1}"
            />
          {/each}
        </div>
        <div class="pin-flow-actions">
          <button class="security-text-btn" onclick={resetPinState}>{$_('common.cancel')}</button>
          <button
            class="security-text-btn primary"
            onclick={handleSetupEnterComplete}
            disabled={pinDigits.join('').length !== 4}
          >{$_('common.next')}</button>
        </div>
      </div>
    {/if}

    {#if securityFlow === 'setup-confirm'}
      <div class="pin-flow">
        <span class="pin-flow-label">{$_('options.settings.confirmPasscode')}</span>
        <div class="pin-row">
          {#each pinConfirm as _, i}
            <input
              bind:this={pinInputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-box"
              class:filled={pinConfirm[i].length > 0}
              class:error={!!pinError}
              oninput={(e) => handlePinDigitInput(i, e, 'confirm')}
              onkeydown={(e) => handlePinDigitKeydown(i, e, 'confirm')}
              aria-label="Confirm digit {i + 1}"
            />
          {/each}
        </div>
        {#if pinError}
          <span class="pin-error">{pinError}</span>
        {/if}
        <div class="pin-flow-actions">
          <button class="security-text-btn" onclick={resetPinState}>{$_('common.cancel')}</button>
          <button
            class="security-text-btn primary"
            onclick={handleSetupConfirmComplete}
            disabled={pinConfirm.join('').length !== 4}
          >{$_('common.save')}</button>
        </div>
      </div>
    {/if}

    {#if securityFlow === 'verify-then-disable' || securityFlow === 'verify-then-change' || securityFlow === 'verify-then-biometric'}
      <div class="pin-flow">
        <span class="pin-flow-label">{$_('options.settings.enterCurrentPasscode')}</span>
        <div class="pin-row">
          {#each pinDigits as _, i}
            <input
              bind:this={pinInputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-box"
              class:filled={pinDigits[i].length > 0}
              class:error={!!pinError}
              oninput={(e) => handlePinDigitInput(i, e, 'digits')}
              onkeydown={(e) => handlePinDigitKeydown(i, e, 'digits')}
              aria-label="Digit {i + 1}"
            />
          {/each}
        </div>
        {#if pinError}
          <span class="pin-error">{pinError}</span>
        {/if}
        <div class="pin-flow-actions">
          <button class="security-text-btn" onclick={resetPinState}>{$_('common.cancel')}</button>
          <button
            class="security-text-btn primary"
            onclick={handleVerifyComplete}
            disabled={pinDigits.join('').length !== 4}
          >{$_('common.verify')}</button>
        </div>
      </div>
    {/if}

    {#if securityFlow === 'change-enter'}
      <div class="pin-flow">
        <span class="pin-flow-label">{$_('options.settings.enterNewPasscode')}</span>
        <div class="pin-row">
          {#each pinDigits as _, i}
            <input
              bind:this={pinInputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-box"
              class:filled={pinDigits[i].length > 0}
              oninput={(e) => handlePinDigitInput(i, e, 'digits')}
              onkeydown={(e) => handlePinDigitKeydown(i, e, 'digits')}
              aria-label="Digit {i + 1}"
            />
          {/each}
        </div>
        <div class="pin-flow-actions">
          <button class="security-text-btn" onclick={resetPinState}>{$_('common.cancel')}</button>
          <button
            class="security-text-btn primary"
            onclick={handleChangeEnterComplete}
            disabled={pinDigits.join('').length !== 4}
          >{$_('common.next')}</button>
        </div>
      </div>
    {/if}

    {#if securityFlow === 'change-confirm'}
      <div class="pin-flow">
        <span class="pin-flow-label">{$_('options.settings.confirmNewPasscode')}</span>
        <div class="pin-row">
          {#each pinConfirm as _, i}
            <input
              bind:this={pinInputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-box"
              class:filled={pinConfirm[i].length > 0}
              class:error={!!pinError}
              oninput={(e) => handlePinDigitInput(i, e, 'confirm')}
              onkeydown={(e) => handlePinDigitKeydown(i, e, 'confirm')}
              aria-label="Confirm digit {i + 1}"
            />
          {/each}
        </div>
        {#if pinError}
          <span class="pin-error">{pinError}</span>
        {/if}
        <div class="pin-flow-actions">
          <button class="security-text-btn" onclick={resetPinState}>{$_('common.cancel')}</button>
          <button
            class="security-text-btn primary"
            onclick={handleChangeConfirmComplete}
            disabled={pinConfirm.join('').length !== 4}
          >{$_('common.save')}</button>
        </div>
      </div>
    {/if}

    <!-- Biometric toggle row (only if platform supports it) -->
    {#if biometricSupported}
      <div class="divider"></div>
      <label class="toggle-row" class:disabled={!passcodeOn}>
        <div class="toggle-info">
          <span class="toggle-label">
            <Icon name="fingerprint" size={14} class="inline-icon" />
            {$_('options.settings.biometric')}
          </span>
          <span class="toggle-description">
            {#if !passcodeOn}
              {$_('options.settings.biometricEnableFirst')}
            {:else}
              {$_('options.settings.biometricDesc')}
            {/if}
          </span>
        </div>
        <button
          class="toggle-switch"
          class:on={biometricOn}
          onclick={handleBiometricToggle}
          disabled={!passcodeOn}
          role="switch"
          aria-checked={biometricOn}
          aria-label={$_('options.settings.toggleBiometric')}
        >
          <span class="toggle-thumb"></span>
        </button>
      </label>
    {/if}

    <!-- Grace period selector (only if any security is enabled) -->
    {#if passcodeOn || biometricOn}
      <div class="divider"></div>
      <div class="setting-row">
        <div class="toggle-info">
          <span class="setting-label">{$_('options.settings.gracePeriod')}</span>
          <span class="toggle-description">
            {$_('options.settings.gracePeriodDesc')}
          </span>
        </div>
        <div class="interval-options">
          {#each GRACE_PERIOD_OPTIONS as opt (opt.value)}
            <button
              class="interval-pill"
              class:active={gracePeriod === opt.value}
              onclick={() => handleGracePeriodChange(opt.value)}
              aria-pressed={gracePeriod === opt.value}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <!-- Cloud Sync -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon sync">
        <Icon name="cloud" size={16} />
      </div>
      <div>
        <h2>{$_('options.settings.cloudSync')}</h2>
        <p class="description">
          {$_('options.settings.cloudSyncDesc')}
        </p>
      </div>
    </div>

    {#if !syncCfg.enabled}
      <button
        class="security-text-btn primary"
        onclick={handleSyncConnect}
        disabled={connecting}
      >
        {#if connecting}
          <span class="spinner-sm"></span>
          {$_('common.connecting')}
        {:else}
          <Icon name="cloud" size={14} />
          {$_('options.settings.connectDrive')}
        {/if}
      </button>
    {:else}
      <!-- Status line -->
      <div class="sync-status-row">
        <div class="sync-status-indicator" class:syncing class:error={syncState.status === 'error'}>
          {#if syncing}
            <span class="spinner-sm"></span>
          {:else if syncState.status === 'error'}
            <Icon name="alert-triangle" size={14} />
          {:else}
            <Icon name="check" size={14} />
          {/if}
          <span class="sync-status-text">
            {#if syncing}
              {$_('common.syncing')}
            {:else if syncState.status === 'error'}
              {$_('common.error')}
            {:else}
              {$_('common.connected')}
            {/if}
          </span>
        </div>
        {#if syncCfg.lastSyncAt > 0}
          <span class="sync-last-time">{$_('options.settings.lastSync', { values: { time: formatRelativeTime(syncCfg.lastSyncAt) } })}</span>
        {/if}
      </div>

      <div class="divider"></div>

      <!-- Merge strategy -->
      <div class="setting-row">
        <div class="toggle-info">
          <span class="setting-label">{$_('options.settings.mergeStrategy')}</span>
          <span class="toggle-description">
            {$_('options.settings.mergeStrategyDesc')}
          </span>
        </div>
        <div class="interval-options">
          {#each mergeOptions as opt (opt.value)}
            <button
              class="interval-pill"
              class:active={syncCfg.mergeStrategy === opt.value}
              onclick={() => handleMergeStrategyChange(opt.value)}
              aria-pressed={syncCfg.mergeStrategy === opt.value}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="divider"></div>

      <!-- Auto-sync interval -->
      <div class="setting-row">
        <span class="setting-label">{$_('options.settings.autoSyncInterval')}</span>
        <div class="interval-options">
          {#each SYNC_INTERVAL_OPTIONS as opt (opt.value)}
            <button
              class="interval-pill"
              class:active={syncCfg.syncInterval === opt.value}
              onclick={() => handleSyncIntervalChange(opt.value)}
              aria-pressed={syncCfg.syncInterval === opt.value}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="divider"></div>

      <!-- Actions -->
      <div class="sync-actions">
        <button
          class="security-text-btn primary"
          onclick={handleSyncNow}
          disabled={syncing}
        >
          {#if syncing}
            <span class="spinner-sm"></span>
            {$_('common.syncing')}
          {:else}
            <Icon name="refresh-cw" size={14} />
            {$_('options.settings.syncNow')}
          {/if}
        </button>
        <button
          class="security-text-btn"
          onclick={() => (showDisconnectConfirm = true)}
        >
          <Icon name="cloud-off" size={14} />
          {$_('common.disconnect')}
        </button>
      </div>

      <!-- Encryption explainer -->
      <div class="isolation-explainer">
        <div class="explainer-row">
          <Icon name="lock" size={14} />
          <div>
            {$_('options.settings.encryptionDesc')}
          </div>
        </div>
      </div>
    {/if}
  </section>

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
        <input
          class="text-input"
          type="password"
          bind:value={webDavPassword}
          autocomplete="current-password"
        />
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

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">{$_('options.settings.webdavSkipFileData')}</span>
        <span class="toggle-description">
          {$_('options.settings.webdavSkipFileDataDesc')}
        </span>
      </div>
      <button
        class="toggle-switch"
        class:on={webDavSkipFileData}
        onclick={() => { webDavSkipFileData = !webDavSkipFileData; saveWebDavConfigLocally(); }}
        role="switch"
        aria-checked={webDavSkipFileData}
        aria-label={$_('options.settings.webdavSkipFileData')}
      >
        <span class="toggle-thumb"></span>
      </button>
    </label>

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
</div>

{#if showDisconnectConfirm}
  <ConfirmDialog
    title={$_('options.settings.disconnectTitle')}
    message={$_('options.settings.disconnectMessage')}
    confirmLabel={$_('common.disconnect')}
    danger={true}
    onconfirm={handleSyncDisconnect}
    oncancel={() => (showDisconnectConfirm = false)}
  />
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

{#if showConflictDialog && syncState.conflicts.length > 0}
  <SyncConflictDialog
    conflicts={syncState.conflicts}
    onresolve={handleConflictResolve}
    oncancel={() => { showConflictDialog = false; }}
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
  .settings-layout {
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

  /* Theme options */
  .theme-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-primary);
    cursor: pointer;
    transition: all var(--transition-smooth);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    color: var(--color-text-secondary);
    flex: 1;
    justify-content: center;
  }

  .theme-option:hover:not(.active) {
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
  }

  .theme-option.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    box-shadow: var(--shadow-glow);
  }

  /* Interval */
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

  .divider {
    height: 1px;
    background: var(--color-border-secondary);
    margin: 0;
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    cursor: pointer;
  }

  .toggle-row.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .toggle-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .toggle-description {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    line-height: var(--leading-relaxed);
  }

  /* Toggle switch */
  .toggle-switch {
    position: relative;
    width: 40px;
    height: 22px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-smooth);
    flex-shrink: 0;
    padding: 0;
  }

  .toggle-switch.on {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .toggle-switch:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--color-interactive-thumb);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-spring);
  }

  .toggle-switch.on .toggle-thumb {
    transform: translateX(18px);
  }

  /* Isolation explainer */
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

  .explainer-row strong {
    color: var(--color-text-primary);
  }

  .interval-pill :global(svg) {
    vertical-align: -1px;
  }

  /* Security card */
  .card-icon.security {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .security-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .security-text-btn {
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

  .security-text-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
  }

  .security-text-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .security-text-btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .security-text-btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .security-text-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  /* PIN flow */
  .pin-flow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .pin-flow-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .pin-row {
    display: flex;
    gap: var(--space-3);
  }

  .pin-box {
    width: 40px;
    height: 48px;
    text-align: center;
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    border: 2px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    outline: none;
    transition: all var(--transition-fast);
    -webkit-text-security: disc;
  }

  .pin-box:focus {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .pin-box.filled {
    border-color: var(--color-accent);
  }

  .pin-box.error {
    border-color: var(--color-error);
  }

  .pin-error {
    font-size: var(--text-xs);
    color: var(--color-error);
  }

  .pin-flow-actions {
    display: flex;
    gap: var(--space-3);
  }

  :global(.inline-icon) {
    vertical-align: -2px;
  }

  /* Cloud Sync card */
  .card-icon.sync {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .card-icon.webdav {
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .webdav-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
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
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .text-input:focus {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .text-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .webdav-intervals {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .sync-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .sync-status-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-success);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .sync-status-indicator.syncing {
    color: var(--color-accent);
  }

  .sync-status-indicator.error {
    color: var(--color-error);
  }

  .sync-status-text {
    font-size: var(--text-sm);
  }

  .sync-last-time {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .sync-error-text {
    margin: calc(-1 * var(--space-3)) 0 0;
    font-size: var(--text-xs);
    color: var(--color-error);
    line-height: var(--leading-relaxed);
    word-break: break-word;
  }

  .sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-primary);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: -2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .security-text-btn :global(svg) {
    vertical-align: -2px;
  }

  /* Password toggle input */
  .password-input-container {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .password-input-container :global(.text-input) {
    width: 100%;
    padding-right: 40px !important;
  }

  .password-toggle-btn {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .password-toggle-btn:hover {
    color: var(--color-text-primary);
    background-color: var(--color-interactive-hover);
  }

  /* WebDAV Backup Manager */
  .webdav-backup-manager {
    margin-top: var(--space-6);
  }

  .backup-manager-actions {
    display: flex;
    justify-content: flex-start;
    margin-bottom: var(--space-4);
  }

  .backup-manager-loading {
    display: flex;
    justify-content: center;
    padding: var(--space-8) 0;
  }

  .no-backups-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8) 0;
    color: var(--color-text-tertiary);
  }

  .no-backups-state p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .table-container {
    overflow-x: auto;
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-primary);
  }

  .backups-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: var(--text-sm);
  }

  .backups-table th,
  .backups-table td {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border-secondary);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .backups-table th {
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
    background: var(--color-bg-secondary);
  }

  .backups-table tbody tr:last-child td {
    border-bottom: none;
  }

  .backups-table tbody tr:hover {
    background: var(--color-interactive-hover);
  }

  .file-name-cell {
    max-width: 250px;
    overflow: hidden;
  }

  .file-name-txt {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
    font-weight: var(--font-medium);
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1-5) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
  }

  .restore-btn {
    color: var(--color-accent);
    border-color: var(--color-accent-soft);
    background: var(--color-accent-soft);
  }

  .restore-btn:hover:not(:disabled) {
    background: var(--color-accent);
    color: var(--color-text-inverse);
    border-color: var(--color-accent);
  }

  .delete-btn {
    padding: var(--space-1-5);
    color: var(--color-error);
    border-color: var(--color-error-soft);
  }

  .delete-btn:hover:not(:disabled) {
    background: var(--color-error);
    color: var(--color-text-inverse);
    border-color: var(--color-error);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  .pagination-btn {
    padding: var(--space-1-5) var(--space-3);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .pagination-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
    color: var(--color-text-primary);
  }

  .pagination-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pagination-info {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  @media (max-width: 640px) {
    .setting-row,
    .sync-status-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .webdav-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
