import { STORAGE_KEYS, DEFAULT_SYNC_CONFIG } from '@shared/constants';
import type { SyncConfig } from './sync-types';

let syncConfig: SyncConfig = { ...DEFAULT_SYNC_CONFIG };
let hydratePromise: Promise<void> | null = null;
const listeners: Array<(config: SyncConfig) => void> = [];

// ── Hydration ───────────────────────────────────────────────

// A message or alarm can wake a dormant service worker and reach this store
// before the top-level initSyncStore() finishes loading from storage. Every
// async entry point must await this before reading or merging the in-memory
// config — otherwise it operates on (and setSyncConfig would persist) the
// un-hydrated defaults, silently disconnecting Drive sync. All callers share
// one load promise (same pattern as session-manager's ensureHydrated) so a
// late-resolving load cannot overwrite an interleaved mutation.
export function ensureSyncStoreHydrated(): Promise<void> {
  hydratePromise ??= (async () => {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_CONFIG);
    const stored = result[STORAGE_KEYS.SYNC_CONFIG] as SyncConfig | undefined;
    syncConfig = stored ? { ...DEFAULT_SYNC_CONFIG, ...stored } : { ...DEFAULT_SYNC_CONFIG };
    notifyListeners();
  })();
  return hydratePromise;
}

// ── Getters ─────────────────────────────────────────────────

export function getSyncConfig(): SyncConfig {
  return syncConfig;
}

export async function getSyncConfigHydrated(): Promise<SyncConfig> {
  await ensureSyncStoreHydrated();
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
  // Merge on top of the persisted config, never the un-hydrated default — a
  // SYNC_CONFIGURE that wakes the SW must not wipe enabled/googleId/deviceId.
  await ensureSyncStoreHydrated();
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
  hydratePromise = null;
  syncConfig = { ...DEFAULT_SYNC_CONFIG };
}

export async function initSyncStore(): Promise<void> {
  await ensureSyncStoreHydrated();

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
