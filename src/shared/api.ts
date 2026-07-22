import { MessageType } from '@shared/types';
import type {
  Message,
  SessionProfile,
  SessionStats,
  TabSessionEntry,
  MessageResponse,
  CookieDiffResult,
  LiveCookieInfo,
  RestoreFailureEntry,
  FullExportData,
  CookieSnapshot,
  StorageSnapshot,
  ExportFullInitResult,
  ExportFullChunkResult,
  ImportFullBeginResult,
  LogEntry,
} from '@shared/types';
import type { SyncConfig, SyncState, ConflictEntry } from '@shared/sync/sync-types';
import {
  generateId,
  batchByBytes,
  estimateCookieSnapshotBytes,
  estimateStorageSnapshotBytes,
} from '@shared/utils';

// Note for mutating messages: "message port closed" can occur AFTER the
// handler ran, so a retry re-executes the operation. Handlers must therefore
// be idempotent — session create/duplicate carry a client-generated ID.
function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Receiving end does not exist') ||
    msg.includes('message port closed before a response was received') ||
    msg.includes('Could not establish connection')
  );
}

async function sendMessage<T>(message: Message): Promise<T> {
  let response: MessageResponse<T> | undefined;

  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    // Service worker may be waking up — wait briefly and retry once.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    response = await chrome.runtime.sendMessage(message);
  }

  if (!response) {
    throw new Error('No response from service worker');
  }
  if (response.success) {
    return response.data as T;
  }
  throw new Error(response.error ?? 'Unknown error');
}

export function createSession(
  name: string,
  color: string,
  emoji?: string,
  captureTabId?: number,
): Promise<SessionProfile> {
  return sendMessage({
    type: MessageType.CREATE_SESSION,
    // One ID per logical call: the connection-error retry inside sendMessage
    // resends the same ID, so the background creates at most one session.
    id: generateId(),
    name,
    color,
    ...(emoji ? { emoji } : {}),
    ...(captureTabId != null ? { captureTabId } : {}),
  });
}

export function deleteSession(sessionId: string): Promise<void> {
  return sendMessage({ type: MessageType.DELETE_SESSION, sessionId });
}

export function listSessions(): Promise<SessionProfile[]> {
  return sendMessage({ type: MessageType.LIST_SESSIONS });
}

export function updateSession(
  sessionId: string,
  updates: Partial<Pick<SessionProfile, 'name' | 'color' | 'emoji' | 'pinned' | 'settings'>>,
): Promise<SessionProfile> {
  return sendMessage({ type: MessageType.UPDATE_SESSION, sessionId, updates });
}

export function getSessionForTab(tabId: number): Promise<TabSessionEntry | undefined> {
  return sendMessage({ type: MessageType.GET_SESSION_FOR_TAB, tabId });
}

export function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  return sendMessage({ type: MessageType.SWITCH_SESSION, tabId, targetSessionId });
}

export function assignTab(tabId: number, sessionId: string, origin: string): Promise<void> {
  return sendMessage({ type: MessageType.ASSIGN_TAB, tabId, sessionId, origin });
}

export function unassignTab(tabId: number): Promise<void> {
  return sendMessage({ type: MessageType.UNASSIGN_TAB, tabId });
}

export async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export function getTabsForSession(sessionId: string): Promise<number[]> {
  return sendMessage({ type: MessageType.GET_TABS_FOR_SESSION, sessionId });
}

export function getAllTabCounts(): Promise<Record<string, number>> {
  return sendMessage({ type: MessageType.GET_ALL_TAB_COUNTS });
}

export function getSessionStats(sessionId: string): Promise<SessionStats> {
  return sendMessage({ type: MessageType.GET_SESSION_STATS, sessionId });
}

export function duplicateSession(sessionId: string): Promise<SessionProfile> {
  return sendMessage({ type: MessageType.DUPLICATE_SESSION, sessionId, newId: generateId() });
}

export function reorderSessions(orderedIds: string[]): Promise<void> {
  return sendMessage({ type: MessageType.REORDER_SESSIONS, orderedIds });
}

export function getSessionsForOrigin(origin: string): Promise<string[]> {
  return sendMessage({ type: MessageType.GET_SESSIONS_FOR_ORIGIN, origin });
}

