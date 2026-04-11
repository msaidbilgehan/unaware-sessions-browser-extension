import type { FullExportData, CookieSnapshot, StorageSnapshot, SessionProfile } from '@shared/types';
import type {
  SyncManifest,
  SyncState,
  ConflictEntry,
  MergeStrategy,
  EncryptedPayload,
} from './sync-types';
import { sha256Hex, encrypt, decrypt } from './crypto-engine';
import { findFile, createFile, updateFile, downloadFile, getToken } from './drive-client';
import { getSyncConfig, setSyncConfig } from './sync-store';
import { listSessions, deleteAllSessions, batchSetSessions } from '@background/session-manager';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import { createLogger } from '@shared/logger';

const log = createLogger('sync-engine');

const MANIFEST_FILENAME = 'unaware-sync-manifest.json';
const PAYLOAD_FILENAME = 'unaware-sync-payload.json';

// ── Manifest Building ──────────────────────────────────────

export async function buildLocalManifest(
  data: FullExportData,
  deviceId: string,
): Promise<SyncManifest> {
  const originMap = new Map<string, { cookieHash?: string; storageHash?: string }>();

  await Promise.all(
    data.cookieSnapshots.map(async (snap) => {
      const key = `${snap.sessionId}:${snap.origin}`;
      const hash = await sha256Hex(JSON.stringify(snap));
      const entry = originMap.get(key) ?? {};
      entry.cookieHash = hash;
      originMap.set(key, entry);
    }),
  );

  await Promise.all(
    data.storageSnapshots.map(async (snap) => {
      const key = `${snap.sessionId}:${snap.origin}`;
      const hash = await sha256Hex(JSON.stringify(snap));
      const entry = originMap.get(key) ?? {};
      entry.storageHash = hash;
      originMap.set(key, entry);
    }),
  );

  const checksums: Record<string, string> = {};
  await Promise.all(
    Array.from(originMap.entries()).map(async ([key, entry]) => {
      checksums[key] = await sha256Hex(`${entry.cookieHash ?? ''}:${entry.storageHash ?? ''}`);
    }),
  );

  const sessionChecksums: Record<string, string> = {};
  await Promise.all(
    data.sessions.map(async (session) => {
      sessionChecksums[session.id] = await sha256Hex(JSON.stringify(session));
    }),
  );

  return {
    version: 1,
    updatedAt: Date.now(),
    deviceId,
    checksums,
    sessionChecksums,
  };
}

// ── Conflict Detection ─────────────────────────────────────

export function detectConflicts(
  localManifest: SyncManifest,
  remoteManifest: SyncManifest,
  localData: FullExportData,
  remoteData: FullExportData,
): ConflictEntry[] {
  const allKeys = new Set([
    ...Object.keys(localManifest.checksums),
    ...Object.keys(remoteManifest.checksums),
  ]);

  const sessionNameMap = new Map<string, string>();
  for (const s of localData.sessions) sessionNameMap.set(s.id, s.name);
  for (const s of remoteData.sessions) {
    if (!sessionNameMap.has(s.id)) sessionNameMap.set(s.id, s.name);
  }

  // Build timestamp map in 2 passes instead of 4
  const timestampMap = new Map<string, { local: number; remote: number }>();

  function updateTimestamp(
    snaps: Array<{ sessionId: string; origin: string; timestamp: number }>,
    side: 'local' | 'remote',
  ): void {
    for (const snap of snaps) {
      const key = `${snap.sessionId}:${snap.origin}`;
      let entry = timestampMap.get(key);
      if (!entry) {
        entry = { local: 0, remote: 0 };
        timestampMap.set(key, entry);
      }
      entry[side] = Math.max(entry[side], snap.timestamp);
    }
  }

  updateTimestamp([...localData.cookieSnapshots, ...localData.storageSnapshots], 'local');
  updateTimestamp([...remoteData.cookieSnapshots, ...remoteData.storageSnapshots], 'remote');

  const conflicts: ConflictEntry[] = [];

  for (const key of allKeys) {
    const localChecksum = localManifest.checksums[key];
    const remoteChecksum = remoteManifest.checksums[key];

    if (localChecksum && remoteChecksum && localChecksum !== remoteChecksum) {
      const [sessionId, ...originParts] = key.split(':');
      const origin = originParts.join(':');
      const ts = timestampMap.get(key) ?? { local: 0, remote: 0 };

      conflicts.push({
        sessionId,
        sessionName: sessionNameMap.get(sessionId) ?? sessionId,
        origin,
        localTimestamp: ts.local,
        cloudTimestamp: ts.remote,
        resolution: null,
      });
    }
  }

  return conflicts;
}

// ── Data Merging ───────────────────────────────────────────

