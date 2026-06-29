import { DEFAULT_WEBDAV_CONFIG, STORAGE_KEYS } from '@shared/constants';
import type { WebDavConfig } from './webdav-types';

// Device-specific fields that should NOT be synced
const DEVICE_ONLY_FIELDS: Array<keyof WebDavConfig> = [
  'deviceId',
  'lastSyncAt',
  'lastSyncError',
];

let webDavConfig: WebDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
const listeners: Array<(config: WebDavConfig) => void> = [];

// ── Getters ─────────────────────────────────────────────────

export function getWebDavConfig(): WebDavConfig {
  return webDavConfig;
}

export function isWebDavEnabled(): boolean {
  return webDavConfig.enabled;
}

// ── Listeners ───────────────────────────────────────────────

export function onWebDavConfigChange(listener: (config: WebDavConfig) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(webDavConfig);
  }
}

// ── Encryption/Obfuscation ───────────────────────────────────

const OBFUSCATION_PREFIX = 'obf:';
const OBFUSCATION_KEY = 'unaware-sessions-webdav-salt';

function obfuscate(str: string): string;
function obfuscate(str: undefined): undefined;
function obfuscate(str: string | undefined): string | undefined {
  if (!str) return str;
  const chars = str.split('').map((char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
  );
  return OBFUSCATION_PREFIX + btoa(unescape(encodeURIComponent(chars.join(''))));
}

function deobfuscate(str: string): string;
function deobfuscate(str: undefined): undefined;
function deobfuscate(str: string | undefined): string | undefined {
  if (!str) return str;
  if (!str.startsWith(OBFUSCATION_PREFIX)) return str; // Migration: return as is if not obfuscated

  try {
    const base64 = str.slice(OBFUSCATION_PREFIX.length);
    const decoded = decodeURIComponent(escape(atob(base64)));
    return decoded.split('').map((char, i) =>
      String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
    ).join('');
  } catch (err) {
    console.warn('Failed to deobfuscate string', err);
    return str;
  }
}

// ── Sync Helpers ────────────────────────────────────────────

function buildSyncPayload(config: WebDavConfig): Partial<WebDavConfig> {
  const payload: Partial<WebDavConfig> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!DEVICE_ONLY_FIELDS.includes(key as keyof WebDavConfig)) {
      (payload as Record<string, unknown>)[key] = value;
    }
  }
  return payload;
}

export async function saveWebDavConfigToSync(): Promise<void> {
  try {
    const payload = buildSyncPayload(webDavConfig);
    await chrome.storage.sync.set({
      [STORAGE_KEYS.WEBDAV_CONFIG]: payload,
    });
  } catch (err) {
    console.warn('[WebDAV] Failed to save config to storage.sync', err);
  }
}

export async function loadWebDavConfigFromSync(): Promise<boolean> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.WEBDAV_CONFIG);
    const syncConfig = result[STORAGE_KEYS.WEBDAV_CONFIG] as Partial<WebDavConfig> | undefined;

    if (!syncConfig || !syncConfig.host) {
      return false;
    }

    // Merge synced config into current config (keep device-only fields)
    const newConfig = {
      ...webDavConfig,
      ...syncConfig,
      deviceId: webDavConfig.deviceId, // Keep local deviceId
    };

    await setWebDavConfig(newConfig);
    return true;
  } catch (err) {
    console.warn('[WebDAV] Failed to load config from storage.sync', err);
    return false;
  }
}

// ── Setter ──────────────────────────────────────────────────

export async function setWebDavConfig(updates: Partial<WebDavConfig>): Promise<void> {
  const newConfig = { ...webDavConfig, ...updates };
  const toSave = { ...newConfig };

  // Obfuscate sensitive fields before saving to local storage
  if (toSave.password) toSave.password = obfuscate(toSave.password) as string;
  if (toSave.encryptionPassword) toSave.encryptionPassword = obfuscate(toSave.encryptionPassword) as string;
  if (toSave.backupKey) toSave.backupKey = obfuscate(toSave.backupKey) as string;

  webDavConfig = newConfig; // Keep plain text in memory
  await chrome.storage.local.set({
    [STORAGE_KEYS.WEBDAV_CONFIG]: toSave,
  });
  notifyListeners();
}

// ── Initialization ──────────────────────────────────────────

let initialized = false;

export function resetWebDavStoreInit(): void {
  initialized = false;
  webDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
}

export async function initWebDavStore(): Promise<void> {
  // Load from local storage, fallback to sync for first-time setup
  const [localResult, syncResult] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.WEBDAV_CONFIG),
    chrome.storage.sync.get(STORAGE_KEYS.WEBDAV_CONFIG),
  ]);

  const localStored = localResult[STORAGE_KEYS.WEBDAV_CONFIG] as WebDavConfig | undefined;
  const syncStored = syncResult[STORAGE_KEYS.WEBDAV_CONFIG] as Partial<WebDavConfig> | undefined;

  if (localStored) {
    // Deobfuscate sensitive fields after loading
    if (localStored.password) localStored.password = deobfuscate(localStored.password) as string;
    if (localStored.encryptionPassword) localStored.encryptionPassword = deobfuscate(localStored.encryptionPassword) as string;
    if (localStored.backupKey) localStored.backupKey = deobfuscate(localStored.backupKey) as string;
    webDavConfig = { ...DEFAULT_WEBDAV_CONFIG, ...localStored };
  } else if (syncStored?.enabled && syncStored.host) {
    // First time on this device: use synced config
    webDavConfig = { ...DEFAULT_WEBDAV_CONFIG, ...syncStored };
    await chrome.storage.local.set({
      [STORAGE_KEYS.WEBDAV_CONFIG]: webDavConfig,
    });
  } else {
    webDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
  }

  notifyListeners();

  if (initialized) return;
  initialized = true;

  // Listen for local storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_KEYS.WEBDAV_CONFIG in changes) {
      const updated = changes[STORAGE_KEYS.WEBDAV_CONFIG].newValue as WebDavConfig | undefined;
      if (updated) {
        if (updated.password) updated.password = deobfuscate(updated.password) as string;
        if (updated.encryptionPassword) updated.encryptionPassword = deobfuscate(updated.encryptionPassword) as string;
        if (updated.backupKey) updated.backupKey = deobfuscate(updated.backupKey) as string;
        webDavConfig = { ...DEFAULT_WEBDAV_CONFIG, ...updated };
      } else {
        webDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
      }
      notifyListeners();
    }

    // Listen for sync changes from other devices
    if (area === 'sync' && STORAGE_KEYS.WEBDAV_CONFIG in changes) {
      const syncUpdated = changes[STORAGE_KEYS.WEBDAV_CONFIG].newValue as Partial<WebDavConfig> | undefined;
      if (syncUpdated?.enabled && syncUpdated.host) {
        // Merge synced config into current config (keep device-only fields)
        webDavConfig = {
          ...webDavConfig,
          ...syncUpdated,
          deviceId: webDavConfig.deviceId, // Keep local deviceId
        };
        // Persist to local storage
        chrome.storage.local.set({
          [STORAGE_KEYS.WEBDAV_CONFIG]: webDavConfig,
        }).catch((err) => {
          console.warn('[WebDAV] Failed to persist synced config', err);
        });
        notifyListeners();
      }
    }
  });
}