export function getAllSessionOrigins(): Promise<Record<string, string[]>> {
  return sendMessage({ type: MessageType.GET_ALL_SESSION_ORIGINS });
}

export function saveSessionData(tabId: number): Promise<void> {
  return sendMessage({ type: MessageType.SAVE_SESSION_DATA, tabId });
}

export function detectSession(origin: string, tabId?: number): Promise<string | null> {
  return sendMessage({
    type: MessageType.DETECT_SESSION,
    origin,
    ...(tabId != null ? { tabId } : {}),
  });
}

export function clearOriginData(tabId: number): Promise<void> {
  return sendMessage({ type: MessageType.CLEAR_ORIGIN_DATA, tabId });
}

export function getSessionDetails(
  sessionId: string,
): Promise<import('@shared/types').SessionDetails> {
  return sendMessage({ type: MessageType.GET_SESSION_DETAILS, sessionId });
}

export function deleteSessionOriginData(sessionId: string, origin: string): Promise<void> {
  return sendMessage({ type: MessageType.DELETE_SESSION_ORIGIN_DATA, sessionId, origin });
}

export function updateSessionCookie(
  sessionId: string,
  origin: string,
  cookieName: string,
  cookieDomain: string,
  newValue: string,
): Promise<void> {
  return sendMessage({
    type: MessageType.UPDATE_SESSION_COOKIE,
    sessionId,
    origin,
    cookieName,
    cookieDomain,
    newValue,
  });
}

export function deleteSessionCookie(
  sessionId: string,
  origin: string,
  cookieName: string,
  cookieDomain: string,
): Promise<void> {
  return sendMessage({
    type: MessageType.DELETE_SESSION_COOKIE,
    sessionId,
    origin,
    cookieName,
    cookieDomain,
  });
}

export function updateSessionStorageEntry(
  sessionId: string,
  origin: string,
  storageType: 'localStorage' | 'sessionStorage',
  key: string,
  value: string,
): Promise<void> {
  return sendMessage({
    type: MessageType.UPDATE_SESSION_STORAGE_ENTRY,
    sessionId,
    origin,
    storageType,
    key,
    value,
  });
}

export function refreshActiveSessions(): Promise<{ refreshedCount: number }> {
  return sendMessage({ type: MessageType.REFRESH_ACTIVE_SESSIONS });
}

export function deleteSessionStorageEntry(
  sessionId: string,
  origin: string,
  storageType: 'localStorage' | 'sessionStorage',
  key: string,
): Promise<void> {
  return sendMessage({
    type: MessageType.DELETE_SESSION_STORAGE_ENTRY,
    sessionId,
    origin,
    storageType,
    key,
  });
}

// ── Full Export / Import ─────────────────────────────────────────

// Cap the units array carried in a single EXPORT_FULL_CHUNK request. The
// request itself stays tiny (the service worker byte-trims within it and
// reports how many it consumed); this only bounds round-trip granularity.
const MAX_EXPORT_UNITS_PER_REQUEST = 500;

// Estimated-byte budget per IMPORT_FULL_CHUNK, mirroring the export budget so
// no single message nears Chrome's 64 MiB cap.
const IMPORT_CHUNK_BUDGET_BYTES = 24 * 1024 * 1024;

/**
 * Export sessions with all cookie and storage data. The transfer is streamed
 * in byte-bounded chunks so no single message hits Chrome's 64 MiB limit, then
 * reassembled here into a single {@link FullExportData}.
 */
export async function exportFull(sessionIds?: string[]): Promise<FullExportData> {
  const init = await sendMessage<ExportFullInitResult>({
    type: MessageType.EXPORT_FULL_INIT,
    sessionIds,
  });

  const cookieSnapshots: CookieSnapshot[] = [];
  const storageSnapshots: StorageSnapshot[] = [];

  let cursor = 0;
  while (cursor < init.units.length) {
    const slice = init.units.slice(cursor, cursor + MAX_EXPORT_UNITS_PER_REQUEST);
    const chunk = await sendMessage<ExportFullChunkResult>({
      type: MessageType.EXPORT_FULL_CHUNK,
      units: slice,
    });
    // Append without spread — these arrays can be very large and spreading
    // as call arguments risks a stack overflow.
    for (const snap of chunk.cookieSnapshots) cookieSnapshots.push(snap);
    for (const snap of chunk.storageSnapshots) storageSnapshots.push(snap);
    // The service worker always consumes >= 1; guard against 0 to avoid a hang.
    cursor += Math.max(1, chunk.consumed);
  }

  return {
    version: init.version,
    exportedAt: init.exportedAt,
    sessions: init.sessions,
    cookieSnapshots,
    storageSnapshots,
    deletedSessions: init.deletedSessions,
  };
}

