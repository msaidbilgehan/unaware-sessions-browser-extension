import { ALARM_WEBDAV_SYNC } from '@shared/constants';
import { decrypt, encrypt } from '@shared/sync/crypto-engine';
import { applyFullData, exportLocalData } from '@shared/sync/sync-engine';
import type { WebDavConfig, WebDavConnectionConfig, WebDavState, WebDavFile } from '@shared/webdav/webdav-types';
import {
  getWebDavConfig,
  isWebDavEnabled,
  onWebDavConfigChange,
  setWebDavConfig,
} from '@shared/webdav/webdav-store';
import {
  deleteWebDavFile,
  getWebDavFile,
  listWebDavFiles,
  putWebDavFile,
  testWebDavConnection,
} from '@shared/webdav/webdav-client';
import { createLogger } from '@shared/logger';
import { generateId } from '@shared/utils';

const log = createLogger('webdav-sync');

const BACKUP_PREFIX = 'unaware-sessions.';
const BACKUP_SUFFIX = '.webdav.json';

let currentWebDavState: WebDavState = { status: 'idle', progress: '' };

// ── State ──────────────────────────────────────────────────

export function getWebDavState(): WebDavState {
  return currentWebDavState;
}

export async function saveWebDavSettings(
  updates: Pick<WebDavConfig, 'host' | 'username' | 'password' | 'path' | 'syncInterval' | 'maxBackups'>,
): Promise<void> {
  const config = getWebDavConfig();
  const deviceId = config.deviceId || generateId();
  await setWebDavConfig({
    ...updates,
    deviceId,
    lastSyncError: '',
  });
}

