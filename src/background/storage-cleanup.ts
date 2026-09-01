import type {
  StorageCleanupCategory,
  StorageCleanupItem,
  StorageCleanupResult,
  StorageCleanupScanOptions,
  StorageCleanupTarget,
  StorageSnapshot,
} from '@shared/types';
import { storageStore } from './storage-store';
import { listSessions } from './session-manager';

const encoder = new TextEncoder();

function serializedBytes(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

function itemId(
  sessionId: string,
  origin: string,
  category: StorageCleanupCategory,
  key: string,
): string {
  return `${sessionId}\0${origin}\0${category}\0${key}`;
}

function targetSize(snapshot: StorageSnapshot, target: StorageCleanupTarget): number {
  if (target.category === 'indexedDB') {
    const database = snapshot.indexedDB?.find((entry) => entry.name === target.key);
    return database ? serializedBytes(database) : 0;
  }
  const value = snapshot[target.category][target.key];
  return value === undefined ? 0 : serializedBytes({ [target.key]: value });
}

export async function scanLargeStorage(
  options: StorageCleanupScanOptions,
): Promise<StorageCleanupResult> {
  const [snapshots, sessions] = await Promise.all([storageStore.getAllSnapshots(), listSessions()]);
  const sessionNames = new Map(sessions.map((session) => [session.id, session.name]));
  const categories = new Set(options.categories);
  const items: StorageCleanupItem[] = [];

  for (const snapshot of snapshots) {
    const sessionName = sessionNames.get(snapshot.sessionId);
    if (!sessionName) continue;

    if (categories.has('localStorage')) {
      for (const [key, value] of Object.entries(snapshot.localStorage)) {
        const sizeBytes = serializedBytes({ [key]: value });
        if (sizeBytes < options.minBytes) continue;
        items.push({
          id: itemId(snapshot.sessionId, snapshot.origin, 'localStorage', key),
          sessionId: snapshot.sessionId,
          sessionName,
          origin: snapshot.origin,
          category: 'localStorage',
          key,
          sizeBytes,
        });
      }
    }

    if (categories.has('sessionStorage')) {
      for (const [key, value] of Object.entries(snapshot.sessionStorage)) {
        const sizeBytes = serializedBytes({ [key]: value });
        if (sizeBytes < options.minBytes) continue;
        items.push({
          id: itemId(snapshot.sessionId, snapshot.origin, 'sessionStorage', key),
          sessionId: snapshot.sessionId,
          sessionName,
          origin: snapshot.origin,
          category: 'sessionStorage',
          key,
          sizeBytes,
        });
      }
    }

    if (categories.has('indexedDB')) {
      for (const database of snapshot.indexedDB ?? []) {
        const sizeBytes = serializedBytes(database);
        if (sizeBytes < options.minBytes) continue;
        items.push({
          id: itemId(snapshot.sessionId, snapshot.origin, 'indexedDB', database.name),
          sessionId: snapshot.sessionId,
          sessionName,
          origin: snapshot.origin,
          category: 'indexedDB',
          key: database.name,
          sizeBytes,
        });
      }
    }
  }

  items.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return {
    items,
    scannedSnapshots: snapshots.length,
    totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
  };
}

export async function cleanStorageItems(
  targets: StorageCleanupTarget[],
): Promise<{ removed: number; reclaimedBytes: number }> {
  const groups = new Map<string, StorageCleanupTarget[]>();
  for (const target of targets) {
    const groupKey = `${target.sessionId}\0${target.origin}`;
    const existing = groups.get(groupKey);
    if (existing) existing.push(target);
    else groups.set(groupKey, [target]);
  }

  let removed = 0;
  let reclaimedBytes = 0;

  for (const groupTargets of groups.values()) {
    const first = groupTargets[0];
    const snapshot = await storageStore.load(first.sessionId, first.origin);
    if (!snapshot) continue;

    for (const target of groupTargets) {
      const sizeBytes = targetSize(snapshot, target);
      if (sizeBytes === 0) continue;

      if (target.category === 'indexedDB') {
        snapshot.indexedDB = (snapshot.indexedDB ?? []).filter(
          (database) => database.name !== target.key,
        );
      } else {
        const { [target.key]: _, ...rest } = snapshot[target.category];
        snapshot[target.category] = rest;
      }
      removed++;
      reclaimedBytes += sizeBytes;
    }

    const empty =
      Object.keys(snapshot.localStorage).length === 0 &&
      Object.keys(snapshot.sessionStorage).length === 0 &&
      (snapshot.indexedDB?.length ?? 0) === 0;
    if (empty) await storageStore.deleteForOrigin(snapshot.sessionId, snapshot.origin);
    else await storageStore.save({ ...snapshot, timestamp: Date.now() });
  }

  return { removed, reclaimedBytes };
}