/**
 * Import a full export. Sessions are created first (with client-generated IDs
 * as idempotency keys), then snapshots stream in byte-bounded chunks, then the
 * import is committed. Keeps every message under Chrome's 64 MiB limit.
 */
export async function importFull(data: FullExportData): Promise<{ imported: number }> {
  const idMap: Record<string, string> = {};
  for (const session of data.sessions) {
    idMap[session.id] = generateId();
  }

  const begin = await sendMessage<ImportFullBeginResult>({
    type: MessageType.IMPORT_FULL_BEGIN,
    sessions: data.sessions,
    idMap,
  });

  // Stream snapshots only for sessions that were actually created (duplicates
  // by name are excluded), remapped from old to new session IDs.
  const created = begin.idMap;
  const cookies = data.cookieSnapshots
    .filter((s) => created[s.sessionId] !== undefined)
    .map((s) => ({ ...s, sessionId: created[s.sessionId] }));
  const storage = data.storageSnapshots
    .filter((s) => created[s.sessionId] !== undefined)
    .map((s) => ({ ...s, sessionId: created[s.sessionId] }));

  for (const batch of batchByBytes(cookies, estimateCookieSnapshotBytes, IMPORT_CHUNK_BUDGET_BYTES)) {
    await sendMessage({
      type: MessageType.IMPORT_FULL_CHUNK,
      cookieSnapshots: batch,
      storageSnapshots: [],
    });
  }
  for (const batch of batchByBytes(storage, estimateStorageSnapshotBytes, IMPORT_CHUNK_BUDGET_BYTES)) {
    await sendMessage({
      type: MessageType.IMPORT_FULL_CHUNK,
      cookieSnapshots: [],
      storageSnapshots: batch,
    });
  }

  await sendMessage({ type: MessageType.IMPORT_FULL_COMMIT });
  return { imported: begin.imported };
}

// ── Debug API ────────────────────────────────────────────────────

export function getLiveCookies(origin: string): Promise<LiveCookieInfo[]> {
  return sendMessage({ type: MessageType.GET_LIVE_COOKIES, origin });
}

export function getCookieDiff(sessionId: string, origin: string): Promise<CookieDiffResult> {
  return sendMessage({ type: MessageType.GET_COOKIE_DIFF, sessionId, origin });
}

export function getRestoreFailures(): Promise<RestoreFailureEntry[]> {
  return sendMessage({ type: MessageType.GET_RESTORE_FAILURES });
}

// ── Logging API ─────────────────────────────────────────────────

export function getExtensionLogs(): Promise<LogEntry[]> {
  return sendMessage({ type: MessageType.GET_LOGS });
}

export function clearExtensionLogs(): Promise<void> {
  return sendMessage({ type: MessageType.CLEAR_LOGS });
}

// ── Cloud Sync API ──────────────────────────────────────────

export function syncConnect(): Promise<void> {
  return sendMessage({ type: MessageType.SYNC_CONNECT });
}

export function syncDisconnect(): Promise<void> {
  return sendMessage({ type: MessageType.SYNC_DISCONNECT });
}

export function syncNow(): Promise<SyncState> {
  return sendMessage({ type: MessageType.SYNC_NOW });
}

export function syncGetState(): Promise<SyncState> {
  return sendMessage({ type: MessageType.SYNC_GET_STATE });
}

export function syncConfigure(updates: Partial<SyncConfig>): Promise<void> {
  return sendMessage({ type: MessageType.SYNC_CONFIGURE, updates });
}

export function syncResolveConflicts(resolutions: ConflictEntry[]): Promise<SyncState> {
  return sendMessage({ type: MessageType.SYNC_RESOLVE_CONFLICTS, resolutions });
}