export function mergeData(
  localData: FullExportData,
  remoteData: FullExportData,
  strategy: MergeStrategy,
  resolutions?: ConflictEntry[],
): FullExportData {
  if (strategy === 'trust-cloud') {
    return { ...remoteData, exportedAt: Date.now() };
  }
  if (strategy === 'trust-local') {
    return { ...localData, exportedAt: Date.now() };
  }

  // "ask" strategy — per-origin merge
  const resolutionMap = new Map<string, 'local' | 'cloud'>();
  if (resolutions) {
    for (const r of resolutions) {
      if (r.resolution) {
        resolutionMap.set(`${r.sessionId}:${r.origin}`, r.resolution);
      }
    }
  }

  // Build local/remote lookup maps keyed by "sessionId:origin"
  const localCookieMap = buildSnapshotMap(localData.cookieSnapshots);
  const remoteCookieMap = buildSnapshotMap(remoteData.cookieSnapshots);
  const localStorageMap = buildSnapshotMap(localData.storageSnapshots);
  const remoteStorageMap = buildSnapshotMap(remoteData.storageSnapshots);

  const allOriginKeys = new Set([
    ...localCookieMap.keys(),
    ...remoteCookieMap.keys(),
    ...localStorageMap.keys(),
    ...remoteStorageMap.keys(),
  ]);

  const mergedCookies: CookieSnapshot[] = [];
  const mergedStorage: StorageSnapshot[] = [];

  for (const key of allOriginKeys) {
    const inLocal = localCookieMap.has(key) || localStorageMap.has(key);
    const inRemote = remoteCookieMap.has(key) || remoteStorageMap.has(key);
    const resolution = resolutionMap.get(key);

    let useLocal: boolean;

    if (inLocal && !inRemote) {
      useLocal = true;
    } else if (!inLocal && inRemote) {
      useLocal = false;
    } else if (resolution) {
      useLocal = resolution === 'local';
    } else {
      // Both sides, no explicit resolution (no conflict or checksums matched) — use local
      useLocal = true;
    }

    if (useLocal) {
      if (localCookieMap.has(key)) mergedCookies.push(localCookieMap.get(key)!);
      if (localStorageMap.has(key)) mergedStorage.push(localStorageMap.get(key)!);
    } else {
      if (remoteCookieMap.has(key)) mergedCookies.push(remoteCookieMap.get(key)!);
      if (remoteStorageMap.has(key)) mergedStorage.push(remoteStorageMap.get(key)!);
    }
  }

  // Merge session profiles: union by ID
  const mergedSessions = mergeSessionProfiles(localData.sessions, remoteData.sessions);

  return {
    version: 1,
    exportedAt: Date.now(),
    sessions: mergedSessions,
    cookieSnapshots: mergedCookies,
    storageSnapshots: mergedStorage,
  };
}

function buildSnapshotMap<T extends { sessionId: string; origin: string }>(
  snapshots: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const snap of snapshots) {
    map.set(`${snap.sessionId}:${snap.origin}`, snap);
  }
  return map;
}

function mergeSessionProfiles(
  local: SessionProfile[],
  remote: SessionProfile[],
): SessionProfile[] {
  const merged = new Map<string, SessionProfile>();

  for (const s of local) merged.set(s.id, s);
  for (const s of remote) {
    if (!merged.has(s.id)) {
      merged.set(s.id, s);
    }
    // If both have it, keep local (local session profile wins in tie)
  }

  return Array.from(merged.values());
}

// ── Apply Full Data (destructive local replace) ────────────

export async function applyFullData(data: FullExportData): Promise<void> {
  await deleteAllSessions();

  // batchSetSessions persists all sessions in one write and sets SESSION_ORDER once,
  // avoiding the O(N²) storage writes that would occur from calling
  // upsertSessionDirect in a loop (each call triggers persistSessions + appendOrder).
  await batchSetSessions(data.sessions);

  await Promise.all([
    ...data.cookieSnapshots.map((snap) => cookieStore.save(snap)),
    ...data.storageSnapshots.map((snap) => storageStore.save(snap)),
  ]);
}

// ── Export Local Data ──────────────────────────────────────

