import { STORAGE_KEYS, DEFAULT_SYNC_CONFIG } from '@shared/constants';
import type { SyncConfig } from './sync-types';

let syncConfig: SyncConfig = { ...DEFAULT_SYNC_CONFIG };
const listeners: Array<(config: SyncConfig) => void> = [];

// ── Getters ─────────────────────────────────────────────────

export function getSyncConfig(): SyncConfig {
  return syncConfig;
}

export function isSyncEnabled(): boolean {
  return syncConfig.enabled;
}

// ── Listeners ───────────────────────────────────────────────

export function onSyncConfigChange(listener: (config: SyncConfig) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(syncConfig);
  }
}

// ── Setter ──────────────────────────────────────────────────

export async function setSyncConfig(updates: Partial<SyncConfig>): Promise<void> {
  syncConfig = { ...syncConfig, ...updates };
  await chrome.storage.local.set({
    [STORAGE_KEYS.SYNC_CONFIG]: syncConfig,
  });
  notifyListeners();
}

// ── Initialization ──────────────────────────────────────────

let initialized = false;

export function resetSyncStoreInit(): void {
  initialized = false;
  syncConfig = { ...DEFAULT_SYNC_CONFIG };
}

export async function initSyncStore(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_CONFIG);
  const stored = result[STORAGE_KEYS.SYNC_CONFIG] as SyncConfig | undefined;
  syncConfig = stored ? { ...DEFAULT_SYNC_CONFIG, ...stored } : { ...DEFAULT_SYNC_CONFIG };

  notifyListeners();

  if (initialized) return;
  initialized = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (STORAGE_KEYS.SYNC_CONFIG in changes) {
      const updated = changes[STORAGE_KEYS.SYNC_CONFIG].newValue as SyncConfig | undefined;
      syncConfig = updated ? { ...DEFAULT_SYNC_CONFIG, ...updated } : { ...DEFAULT_SYNC_CONFIG };
      notifyListeners();
    }
  });
}
