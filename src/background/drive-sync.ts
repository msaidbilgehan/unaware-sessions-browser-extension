import { ALARM_DRIVE_SYNC } from '@shared/constants';
import { getSyncConfig, isSyncEnabled, onSyncConfigChange, setSyncConfig } from '@shared/sync/sync-store';
import { executeSyncCycle } from '@shared/sync/sync-engine';
import type { SyncState, SyncInterval, ConflictEntry } from '@shared/sync/sync-types';
import type { FullExportData } from '@shared/types';
import { createLogger } from '@shared/logger';

const log = createLogger('drive-sync');

// ── In-Memory State (volatile, lost on SW restart) ─────────

let cachedRemoteData: FullExportData | null = null;
let currentSyncState: SyncState = { status: 'idle', progress: '', conflicts: [] };

// ── State ──────────────────────────────────────────────────

export function getSyncState(): SyncState {
  return currentSyncState;
}

// ── Sync Triggers ──────────────────────────────────────────

export async function triggerSync(): Promise<SyncState> {
  const { googleId } = getSyncConfig();
  if (!googleId) {
    currentSyncState = { status: 'error', progress: 'Google ID not available — reconnect Drive', conflicts: [] };
    return currentSyncState;
  }

  if (currentSyncState.status === 'syncing') {
    return currentSyncState;
  }

  currentSyncState = { status: 'syncing', progress: 'Starting sync...', conflicts: [] };
  cachedRemoteData = null;

  try {
    const result = await executeSyncCycle(googleId);
    currentSyncState = result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentSyncState = { status: 'error', progress: msg, conflicts: [] };
    log.error('Sync failed', err);
    await setSyncConfig({ lastSyncError: msg });
  }

  return currentSyncState;
}

export async function resolveConflicts(resolutions: ConflictEntry[]): Promise<SyncState> {
  const { googleId } = getSyncConfig();
  if (!googleId) {
    currentSyncState = { status: 'error', progress: 'Google ID not available — reconnect Drive', conflicts: [] };
    return currentSyncState;
  }

  currentSyncState = { status: 'syncing', progress: 'Applying resolutions...', conflicts: [] };

  try {
    const result = await executeSyncCycle(googleId, resolutions, cachedRemoteData);
    currentSyncState = result;
    cachedRemoteData = null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentSyncState = { status: 'error', progress: msg, conflicts: [] };
    log.error('Sync conflict resolution failed', err);
    await setSyncConfig({ lastSyncError: msg });
  }

  return currentSyncState;
}

// ── Alarm Handler ──────────────────────────────────────────

export async function handleDriveSyncAlarm(): Promise<void> {
  if (!isSyncEnabled()) {
    log.debug('Drive sync alarm fired but sync is disabled');
    return;
  }

  const { googleId } = getSyncConfig();
  if (!googleId) {
    log.debug('Drive sync alarm fired but no Google ID configured');
    return;
  }

  log.info('Drive sync alarm: triggering sync');
  await triggerSync();
}

// ── Alarm Management ───────────────────────────────────────

async function syncAlarm(interval: SyncInterval): Promise<void> {
  if (interval === 0) {
    await chrome.alarms.clear(ALARM_DRIVE_SYNC);
    return;
  }

  const existing = await chrome.alarms.get(ALARM_DRIVE_SYNC);
  if (existing?.periodInMinutes && Math.abs(existing.periodInMinutes - interval) < 0.01) return;

  await chrome.alarms.create(ALARM_DRIVE_SYNC, { periodInMinutes: interval });
}

// ── Initialization ─────────────────────────────────────────

let driveSyncInitialized = false;

export function resetDriveSyncInit(): void {
  driveSyncInitialized = false;
  cachedRemoteData = null;
  currentSyncState = { status: 'idle', progress: '', conflicts: [] };
}

export async function initDriveSync(): Promise<void> {
  if (driveSyncInitialized) return;
  driveSyncInitialized = true;

  const config = getSyncConfig();
  if (config.enabled) {
    await syncAlarm(config.syncInterval);
  }

  onSyncConfigChange((newConfig) => {
    if (newConfig.enabled) {
      syncAlarm(newConfig.syncInterval).catch((err) => {
        log.warn('Failed to sync alarm', err);
      });
    } else {
      syncAlarm(0).catch((err) => {
        log.warn('Failed to clear alarm', err);
      });
    }
  });
}
