import type {
  FullExportData,
  CookieSnapshot,
  StorageSnapshot,
  SessionProfile,
} from '@shared/types';
import type {
  SyncManifest,
  SyncState,
  ConflictEntry,
  MergeStrategy,
  EncryptedPayload,
} from './sync-types';
import { sha256Hex, encrypt, decrypt } from './crypto-engine';
import {
  findFile,
  createFile,
  updateFile,
  downloadFile,
  getToken,
  getFileVersion,
} from './drive-client';
import type { DriveFileRef } from './drive-client';
import { getSyncConfigHydrated, setSyncConfig } from './sync-store';
import {
  listSessions,
  deleteAllSessions,
  batchSetSessions,
  getSessionTombstones,
  setSessionTombstones,
  pruneTombstones,
} from '@background/session-manager';
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

  // Merge session profiles: union by ID, minus tombstoned deletions.
  const { sessions: mergedSessions, tombstones } = mergeSessionsWithTombstones(
    localData,
    remoteData,
  );

  // A tombstoned session's snapshots must not survive the merge either —
  // they would re-upload orphaned (and potentially sensitive) data forever.
  const liveIds = new Set(mergedSessions.map((s) => s.id));
  const isLive = (snap: { sessionId: string }): boolean =>
    liveIds.has(snap.sessionId) || !(snap.sessionId in tombstones);

  return {
    version: 1,
    exportedAt: Date.now(),
    sessions: mergedSessions,
    cookieSnapshots: mergedCookies.filter(isLive),
    storageSnapshots: mergedStorage.filter(isLive),
    deletedSessions: tombstones,
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

/**
 * Union profiles by ID (newer `updatedAt` wins, local wins ties), then apply
 * deletion tombstones: a session deleted on either side stays deleted unless
 * it was updated *after* the deletion — an explicit edit/recreate overrides
 * the tombstone. Without tombstones, deleting a session on one device would
 * resurrect it from the other side's copy on every sync.
 */
function mergeSessionsWithTombstones(
  localData: FullExportData,
  remoteData: FullExportData,
): { sessions: SessionProfile[]; tombstones: Record<string, number> } {
  const merged = new Map<string, SessionProfile>();

  for (const s of localData.sessions) merged.set(s.id, s);
  for (const s of remoteData.sessions) {
    const existing = merged.get(s.id);
    if (!existing || s.updatedAt > existing.updatedAt) {
      merged.set(s.id, s);
    }
  }

  // Union tombstones from both sides; the latest deletion timestamp wins.
  const tombstones = new Map<string, number>();
  for (const [id, deletedAt] of Object.entries(remoteData.deletedSessions ?? {})) {
    tombstones.set(id, deletedAt);
  }
  for (const [id, deletedAt] of Object.entries(localData.deletedSessions ?? {})) {
    tombstones.set(id, Math.max(tombstones.get(id) ?? 0, deletedAt));
  }

  const sessions: SessionProfile[] = [];
  for (const s of merged.values()) {
    const deletedAt = tombstones.get(s.id);
    if (deletedAt != null && s.updatedAt <= deletedAt) continue;
    if (deletedAt != null) tombstones.delete(s.id);
    sessions.push(s);
  }

  return { sessions, tombstones: pruneTombstones(Object.fromEntries(tombstones)) };
}

// ── Apply Full Data (destructive local replace) ────────────

export async function applyFullData(data: FullExportData): Promise<void> {
  // Internal replace, not a user deletion — recording tombstones here would
  // mark the incoming sessions as deleted and wipe them on the next sync.
  await deleteAllSessions({ recordTombstones: false });

  // batchSetSessions persists all sessions in one write and sets SESSION_ORDER once,
  // avoiding the O(N²) storage writes that would occur from calling
  // upsertSessionDirect in a loop (each call triggers persistSessions + appendOrder).
  await batchSetSessions(data.sessions);

  // The merged tombstone set replaces the local one (deletions already
  // resolved during merge; keeping stale local tombstones would re-delete
  // sessions that survived via a newer update).
  await setSessionTombstones(data.deletedSessions ?? {});

  await Promise.all([
    ...data.cookieSnapshots.map((snap) => cookieStore.save(snap)),
    ...data.storageSnapshots.map((snap) => storageStore.save(snap)),
  ]);
}

// ── Export Local Data ──────────────────────────────────────

async function exportLocalData(): Promise<FullExportData> {
  // Single-scan reads: O(T) each instead of O(N×T) from per-session queries
  const [sessions, cookieSnapshots, storageSnapshots, tombstones] = await Promise.all([
    listSessions(),
    cookieStore.getAllSnapshots(),
    storageStore.getAllSnapshots(),
    getSessionTombstones(),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    sessions,
    cookieSnapshots,
    storageSnapshots,
    deletedSessions: pruneTombstones(tombstones),
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
  content: string,
  existingFileId: string | null,
): Promise<string> {
  if (existingFileId) {
    await updateFile(token, existingFileId, content, 'application/json');
    return existingFileId;
  }
  return createFile(token, PAYLOAD_FILENAME, content, 'application/json');
}

/**
 * Thrown when another device changed a remote file between this cycle's read
 * and its write; the caller retries the whole cycle against fresh remote
 * state. Drive API v3 has no ETag/If-Match preconditions (removed with v2),
 * so this re-checks the file's `version` counter immediately before each
 * write instead. A sub-second race window remains between check and write;
 * the union merge + tombstones absorb what slips through.
 */
export class SyncConcurrencyError extends Error {
  constructor() {
    super('Remote sync data changed during the sync cycle');
    this.name = 'SyncConcurrencyError';
  }
}

async function assertFilesUnchanged(
  token: string,
  refs: Array<DriveFileRef | null>,
): Promise<void> {
  await Promise.all(
    refs.map(async (ref) => {
      if (!ref) return; // file doesn't exist yet — nothing to race against
      const current = await getFileVersion(token, ref.id);
      if (current !== ref.version) {
        throw new SyncConcurrencyError();
      }
    }),
  );
}

/**
 * Uploads payload first, manifest last — the manifest is the commit marker.
 * A crash between the two writes leaves an old manifest describing the old
 * checksums (the new data is simply not visible until the next sync heals
 * it). The reverse order would leave a new manifest describing a stale
 * payload, which another device would download and apply as remote truth —
 * real data loss under trust-cloud. The manifest also embeds the payload's
 * checksum so downloaders can detect a stale manifest.
 */
async function uploadPayloadThenManifest(
  token: string,
  manifest: SyncManifest,
  payload: EncryptedPayload,
  manifestRef: DriveFileRef | null,
  payloadRef: DriveFileRef | null,
): Promise<void> {
  // Optimistic concurrency: abort before clobbering another device's
  // in-flight payload; the caller retries the cycle against fresh state.
  await assertFilesUnchanged(token, [manifestRef, payloadRef]);
  const content = JSON.stringify(payload);
  await uploadPayload(token, content, payloadRef?.id ?? null);
  manifest.payloadChecksum = await sha256Hex(content);
  // Re-check before the commit write: if a concurrent writer landed between
  // our two writes, aborting leaves *their* manifest as the commit marker
  // rather than pointing our manifest at a payload they just replaced.
  await assertFilesUnchanged(token, [manifestRef]);
  await uploadManifest(token, manifest, manifestRef?.id ?? null);
}

// ── Core Sync Cycle ────────────────────────────────────────

/**
 * Remote state downloaded during conflict detection, kept so the resolution
 * cycle applies the user's choices against the exact snapshot the conflicts
 * were detected on. Valid only while the remote payload's Drive `version` is
 * unchanged — otherwise another device wrote in between and the cycle must
 * re-download.
 */
export interface RemoteDataCache {
  manifest: SyncManifest;
  data: FullExportData;
  payloadVersion: string;
}

export interface SyncCycleResult extends SyncState {
  // Present only when status is 'conflict' — the snapshot to cache for the
  // follow-up resolution cycle.
  remoteCache?: RemoteDataCache;
}

export async function executeSyncCycle(
  passphrase: string,
  pendingResolutions?: ConflictEntry[],
  cachedRemote?: RemoteDataCache | null,
): Promise<SyncCycleResult> {
  // Hydrated read: an alarm or message can start a cycle on a cold SW before
  // the top-level init loaded the config (deviceId would be '' otherwise).
  const config = await getSyncConfigHydrated();
  const { deviceId, mergeStrategy } = config;

  // 1. Export local data
  log.info('Sync: exporting local data');
  const localData = await exportLocalData();
  const localManifest = await buildLocalManifest(localData, deviceId);

  // 2. Get OAuth token
  const token = await getToken(false);

  // 3. Download remote manifest (parallel — independent lookups)
  log.info('Sync: checking remote manifest');
  const [manifestRef, payloadRef] = await Promise.all([
    findFile(token, MANIFEST_FILENAME),
    findFile(token, PAYLOAD_FILENAME),
  ]);

  let remoteManifest: SyncManifest | null = null;
  if (manifestRef) {
    const manifestJson = await downloadFile(token, manifestRef.id);
    try {
      remoteManifest = JSON.parse(manifestJson) as SyncManifest;
    } catch {
      // A truncated/corrupt manifest must not brick sync forever — treat it
      // as absent so the first-sync branch below re-uploads and heals it.
      log.warn('Sync: remote manifest unparseable — treating as absent');
    }
  }

  // 4. First sync — no remote data exists (or the manifest is unreadable)
  if (!remoteManifest || !payloadRef) {
    log.info('Sync: first sync, uploading local data');
    const payload = await encrypt(localData, passphrase);
    await uploadPayloadThenManifest(token, localManifest, payload, manifestRef, payloadRef);
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    log.info('Sync: first sync complete');
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 5. Check if anything changed.
  // Two assumptions this fast path relies on:
  // - Tombstone-only differences are invisible here. Benign today: a
  //   tombstone whose session never reached the remote has nothing remote to
  //   delete, and any reachable deletion also changes session/origin
  //   checksums. Revisit if tombstones ever gain remote-visible effects of
  //   their own.
  // - The remote manifest may be stale for the payload (a writer crashed
  //   between the payload and manifest writes). If local happens to equal
  //   that stale manifest we skip and miss the newer payload until the
  //   writer's next sync re-commits it — safe (nothing is overwritten), just
  //   delayed.
  const remoteChecksums = remoteManifest.checksums;
  const localKeys = Object.keys(localManifest.checksums);
  const remoteKeys = Object.keys(remoteChecksums);
  const allSame =
    localKeys.length === remoteKeys.length &&
    localKeys.every((k) => localManifest.checksums[k] === remoteChecksums[k]);

  const remoteSessionChecksums = remoteManifest.sessionChecksums;
  const localSessionKeys = Object.keys(localManifest.sessionChecksums);
  const remoteSessionKeys = Object.keys(remoteSessionChecksums);
  const sessionsSame =
    localSessionKeys.length === remoteSessionKeys.length &&
    localSessionKeys.every(
      (k) => localManifest.sessionChecksums[k] === remoteSessionChecksums[k],
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
    await uploadPayloadThenManifest(token, localManifest, payload, manifestRef, payloadRef);
    await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
    return { status: 'idle', progress: '', conflicts: [] };
  }

  // 7. Download + decrypt remote data
  let remoteData: FullExportData;
  if (cachedRemote && cachedRemote.payloadVersion === payloadRef.version) {
    // Resolution cycle: reuse the exact snapshot the user's conflict choices
    // were made against. The version match proves the remote payload hasn't
    // changed since detection; a stale cache falls through to a fresh
    // download (and the guard below re-prompts if the conflicts changed).
    remoteData = cachedRemote.data;
    remoteManifest = cachedRemote.manifest;
  } else {
    log.info('Sync: downloading remote payload');
    const payloadJson = await downloadFile(token, payloadRef.id);
    try {
      // The parse must sit inside the recovery path: a payload truncated by
      // a partial write throws here and must self-heal exactly like an
      // undecryptable one — not brick every future sync with a parse error.
      const encryptedPayload = JSON.parse(payloadJson) as EncryptedPayload;
      remoteData = await decrypt(encryptedPayload, passphrase);
    } catch {
      // Unreadable payload — encrypted with a different account or an old
      // passphrase, or corrupted by a partial write. Auto-recover by
      // uploading local data (trust-local behavior).
      log.warn('Sync: cannot read remote payload — overwriting with local data');
      const payload = await encrypt(localData, passphrase);
      await uploadPayloadThenManifest(token, localManifest, payload, manifestRef, payloadRef);
      await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
      return { status: 'idle', progress: '', conflicts: [] };
    }

    // With payload-first writes, a manifest/payload checksum mismatch means
    // the payload is NEWER than the manifest (its writer crashed before the
    // manifest commit, or is mid-write). The payload content is authenticated
    // by AES-GCM, so trust it and rebuild the stale manifest from it —
    // conflict detection below then compares against what the payload
    // actually contains instead of stale checksums.
    if (remoteManifest.payloadChecksum) {
      const actualChecksum = await sha256Hex(payloadJson);
      if (actualChecksum !== remoteManifest.payloadChecksum) {
        log.warn('Sync: remote manifest is stale for this payload — rebuilding from payload');
        remoteManifest = await buildLocalManifest(remoteData, remoteManifest.deviceId);
      }
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

  if (conflicts.length > 0) {
    const resolvedKeys = new Set(
      (pendingResolutions ?? [])
        .filter((r) => r.resolution)
        .map((r) => `${r.sessionId}:${r.origin}`),
    );
    const unresolved = conflicts.filter((c) => !resolvedKeys.has(`${c.sessionId}:${c.origin}`));

    // Ask (again) when there are no resolutions yet, or when local/remote
    // drifted while the dialog was open and produced conflicts the user never
    // saw — merging anyway would silently default those keys to 'local'.
    if (unresolved.length > 0) {
      log.info('Sync: conflicts detected, awaiting resolution', { count: conflicts.length });
      return {
        status: 'conflict',
        progress: '',
        conflicts,
        remoteCache: { manifest: remoteManifest, data: remoteData, payloadVersion: payloadRef.version },
      };
    }
  }

  // 10. Merge data
  const merged = mergeData(localData, remoteData, 'ask', pendingResolutions ?? []);

  log.info('Sync: applying merged data');
  await applyFullData(merged);

  // 11. Upload merged result
  const mergedManifest = await buildLocalManifest(merged, deviceId);
  const mergedPayload = await encrypt(merged, passphrase);
  await uploadPayloadThenManifest(token, mergedManifest, mergedPayload, manifestRef, payloadRef);

  await setSyncConfig({ lastSyncAt: Date.now(), lastSyncError: '' });
  log.info('Sync: complete');
  return { status: 'idle', progress: '', conflicts: [] };
}
