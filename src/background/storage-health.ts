import type { StorageHealth, StorageWriteErrorEntry } from '@shared/types';
import { STORAGE_KEYS, STORAGE_WRITE_ERROR_MAX_SIZE } from '@shared/constants';
import { getLocal, setLocal } from '@shared/storage';
import { createLogger } from '@shared/logger';
import { now } from '@shared/utils';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { snapshotUndo } from './snapshot-undo';
import { isQuotaError } from './idb-support';
import { listSessions } from './session-manager';

const log = createLogger('storage-health');

/**
 * Snapshot writes used to fail silently.
 *
 * Cookie and DOM-storage snapshots live in extension IndexedDB, which sits in
 * a quota-managed bucket — unlike chrome.storage.local, where the session
 * profiles live. A rejected write (quota exhausted, aborted transaction,
 * evicted database) was caught by the caller and downgraded to a warning, so
 * with the default 'off' log level a session could stop being saved for days
 * without a single visible symptom until a switch restored nothing.
 *
 * Failures are recorded here instead: persisted, bounded, and surfaced by the
 * Debug tab's Storage Health card.
 */
export async function recordStorageWriteError(
  operation: string,
  sessionId: string,
  origin: string,
  err: unknown,
): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err);
  const quotaExceeded = isQuotaError(err);

  log.error(`${operation} failed for ${origin}`, {
    sessionId,
    origin,
    reason,
    quotaExceeded,
  });

  try {
    const existing =
      (await getLocal<StorageWriteErrorEntry[]>(STORAGE_KEYS.STORAGE_WRITE_ERRORS)) ?? [];
    const entry: StorageWriteErrorEntry = {
      timestamp: now(),
      operation,
      sessionId,
      origin,
      reason,
      quotaExceeded,
    };
    const next = [...existing, entry].slice(-STORAGE_WRITE_ERROR_MAX_SIZE);
    await setLocal(STORAGE_KEYS.STORAGE_WRITE_ERRORS, next);
  } catch (persistErr) {
    // chrome.storage.local is the fallback of last resort; if it is failing
    // too, the log entry above is all we can keep.
    log.warn('Failed to persist storage write error', persistErr);
  }
}

export async function getStorageWriteErrors(): Promise<StorageWriteErrorEntry[]> {
  return (await getLocal<StorageWriteErrorEntry[]>(STORAGE_KEYS.STORAGE_WRITE_ERRORS)) ?? [];
}

export async function clearStorageWriteErrors(): Promise<void> {
  await setLocal(STORAGE_KEYS.STORAGE_WRITE_ERRORS, [] as StorageWriteErrorEntry[]);
}

async function estimateStorage(): Promise<{
  usageBytes: number | null;
  quotaBytes: number | null;
}> {
  // StorageManager.estimate() is available in workers; persist() is not
  // (Window only), so the options page requests persistence instead.
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageBytes: usage ?? null, quotaBytes: quota ?? null };
  } catch (err) {
    log.warn('Failed to estimate storage', err);
    return { usageBytes: null, quotaBytes: null };
  }
}

export async function getStorageHealth(): Promise<StorageHealth> {
  const [cookieRecords, storageRecords, undoRecords, sessions, estimate, writeErrors] =
    await Promise.all([
      cookieStore.countAll(),
      storageStore.countAll(),
      snapshotUndo.countAll(),
      listSessions(),
      estimateStorage(),
      getStorageWriteErrors(),
    ]);

  return {
    cookieRecords,
    storageRecords,
    undoRecords,
    sessionProfiles: sessions.length,
    usageBytes: estimate.usageBytes,
    quotaBytes: estimate.quotaBytes,
    writeErrors,
  };
}

/**
 * Log the snapshot inventory on every service worker start.
 *
 * "Every session profile survived but every snapshot is gone" is the exact
 * signature of the quota bucket being evicted, and it is invisible without a
 * baseline to compare against. One line per SW start makes the drop
 * attributable to a point in time after the fact.
 */
export async function logStorageInventory(): Promise<void> {
  try {
    const health = await getStorageHealth();
    const level = health.sessionProfiles > 0 && health.cookieRecords === 0 ? 'error' : 'info';
    const message =
      level === 'error'
        ? 'Snapshot inventory: no cookie snapshots for existing sessions (data lost or unreadable)'
        : 'Snapshot inventory';
    log[level](message, {
      cookieRecords: health.cookieRecords,
      storageRecords: health.storageRecords,
      sessionProfiles: health.sessionProfiles,
      usageBytes: health.usageBytes,
      quotaBytes: health.quotaBytes,
    });
  } catch (err) {
    log.error('Failed to read snapshot inventory', err);
  }
}
