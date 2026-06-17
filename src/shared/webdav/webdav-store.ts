import { DEFAULT_WEBDAV_CONFIG, STORAGE_KEYS } from '@shared/constants';
import type { WebDavConfig } from './webdav-types';

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

function obfuscate(str: string | undefined): string | undefined {
  if (!str) return str;
  const chars = str.split('').map((char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
  );
  return OBFUSCATION_PREFIX + btoa(unescape(encodeURIComponent(chars.join(''))));
}

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

// ── Setter ──────────────────────────────────────────────────

export async function setWebDavConfig(updates: Partial<WebDavConfig>): Promise<void> {
  const newConfig = { ...webDavConfig, ...updates };
  const toSave = { ...newConfig };

  // Obfuscate sensitive fields before saving
  if (toSave.password) toSave.password = obfuscate(toSave.password);
  if (toSave.encryptionPassword) toSave.encryptionPassword = obfuscate(toSave.encryptionPassword);

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
  const result = await chrome.storage.local.get(STORAGE_KEYS.WEBDAV_CONFIG);
  const stored = result[STORAGE_KEYS.WEBDAV_CONFIG] as WebDavConfig | undefined;

  if (stored) {
    // Deobfuscate sensitive fields after loading
    if (stored.password) stored.password = deobfuscate(stored.password);
    if (stored.encryptionPassword) stored.encryptionPassword = deobfuscate(stored.encryptionPassword);
    webDavConfig = { ...DEFAULT_WEBDAV_CONFIG, ...stored };
  } else {
    webDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
  }

  notifyListeners();

  if (initialized) return;
  initialized = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (STORAGE_KEYS.WEBDAV_CONFIG in changes) {
      const updated = changes[STORAGE_KEYS.WEBDAV_CONFIG].newValue as WebDavConfig | undefined;
      if (updated) {
        if (updated.password) updated.password = deobfuscate(updated.password);
        if (updated.encryptionPassword) updated.encryptionPassword = deobfuscate(updated.encryptionPassword);
        webDavConfig = { ...DEFAULT_WEBDAV_CONFIG, ...updated };
      } else {
        webDavConfig = { ...DEFAULT_WEBDAV_CONFIG };
      }
      notifyListeners();
    }
  });
}