async function exportLocalData(): Promise<FullExportData> {
  // Single-scan reads: O(T) each instead of O(N×T) from per-session queries
  const [sessions, cookieSnapshots, storageSnapshots] = await Promise.all([
    listSessions(),
    cookieStore.getAllSnapshots(),
    storageStore.getAllSnapshots(),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    sessions,
    cookieSnapshots,
    storageSnapshots,
  };
}

// ── Upload Helpers ─────────────────────────────────────────

async function uploadManifest(
  token: string,
  manifest: SyncManifest,
  existingFileId: string | null,
): Promise<string> {
  const content = JSON.stringify(manifest);

  if (existingFileId) {
    await updateFile(token, existingFileId, content, 'application/json');
    return existingFileId;
  }
  return createFile(token, MANIFEST_FILENAME, content, 'application/json');
}

async function uploadPayload(
  token: string,
  payload: EncryptedPayload,
  existingFileId: string | null,
): Promise<string> {
  const content = JSON.stringify(payload);

  if (existingFileId) {
    await updateFile(token, existingFileId, content, 'application/json');
    return existingFileId;
  }
  return createFile(token, PAYLOAD_FILENAME, content, 'application/json');
}

// ── Core Sync Cycle ────────────────────────────────────────

export async function executeSyncCycle(
  passphrase: string,
  pendingResolutions?: ConflictEntry[],
  cachedRemoteData?: FullExportData | null,
): Promise<SyncState> {
  const config = getSyncConfig();
  const { deviceId, mergeStrategy } = config;

  // 1. Export local data
  log.info('Sync: exporting local data');
  const localData = await exportLocalData();
  const localManifest = await buildLocalManifest(localData, deviceId);

  // 2. Get OAuth token
  const token = await getToken(false);

  // 3. Download remote manifest (parallel — independent lookups)
  log.info('Sync: checking remote manifest');
  const [manifestFileId, payloadFileId] = await Promise.all([
    findFile(token, MANIFEST_FILENAME),
    findFile(token, PAYLOAD_FILENAME),
  ]);

  let remoteManifest: SyncManifest | null = null;
  if (manifestFileId) {
    const manifestJson = await downloadFile(token, manifestFileId);
    remoteManifest = JSON.parse(manifestJson) as SyncManifest;
  }

  // 4. First sync — no remote data exists
  if (!remoteManifest || !payloadFileId) {
    log.info('Sync: first sync, uploading local data');
    const payload = await encrypt(localData, passphrase);
    const newManifestId = await uploadManifest(token, localManifest, manifestFileId);
    await uploadPayload(token, payload, payloadFileId);
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    log.info('Sync: first sync complete', { manifestId: newManifestId });
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 5. Check if anything changed
  const localKeys = Object.keys(localManifest.checksums);
  const remoteKeys = Object.keys(remoteManifest.checksums);
  const allSame =
    localKeys.length === remoteKeys.length &&
    localKeys.every((k) => localManifest.checksums[k] === remoteManifest.checksums[k]);

  const localSessionKeys = Object.keys(localManifest.sessionChecksums);
  const remoteSessionKeys = Object.keys(remoteManifest.sessionChecksums);
  const sessionsSame =
    localSessionKeys.length === remoteSessionKeys.length &&
    localSessionKeys.every(
      (k) => localManifest.sessionChecksums[k] === remoteManifest.sessionChecksums[k],
    );

  if (allSame && sessionsSame) {
    log.info('Sync: no changes detected');
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 6. Strategy: trust-local — just upload
  if (mergeStrategy === 'trust-local') {
    log.info('Sync: trust-local, uploading');
    const payload = await encrypt(localData, passphrase);
    await uploadManifest(token, localManifest, manifestFileId);
    await uploadPayload(token, payload, payloadFileId);
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 7. Download + decrypt remote data
  let remoteData: FullExportData;
  if (cachedRemoteData) {
    remoteData = cachedRemoteData;
  } else {
    log.info('Sync: downloading remote payload');
    const payloadJson = await downloadFile(token, payloadFileId);
    const encryptedPayload = JSON.parse(payloadJson) as EncryptedPayload;
    try {
      remoteData = await decrypt(encryptedPayload, passphrase);
    } catch {
      // Decrypt failed — likely encrypted with a different account or old passphrase.
      // Auto-recover by uploading local data (trust-local behavior).
      log.warn('Sync: cannot decrypt remote payload — overwriting with local data');
      const payload = await encrypt(localData, passphrase);
      await uploadManifest(token, localManifest, manifestFileId);
      await uploadPayload(token, payload, payloadFileId);
      await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
      return { status: 'idle', progress: '', conflicts: [] };
    }
  }

  // 8. Strategy: trust-cloud — replace local
  if (mergeStrategy === 'trust-cloud') {
    log.info('Sync: trust-cloud, applying remote data');
    await applyFullData(remoteData);
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 9. Strategy: ask — detect conflicts
  const conflicts = detectConflicts(localManifest, remoteManifest, localData, remoteData);

  if (conflicts.length > 0 && !pendingResolutions) {
    log.info('Sync: conflicts detected, awaiting resolution', { count: conflicts.length });
    return { status: 'conflict', progress: '', conflicts };
  }

  // 10. Merge data
  const merged = mergeData(localData, remoteData, 'ask', pendingResolutions ?? []);

  log.info('Sync: applying merged data');
  await applyFullData(merged);

  // 11. Upload merged result
  const mergedManifest = await buildLocalManifest(merged, deviceId);
  const mergedPayload = await encrypt(merged, passphrase);
  await uploadManifest(token, mergedManifest, manifestFileId);
  await uploadPayload(token, mergedPayload, payloadFileId);

  await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
  log.info('Sync: complete');
  return { status: 'idle', progress: '', conflicts: [] };
}
