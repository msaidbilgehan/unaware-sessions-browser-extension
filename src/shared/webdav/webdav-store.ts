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

// ── Setter ──────────────────────────────────────────────────

export async function setWebDavConfig(updates: Partial<WebDavConfig>): Promise<void> {
  webDavConfig = { ...webDavConfig, ...updates };
  await chrome.storage.local.set({
    [STORAGE_KEYS.WEBDAV_CONFIG]: webDavConfig,
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
  webDavConfig = stored ? { ...DEFAULT_WEBDAV_CONFIG, ...stored } : { ...DEFAULT_WEBDAV_CONFIG };

  notifyListeners();

  if (initialized) return;
  initialized = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (STORAGE_KEYS.WEBDAV_CONFIG in changes) {
      const updated = changes[STORAGE_KEYS.WEBDAV_CONFIG].newValue as WebDavConfig | undefined;
      webDavConfig = updated ? { ...DEFAULT_WEBDAV_CONFIG, ...updated } : { ...DEFAULT_WEBDAV_CONFIG };
      notifyListeners();
    }
  });
}
