import { ALARM_DRIVE_SYNC } from '@shared/constants';
import { getSyncConfigHydrated, onSyncConfigChange, setSyncConfig } from '@shared/sync/sync-store';
import { executeSyncCycle, SyncConcurrencyError } from '@shared/sync/sync-engine';
import type { RemoteDataCache } from '@shared/sync/sync-engine';
import type { SyncState, SyncInterval, ConflictEntry } from '@shared/sync/sync-types';
import { createLogger } from '@shared/logger';

const log = createLogger('drive-sync');

// ── In-Memory State (volatile, lost on SW restart) ─────────

// Remote snapshot paired with the conflict set currently awaiting the user;
// populated whenever a cycle returns 'conflict' so the resolution cycle
// applies the user's choices against the exact data it detected them on.
let cachedRemote: RemoteDataCache | null = null;
let currentSyncState: SyncState = { status: 'idle', progress: '', conflicts: [] };
// Serializes sync cycles: concurrent triggers coalesce into the running
// cycle and conflict resolution queues behind it. Interleaved cycles would
// race applyFullData (delete-all → batch-set → snapshot writes) against each
// other and corrupt local state.
let syncInFlight: Promise<SyncState> | null = null;

// ── State ──────────────────────────────────────────────────

export function getSyncState(): SyncState {
  return currentSyncState;
}

// ── Core Cycle Runner ──────────────────────────────────────

async function runSyncCycle(resolutions?: ConflictEntry[]): Promise<SyncState> {
  // Hydrated read: a SYNC_NOW message or the sync alarm can wake a dormant
  // SW before the top-level init loaded the config from storage.
  const { googleId } = await getSyncConfigHydrated();
  if (!googleId) {
    currentSyncState = {
      status: 'error',
      progress: 'Google ID not available — reconnect Drive',
      conflicts: [],
    };
    return currentSyncState;
  }

  currentSyncState = {
    status: 'syncing',
    progress: resolutions ? 'Applying resolutions...' : 'Starting sync...',
    conflicts: [],
  };

  // The cache belongs to the conflict set the user is resolving — a plain
  // sync must re-download remote state instead of reusing it.
  const cache = resolutions ? cachedRemote : null;
  cachedRemote = null;

  try {
    let result;
    try {
      result = await executeSyncCycle(googleId, resolutions, cache);
    } catch (err) {
      if (!(err instanceof SyncConcurrencyError)) throw err;
      // Another device wrote mid-cycle — retry once against fresh remote
      // state (dropping the now-stale cache). A second collision surfaces as
      // an error and the next alarm/manual sync tries again.
      log.info('Sync: remote changed mid-cycle, retrying once');
      result = await executeSyncCycle(googleId, resolutions, null);
    }
    const { remoteCache, ...state } = result;
    currentSyncState = state;
    cachedRemote = state.status === 'conflict' ? (remoteCache ?? null) : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    currentSyncState = { status: 'error', progress: msg, conflicts: [] };
    log.error('Sync failed', err);
    await setSyncConfig({ lastSyncError: msg });
  }

  return currentSyncState;
}

// ── Sync Triggers ──────────────────────────────────────────

export async function triggerSync(): Promise<SyncState> {
  // Coalesce: a trigger while a cycle runs awaits that cycle instead of
  // interleaving a second one.
  if (syncInFlight) return syncInFlight;

  syncInFlight = runSyncCycle().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export async function resolveConflicts(resolutions: ConflictEntry[]): Promise<SyncState> {
  // Queue behind any running cycle — the user's resolutions must run their
  // own cycle, not be coalesced away. runSyncCycle never rejects (errors
  // become an error state), so awaiting is safe.
  while (syncInFlight) {
    await syncInFlight;
  }

  syncInFlight = runSyncCycle(resolutions).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

// ── Alarm Handler ──────────────────────────────────────────

export async function handleDriveSyncAlarm(): Promise<void> {
  // The alarm normally wakes a dormant SW: load the config from storage
  // before the enabled check, or this reads the un-hydrated default
  // (disabled) and silently skips every scheduled sync.
  const config = await getSyncConfigHydrated();

  if (!config.enabled) {
    log.debug('Drive sync alarm fired but sync is disabled');
    return;
  }

  if (!config.googleId) {
    log.debug('Drive sync alarm fired but no Google ID configured');
    return;
  }

  // Don't start a cycle under an open conflict dialog — it would replace the
  // conflict set (and cached remote snapshot) the user is resolving.
  if (currentSyncState.status === 'conflict') {
    log.debug('Drive sync alarm skipped — conflict resolution pending');
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
  cachedRemote = null;
  syncInFlight = null;
  currentSyncState = { status: 'idle', progress: '', conflicts: [] };
}

export async function initDriveSync(): Promise<void> {
  if (driveSyncInitialized) return;
  driveSyncInitialized = true;

  const config = await getSyncConfigHydrated();
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