export async function testSavedWebDavConnection(
  updates: Pick<WebDavConfig, 'host' | 'username' | 'password' | 'path' | 'syncInterval' | 'maxBackups'>,
): Promise<void> {
  await saveWebDavSettings(updates);
  try {
    await testWebDavConnection(toConnectionConfig({ ...getWebDavConfig(), ...updates }));
    await setWebDavConfig({ lastSyncError: '' });
    currentWebDavState = { status: 'idle', progress: '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentWebDavState = { status: 'error', progress: msg };
    await setWebDavConfig({ lastSyncError: msg });
    console.error('[WebDAV] Connection test failed', err);
    throw err;
  }
}

// ── Connection ─────────────────────────────────────────────

export async function connectWebDav(
  updates: Pick<WebDavConfig, 'host' | 'username' | 'password' | 'path' | 'syncInterval' | 'maxBackups'>,
): Promise<void> {
  const config = getWebDavConfig();
  const deviceId = config.deviceId || generateId();
  const nextConfig: WebDavConfig = {
    ...config,
    ...updates,
    deviceId,
    lastSyncError: '',
  };

  await setWebDavConfig(nextConfig);
  try {
    await testWebDavConnection(toConnectionConfig(nextConfig));
    await setWebDavConfig({ enabled: true, lastSyncError: '' });
    currentWebDavState = { status: 'idle', progress: '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentWebDavState = { status: 'error', progress: msg };
    await setWebDavConfig({ lastSyncError: msg });
    console.error('[WebDAV] Connect failed', err);
    throw err;
  }
}

export async function disconnectWebDav(): Promise<void> {
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
  await syncWebDavAlarm(0);
  currentWebDavState = { status: 'idle', progress: '' };
}

// ── Backup ─────────────────────────────────────────────────

export async function backupToWebDav(): Promise<WebDavState> {
  const config = getWebDavConfig();

  if (currentWebDavState.status === 'syncing') {
    return currentWebDavState;
  }

  if (!config.enabled || !config.host) {
    currentWebDavState = { status: 'error', progress: 'WebDAV is not configured' };
    return currentWebDavState;
  }

  currentWebDavState = { status: 'syncing', progress: 'Backing up to WebDAV...' };

  try {
    log.info('WebDAV backup: exporting local data');
    const localData = await exportLocalData();
    const passphrase = await getWebDavPassphrase(config);
    const encrypted = await encrypt(localData, passphrase);
    const fileName = buildBackupFileName(config.deviceId || 'device');

    log.info('WebDAV backup: uploading encrypted payload', { fileName });
    await putWebDavFile(toConnectionConfig(config), fileName, JSON.stringify(encrypted));

    if (config.maxBackups > 0) {
      await pruneOldBackups(config);
    }

    await setWebDavConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    currentWebDavState = { status: 'idle', progress: '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentWebDavState = { status: 'error', progress: msg };
    log.error('WebDAV backup failed', err);
    console.error('[WebDAV] Backup failed', err);
    await setWebDavConfig({ lastSyncError: msg });
  }

  return currentWebDavState;
}

async function pruneOldBackups(config: WebDavConfig): Promise<void> {
  const files = await listWebDavFiles(toConnectionConfig(config));
  const deviceToken = `.${config.deviceId || 'device'}.`;
  const backupFiles = files
    .filter((file) => {
      return (
        file.fileName.startsWith(BACKUP_PREFIX) &&
        file.fileName.endsWith(BACKUP_SUFFIX) &&
        file.fileName.includes(deviceToken)
      );
    })
    .sort((a, b) => {
      const byModified = b.lastModified - a.lastModified;
      return byModified !== 0 ? byModified : b.fileName.localeCompare(a.fileName);
    });

  const filesToDelete = backupFiles.slice(config.maxBackups);
  for (const file of filesToDelete) {
    await deleteWebDavFileWithRetry(file.fileName, toConnectionConfig(config));
  }
}

async function deleteWebDavFileWithRetry(
  fileName: string,
  config: WebDavConnectionConfig,
  maxRetries = 3,
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deleteWebDavFile(config, fileName);
      log.debug('Deleted old WebDAV backup', { fileName, attempt });
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn('Failed to delete old WebDAV backup', { fileName, attempt, error: lastError.message });

      if (attempt < maxRetries) {
        const delay = attempt * 1000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  log.error('Failed to delete old WebDAV backup after retries', { fileName, error: lastError?.message });
  return false;
}

function buildBackupFileName(deviceId: string): string {
  return `${BACKUP_PREFIX}${formatTimestamp(new Date())}.${sanitizeFileToken(deviceId)}${BACKUP_SUFFIX}`;
}

function formatTimestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  return parts.map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0'))).join('');
}

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function getWebDavPassphrase(config: WebDavConfig): Promise<string> {
  if (config.encryptionPassword) {
    return `webdav-custom:${config.encryptionPassword}`;
  }

  // If no custom password, use the persistent backupKey
  if (config.backupKey) {
    return `webdav-key:${config.backupKey}`;
  }

  // Generate and save a new backupKey if it doesn't exist
  const newKey = generateId();
  log.info('Generating new WebDAV backup key');
  await setWebDavConfig({ backupKey: newKey });
  return `webdav-key:${newKey}`;
}

export async function listWebDavBackups(): Promise<WebDavFile[]> {
  const config = getWebDavConfig();
  if (!config.enabled || !config.host) {
    throw new Error('WebDAV is not configured');
  }
  const files = await listWebDavFiles(toConnectionConfig(config));
  return files.filter((file) => {
    return (
      file.fileName.startsWith(BACKUP_PREFIX) &&
      file.fileName.endsWith(BACKUP_SUFFIX)
    );
  });
}

export async function restoreFromWebDav(fileName: string): Promise<void> {
  const config = getWebDavConfig();
  if (!config.enabled || !config.host) {
    throw new Error('WebDAV is not configured');
  }

  currentWebDavState = { status: 'syncing', progress: `Downloading backup ${fileName}...` };
  try {
    log.info('WebDAV restore: downloading backup file', { fileName });
    const content = await getWebDavFile(toConnectionConfig(config), fileName);
    
    currentWebDavState = { status: 'syncing', progress: 'Decrypting backup...' };
    log.info('WebDAV restore: decrypting payload');
    const encryptedPayload = JSON.parse(content);
    const passphrase = await getWebDavPassphrase(config);
    const localData = await decrypt(encryptedPayload, passphrase);
    
    currentWebDavState = { status: 'syncing', progress: 'Restoring local data...' };
    log.info('WebDAV restore: applying data');
    await applyFullData(localData);

    currentWebDavState = { status: 'idle', progress: '' };
    log.info('WebDAV restore: completed successfully');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentWebDavState = { status: 'error', progress: msg };
    log.error('WebDAV restore failed', err);
    console.error('[WebDAV] Restore failed', err);
    throw err;
  }
}

export async function deleteWebDavBackup(fileName: string): Promise<void> {
  const config = getWebDavConfig();
  if (!config.enabled || !config.host) {
    throw new Error('WebDAV is not configured');
  }
  log.info('WebDAV delete backup: deleting file', { fileName });
  await deleteWebDavFile(toConnectionConfig(config), fileName);
}

function toConnectionConfig(config: WebDavConfig): WebDavConnectionConfig {
  return {
    host: config.host,
    username: config.username,
    password: config.password,
    path: config.path,
  };
}

// ── Alarm Handler ──────────────────────────────────────────

export async function handleWebDavSyncAlarm(): Promise<void> {
  if (!isWebDavEnabled()) {
    log.debug('WebDAV sync alarm fired but WebDAV is disabled');
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    log.debug('WebDAV sync alarm fired but navigator is offline, skipping');
    return;
  }

  const { host } = getWebDavConfig();
  if (!host) {
    log.debug('WebDAV sync alarm fired but no host configured');
    return;
  }

  log.info('WebDAV sync alarm: triggering backup');
  try {
    await backupToWebDav();
  } catch (err) {
    log.error('WebDAV auto-backup failed', err);
  }
}

// ── Alarm Management ───────────────────────────────────────

async function syncWebDavAlarm(interval: WebDavConfig['syncInterval']): Promise<void> {
  if (interval === 0) {
    await chrome.alarms.clear(ALARM_WEBDAV_SYNC);
    return;
  }

  const existing = await chrome.alarms.get(ALARM_WEBDAV_SYNC);
  if (existing?.periodInMinutes && Math.abs(existing.periodInMinutes - interval) < 0.01) return;

  await chrome.alarms.create(ALARM_WEBDAV_SYNC, { periodInMinutes: interval });
}

// ── Initialization ─────────────────────────────────────────

let webDavSyncInitialized = false;

export function resetWebDavSyncInit(): void {
  webDavSyncInitialized = false;
  currentWebDavState = { status: 'idle', progress: '' };
}

export async function initWebDavSync(): Promise<void> {
  if (webDavSyncInitialized) return;
  webDavSyncInitialized = true;

  const config = getWebDavConfig();
  if (config.enabled) {
    await syncWebDavAlarm(config.syncInterval);
  }

  onWebDavConfigChange((newConfig) => {
    if (newConfig.enabled) {
      syncWebDavAlarm(newConfig.syncInterval).catch((err) => {
        log.warn('Failed to sync WebDAV alarm', err);
      });
    } else {
      syncWebDavAlarm(0).catch((err) => {
        log.warn('Failed to clear WebDAV alarm', err);
      });
    }
  });
}
