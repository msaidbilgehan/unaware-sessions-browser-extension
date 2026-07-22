import { MessageType } from '@shared/types';
import type {
  Message,
  MessageResponse,
  CookieSnapshot,
  StorageSnapshot,
  ExportUnit,
  ExportFullInitResult,
} from '@shared/types';
import { createLogger } from '@shared/logger';

const log = createLogger('messaging');
import {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
  duplicateSession,
  touchSessionRefresh,
  getSessionTombstones,
  pruneTombstones,
} from './session-manager';
import {
  getTabEntry,
  assignTab,
  unassignTab,
  getTabsForSession,
  getAllTabEntries,
} from './tab-tracker';
import {
  switchSession,
  handleContentScriptReady,
  saveCookies,
  saveTabStorage,
  detectSessionForOrigin,
  clearCookies,
  getCookiesForOrigin,
  getRestoreFailures,
  getCookieStoreIdForTab,
  captureTabIntoSession,
} from './cookie-engine';
import { rebuildContextMenu } from './context-menu';
import { updateBadge } from './badge-manager';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { STORAGE_KEYS } from '@shared/constants';
import { setLocal } from '@shared/storage';
import {
  estimateCookieBytes,
  estimateRecordBytes,
  estimateCookieSnapshotBytes,
  estimateStorageSnapshotBytes,
  extractDomain,
  generateId,
} from '@shared/utils';
import type {
  CookieDiffEntry,
  CookieDiffResult,
  CookieDiffStatus,
  LiveCookieInfo,
} from '@shared/types';
import { refreshAllActiveSessions } from './auto-refresh';
import { getLogs, clearLogs } from '@shared/logger';
import { getToken, revokeAccess, getGoogleUserId } from '@shared/sync/drive-client';
import { getSyncConfigHydrated, setSyncConfig } from '@shared/sync/sync-store';
import { triggerSync, getSyncState, resolveConflicts } from './drive-sync';

type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

// Per-chunk estimated-byte budget for a full export. Chrome caps a single
// runtime message at 64 MiB; this leaves ample headroom for serialization and
// the base64 marker inflation of binary IndexedDB values.
const EXPORT_CHUNK_BUDGET_BYTES = 24 * 1024 * 1024;

const handlers: Partial<Record<MessageType, MessageHandler>> = {
  [MessageType.CREATE_SESSION]: async (msg) => {
    if (msg.type !== MessageType.CREATE_SESSION) return { success: false };
    const session = await createSession(msg.name, msg.color, msg.emoji, msg.id);
    // Capture is best-effort: the session exists either way, and a failed
    // capture (tab closed meanwhile, non-http page) must not fail creation.
    if (msg.captureTabId != null) {
      const captured = await captureTabIntoSession(msg.captureTabId, session.id);
      if (captured) {
        await updateBadge(msg.captureTabId);
      }
    }
    await rebuildContextMenu();
    return { success: true, data: session };
  },

  [MessageType.DELETE_SESSION]: async (msg) => {
    if (msg.type !== MessageType.DELETE_SESSION) return { success: false };
    await deleteSession(msg.sessionId);
    await rebuildContextMenu();
    return { success: true };
  },

  [MessageType.LIST_SESSIONS]: async () => {
    const sessions = await listSessions();
    return { success: true, data: sessions };
  },

  [MessageType.UPDATE_SESSION]: async (msg) => {
    if (msg.type !== MessageType.UPDATE_SESSION) return { success: false };
    const session = await updateSession(msg.sessionId, msg.updates);
    return { success: true, data: session };
  },

  [MessageType.GET_SESSION_FOR_TAB]: async (msg) => {
    if (msg.type !== MessageType.GET_SESSION_FOR_TAB) return { success: false };
    const entry = await getTabEntry(msg.tabId);
    return { success: true, data: entry };
  },

  [MessageType.SWITCH_SESSION]: async (msg) => {
    if (msg.type !== MessageType.SWITCH_SESSION) return { success: false };
    const outgoing = await getTabEntry(msg.tabId);
    await switchSession(msg.tabId, msg.targetSessionId);
    if (outgoing) {
      await touchSessionRefresh(outgoing.sessionId);
    }
    await touchSessionRefresh(msg.targetSessionId);
    return { success: true };
  },

  [MessageType.ASSIGN_TAB]: async (msg) => {
    if (msg.type !== MessageType.ASSIGN_TAB) return { success: false };
    const storeId = await getCookieStoreIdForTab(msg.tabId);
    await assignTab(msg.tabId, msg.sessionId, msg.origin, storeId);
    await updateBadge(msg.tabId);
    return { success: true };
  },

  [MessageType.UNASSIGN_TAB]: async (msg) => {
    if (msg.type !== MessageType.UNASSIGN_TAB) return { success: false };
    await unassignTab(msg.tabId);
    await updateBadge(msg.tabId);
    return { success: true };
  },

  [MessageType.GET_TABS_FOR_SESSION]: async (msg) => {
    if (msg.type !== MessageType.GET_TABS_FOR_SESSION) return { success: false };
    const tabs = await getTabsForSession(msg.sessionId);
    return { success: true, data: tabs };
  },

  [MessageType.GET_SESSIONS_FOR_ORIGIN]: async (msg) => {
    if (msg.type !== MessageType.GET_SESSIONS_FOR_ORIGIN) return { success: false };
    const [cookieSessionIds, storageSessionIds] = await Promise.all([
      cookieStore.getSessionIdsForOrigin(msg.origin),
      storageStore.getSessionIdsForOrigin(msg.origin),
    ]);
    const merged = [...new Set([...cookieSessionIds, ...storageSessionIds])];
    return { success: true, data: merged };
  },

  [MessageType.GET_ALL_SESSION_ORIGINS]: async () => {
    const [cookieMap, storageMap] = await Promise.all([
      cookieStore.getAllSessionOrigins(),
      storageStore.getAllSessionOrigins(),
    ]);
    const merged: Record<string, string[]> = {};
    for (const map of [cookieMap, storageMap]) {
      for (const [sid, origins] of Object.entries(map)) {
        const existing = merged[sid];
        if (existing) {
          const set = new Set(existing);
          for (const o of origins) set.add(o);
          merged[sid] = [...set];
        } else {
          merged[sid] = origins;
        }
      }
    }
    return { success: true, data: merged };
  },

  [MessageType.GET_ALL_TAB_COUNTS]: async () => {
    const entries = await getAllTabEntries();
    const counts: Record<string, number> = {};
    for (const [, entry] of entries) {
      counts[entry.sessionId] = (counts[entry.sessionId] ?? 0) + 1;
    }
    return { success: true, data: counts };
  },

  [MessageType.GET_SESSION_STATS]: async (msg) => {
    if (msg.type !== MessageType.GET_SESSION_STATS) return { success: false };
    const tabs = await getTabsForSession(msg.sessionId);
    const [cookieStats, storageStats] = await Promise.all([
      cookieStore.getStatsForSession(msg.sessionId),
      storageStore.getStatsForSession(msg.sessionId),
    ]);
    const allOrigins = [...new Set([...cookieStats.origins, ...storageStats.origins])];
    return {
      success: true,
      data: {
        tabCount: tabs.length,
        origins: allOrigins,
        cookieCount: cookieStats.cookieCount,
        cookieBytes: cookieStats.cookieBytes,
        storageEntries: storageStats.entryCount,
        storageBytes: storageStats.storageBytes,
        idbDatabases: storageStats.idbCount,
      },
    };
  },

  [MessageType.DUPLICATE_SESSION]: async (msg) => {
    if (msg.type !== MessageType.DUPLICATE_SESSION) return { success: false };
    const session = await duplicateSession(msg.sessionId, msg.newId);
    await rebuildContextMenu();
    return { success: true, data: session };
  },

  [MessageType.REORDER_SESSIONS]: async (msg) => {
    if (msg.type !== MessageType.REORDER_SESSIONS) return { success: false };
    await setLocal(STORAGE_KEYS.SESSION_ORDER, msg.orderedIds);
    return { success: true };
  },

  [MessageType.SAVE_SESSION_DATA]: async (msg) => {
    if (msg.type !== MessageType.SAVE_SESSION_DATA) return { success: false };
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.url) return { success: false, error: 'Tab has no URL' };

    const entry = await getTabEntry(msg.tabId);
    if (!entry) return { success: false, error: 'Tab is not assigned to a session' };

    const origin = new URL(tab.url).origin;
    const storeId = await getCookieStoreIdForTab(msg.tabId);
    await saveCookies(entry.sessionId, origin, storeId);
    await saveTabStorage(msg.tabId, entry.sessionId, origin);
    await touchSessionRefresh(entry.sessionId);
    return { success: true };
  },

  [MessageType.DETECT_SESSION]: async (msg) => {
    if (msg.type !== MessageType.DETECT_SESSION) return { success: false };
    const storeId = msg.tabId != null ? await getCookieStoreIdForTab(msg.tabId) : undefined;
    const sessionId = await detectSessionForOrigin(msg.origin, storeId);
    return { success: true, data: sessionId };
  },

  [MessageType.CLEAR_ORIGIN_DATA]: async (msg) => {
    if (msg.type !== MessageType.CLEAR_ORIGIN_DATA) return { success: false };
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.url) return { success: false, error: 'Tab has no URL' };

    const origin = new URL(tab.url).origin;
    const currentEntry = await getTabEntry(msg.tabId);
    const storeId = await getCookieStoreIdForTab(msg.tabId);

    // Save the current session's cookies and storage before clearing,
    // so the data is preserved for switching back later.
    if (currentEntry) {
      await Promise.all([
        saveCookies(currentEntry.sessionId, origin, storeId),
        saveTabStorage(msg.tabId, currentEntry.sessionId, origin),
      ]);
    }

    await unassignTab(msg.tabId);

    // Clear cookies for this origin only (including parent-domain cookies).
    await clearCookies(origin, storeId);

    await chrome.tabs.update(msg.tabId, { url: tab.url });
    return { success: true };
  },

  [MessageType.GET_SESSION_DETAILS]: async (msg) => {
    if (msg.type !== MessageType.GET_SESSION_DETAILS) return { success: false };
    const [cookieSnapshots, storageSnapshots] = await Promise.all([
      cookieStore.getAllSnapshotsForSession(msg.sessionId),
      storageStore.getAllSnapshotsForSession(msg.sessionId),
    ]);

    const originMap = new Map<
      string,
      {
        cookieSnap: (typeof cookieSnapshots)[0] | null;
        storageSnap: (typeof storageSnapshots)[0] | null;
      }
    >();

    for (const snap of cookieSnapshots) {
      const existing = originMap.get(snap.origin);
      originMap.set(snap.origin, { cookieSnap: snap, storageSnap: existing?.storageSnap ?? null });
    }
    for (const snap of storageSnapshots) {
      const existing = originMap.get(snap.origin);
      originMap.set(snap.origin, { cookieSnap: existing?.cookieSnap ?? null, storageSnap: snap });
    }

    let totalCookies = 0;
    let totalStorageBytes = 0;
    const origins = [];

    for (const [origin, { cookieSnap, storageSnap }] of originMap) {
      const cookieCount = cookieSnap?.cookies.length ?? 0;
      const cookieBytes = cookieSnap ? estimateCookieBytes(cookieSnap.cookies) : 0;
      const storageEntries = storageSnap
        ? Object.keys(storageSnap.localStorage).length +
          Object.keys(storageSnap.sessionStorage).length
        : 0;
      const storageBytes = storageSnap
        ? estimateRecordBytes(storageSnap.localStorage) +
          estimateRecordBytes(storageSnap.sessionStorage)
        : 0;
      const idbDatabases = storageSnap?.indexedDB?.length ?? 0;

      totalCookies += cookieCount;
      totalStorageBytes += cookieBytes + storageBytes;

      origins.push({
        origin,
        cookieCount,
        cookieBytes,
        storageEntries,
        storageBytes,
        idbDatabases,
        cookieTimestamp: cookieSnap?.timestamp ?? null,
        storageTimestamp: storageSnap?.timestamp ?? null,
        cookies: (cookieSnap?.cookies ?? []).map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
        })),
        localStorage: storageSnap?.localStorage ?? {},
        sessionStorage: storageSnap?.sessionStorage ?? {},
      });
    }

    return {
      success: true,
      data: { sessionId: msg.sessionId, origins, totalCookies, totalStorageBytes },
    };
  },

  [MessageType.DELETE_SESSION_ORIGIN_DATA]: async (msg) => {
    if (msg.type !== MessageType.DELETE_SESSION_ORIGIN_DATA) return { success: false };
    await cookieStore.deleteForOrigin(msg.sessionId, msg.origin);
    await storageStore.deleteForOrigin(msg.sessionId, msg.origin);
    return { success: true };
  },

  [MessageType.UPDATE_SESSION_COOKIE]: async (msg) => {
    if (msg.type !== MessageType.UPDATE_SESSION_COOKIE) return { success: false };
    const snapshot = await cookieStore.load(msg.sessionId, msg.origin);
    if (!snapshot) return { success: false, error: 'Snapshot not found' };
    const cookie = snapshot.cookies.find(
      (c) => c.name === msg.cookieName && c.domain === msg.cookieDomain,
    );
    if (!cookie) return { success: false, error: 'Cookie not found' };
    cookie.value = msg.newValue;
    await cookieStore.save(snapshot);
    return { success: true };
  },

  [MessageType.DELETE_SESSION_COOKIE]: async (msg) => {
    if (msg.type !== MessageType.DELETE_SESSION_COOKIE) return { success: false };
    const snapshot = await cookieStore.load(msg.sessionId, msg.origin);
    if (!snapshot) return { success: false, error: 'Snapshot not found' };
    snapshot.cookies = snapshot.cookies.filter(
      (c) => !(c.name === msg.cookieName && c.domain === msg.cookieDomain),
    );
    await cookieStore.save(snapshot);
    return { success: true };
  },

  [MessageType.UPDATE_SESSION_STORAGE_ENTRY]: async (msg) => {
    if (msg.type !== MessageType.UPDATE_SESSION_STORAGE_ENTRY) return { success: false };
    const snapshot = await storageStore.load(msg.sessionId, msg.origin);
    if (!snapshot) return { success: false, error: 'Snapshot not found' };
    snapshot[msg.storageType][msg.key] = msg.value;
    await storageStore.save(snapshot);
    return { success: true };
  },

  [MessageType.DELETE_SESSION_STORAGE_ENTRY]: async (msg) => {
    if (msg.type !== MessageType.DELETE_SESSION_STORAGE_ENTRY) return { success: false };
    const snapshot = await storageStore.load(msg.sessionId, msg.origin);
    if (!snapshot) return { success: false, error: 'Snapshot not found' };
    const store = snapshot[msg.storageType] as Record<string, string>;
    const { [msg.key]: _, ...rest } = store;
    snapshot[msg.storageType] = rest;
    await storageStore.save(snapshot);
    return { success: true };
  },

  [MessageType.REFRESH_ACTIVE_SESSIONS]: async () => {
    const refreshedCount = await refreshAllActiveSessions();
    return { success: true, data: { refreshedCount } };
  },

  // ── Full Export / Import ───────────────────────────────────────

  [MessageType.EXPORT_FULL_INIT]: async (msg) => {
    if (msg.type !== MessageType.EXPORT_FULL_INIT) return { success: false };
    const { sessionIds } = msg;
    const allSessions = await listSessions();
    const sessions = sessionIds
      ? allSessions.filter((s) => sessionIds.includes(s.id))
      : allSessions;
    const selectedIds = new Set(sessions.map((s) => s.id));

    // The snapshot data is streamed later in EXPORT_FULL_CHUNK; here we return
    // only the small metadata plus the ordered plan of (sessionId, origin)
    // units to fetch. Union the origins from both stores — a session may have
    // cookies for an origin but no DOM storage, or vice versa.
    const [cookieOrigins, storageOrigins, tombstones] = await Promise.all([
      cookieStore.getAllSessionOrigins(),
      storageStore.getAllSessionOrigins(),
      getSessionTombstones(),
    ]);

    const units: ExportUnit[] = [];
    for (const session of sessions) {
      const origins = new Set<string>([
        ...(cookieOrigins[session.id] ?? []),
        ...(storageOrigins[session.id] ?? []),
      ]);
      for (const origin of origins) {
        units.push({ sessionId: session.id, origin });
      }
    }
    // Defensive: drop any unit whose session was filtered out.
    const planned = units.filter((u) => selectedIds.has(u.sessionId));

    const data: ExportFullInitResult = {
      version: 1,
      exportedAt: Date.now(),
      sessions,
      deletedSessions: pruneTombstones(tombstones),
      units: planned,
    };

    return { success: true, data };
  },

  [MessageType.EXPORT_FULL_CHUNK]: async (msg) => {
    if (msg.type !== MessageType.EXPORT_FULL_CHUNK) return { success: false };
    const { units } = msg;

    const cookieSnapshots: CookieSnapshot[] = [];
    const storageSnapshots: StorageSnapshot[] = [];
    let bytes = 0;
    let consumed = 0;

    for (const unit of units) {
      const [cookieSnap, storageSnap] = await Promise.all([
        cookieStore.load(unit.sessionId, unit.origin),
        storageStore.load(unit.sessionId, unit.origin),
      ]);

      let unitBytes = 0;
      if (cookieSnap) unitBytes += estimateCookieSnapshotBytes(cookieSnap);
      if (storageSnap) unitBytes += estimateStorageSnapshotBytes(storageSnap);

      // Always include at least one unit so the caller's cursor advances even
      // when a single origin exceeds the budget (its transfer would then fail
      // loudly rather than the export hanging).
      if (consumed > 0 && bytes + unitBytes > EXPORT_CHUNK_BUDGET_BYTES) break;

      if (cookieSnap) cookieSnapshots.push(cookieSnap);
      if (storageSnap) storageSnapshots.push(storageSnap);
      bytes += unitBytes;
      consumed++;
    }

    return { success: true, data: { cookieSnapshots, storageSnapshots, consumed } };
  },

  [MessageType.IMPORT_FULL_BEGIN]: async (msg) => {
    if (msg.type !== MessageType.IMPORT_FULL_BEGIN) return { success: false };
    const { sessions, idMap } = msg;

    if (!Array.isArray(sessions)) {
      return { success: false, error: 'Invalid full export format' };
    }

    // Create sessions with the caller-provided IDs (idempotency keys). A retry
    // resends the same IDs, so createSession is a no-op the second time and the
    // returned map is identical. Snapshots stream in later via IMPORT_FULL_CHUNK,
    // remapped to these new IDs by the caller.
    //
    // Dedup is against sessions that existed *before* this import only (name
    // set captured once). Two profiles that share a name within the payload are
    // both distinct sessions and are both created — matching prior behavior.
    const existingSessions = await listSessions();
    const existingNames = new Set(existingSessions.map((s) => s.name));
    const existingIds = new Set(existingSessions.map((s) => s.id));

    const created: Record<string, string> = {};
    let imported = 0;

    for (const profile of sessions) {
      if (!profile.name || !profile.color) continue;
      const newId = idMap[profile.id];
      if (!newId) continue;

      // A session this import already created in a prior attempt (same newId,
      // now "existing") is not a duplicate — recreating it is a no-op. Any
      // other name collision with a pre-existing session is skipped.
      const isPriorAttempt = existingIds.has(newId);
      if (existingNames.has(profile.name) && !isPriorAttempt) continue;

      await createSession(profile.name, profile.color, profile.emoji, newId);
      created[profile.id] = newId;
      imported++;
    }

    return { success: true, data: { idMap: created, imported } };
  },

  [MessageType.IMPORT_FULL_CHUNK]: async (msg) => {
    if (msg.type !== MessageType.IMPORT_FULL_CHUNK) return { success: false };
    // Snapshots arrive already remapped to their new session IDs. Saves are
    // put-by-key, so replaying a chunk after a connection-error retry is safe.
    for (const snap of msg.cookieSnapshots) {
      await cookieStore.save(snap);
    }
    for (const snap of msg.storageSnapshots) {
      await storageStore.save(snap);
    }
    return { success: true };
  },

  [MessageType.IMPORT_FULL_COMMIT]: async (msg) => {
    if (msg.type !== MessageType.IMPORT_FULL_COMMIT) return { success: false };
    await rebuildContextMenu();
    return { success: true };
  },

  // ── Debug handlers ─────────────────────────────────────────────

  [MessageType.GET_LIVE_COOKIES]: async (msg) => {
    if (msg.type !== MessageType.GET_LIVE_COOKIES) return { success: false };
    const liveCookies = await getCookiesForOrigin(msg.origin);
    const data: LiveCookieInfo[] = liveCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite ?? 'unspecified',
      expirationDate: c.expirationDate,
    }));
    return { success: true, data };
  },

  [MessageType.GET_COOKIE_DIFF]: async (msg) => {
    if (msg.type !== MessageType.GET_COOKIE_DIFF) return { success: false };
    const { sessionId, origin } = msg;
    const domain = extractDomain(origin);

    // Load snapshot
    const snapshot = await cookieStore.load(sessionId, origin);
    const snapshotCookies = snapshot?.cookies ?? [];

    // Filter snapshot to cookies relevant to this origin
    const relevantSnapshot = domain
      ? snapshotCookies.filter((c) => {
          const bare = c.domain.replace(/^\./, '');
          return bare === domain || domain.endsWith(`.${bare}`) || bare.endsWith(`.${domain}`);
        })
      : snapshotCookies;

    // Get live browser cookies for this origin
    const liveCookies = await getCookiesForOrigin(origin);

    // Build lookup maps keyed by "name\0domain\0path"
    const snapshotMap = new Map<string, (typeof snapshotCookies)[0]>();
    for (const c of relevantSnapshot) {
      snapshotMap.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }

    const liveMap = new Map<string, (typeof liveCookies)[0]>();
    for (const c of liveCookies) {
      liveMap.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }

    const entries: CookieDiffEntry[] = [];
    const nowMs = Date.now() / 1000;

    // Check snapshot cookies against live
    for (const [key, snap] of snapshotMap) {
      const live = liveMap.get(key);

      if (!live) {
        // Check if expired
        const isExpired = snap.expirationDate != null && snap.expirationDate < nowMs;
        const status: CookieDiffStatus = isExpired ? 'expired' : 'missing_in_browser';
        entries.push({
          name: snap.name,
          domain: snap.domain,
          path: snap.path,
          status,
          snapshotValue: snap.value,
        });
      } else if (snap.value !== live.value) {
        entries.push({
          name: snap.name,
          domain: snap.domain,
          path: snap.path,
          status: 'value_changed',
          snapshotValue: snap.value,
          liveValue: live.value,
        });
      } else {
        // Values match — check flags
        const flagDiffs: string[] = [];
        if (snap.secure !== live.secure) flagDiffs.push(`secure: ${snap.secure} → ${live.secure}`);
        if (snap.httpOnly !== live.httpOnly)
          flagDiffs.push(`httpOnly: ${snap.httpOnly} → ${live.httpOnly}`);
        if (snap.sameSite !== live.sameSite)
          flagDiffs.push(`sameSite: ${snap.sameSite} → ${live.sameSite}`);

        if (flagDiffs.length > 0) {
          entries.push({
            name: snap.name,
            domain: snap.domain,
            path: snap.path,
            status: 'flags_changed',
            snapshotValue: snap.value,
            liveValue: live.value,
            flagDiffs,
          });
        } else {
          entries.push({
            name: snap.name,
            domain: snap.domain,
            path: snap.path,
            status: 'match',
            snapshotValue: snap.value,
            liveValue: live.value,
          });
        }
      }
    }

    // Check live cookies not in snapshot
    for (const [key, live] of liveMap) {
      if (!snapshotMap.has(key)) {
        entries.push({
          name: live.name,
          domain: live.domain,
          path: live.path,
          status: 'extra_in_browser',
          liveValue: live.value,
        });
      }
    }

    // Sort: problems first, then matches
    const statusOrder: Record<CookieDiffStatus, number> = {
      missing_in_browser: 0,
      expired: 1,
      value_changed: 2,
      flags_changed: 3,
      extra_in_browser: 4,
      match: 5,
    };
    entries.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const summary = {
      matched: entries.filter((e) => e.status === 'match').length,
      valueChanged: entries.filter((e) => e.status === 'value_changed').length,
      flagsChanged: entries.filter((e) => e.status === 'flags_changed').length,
      missingInBrowser: entries.filter((e) => e.status === 'missing_in_browser').length,
      extraInBrowser: entries.filter((e) => e.status === 'extra_in_browser').length,
      expired: entries.filter((e) => e.status === 'expired').length,
    };

    const result: CookieDiffResult = {
      origin,
      sessionId,
      snapshotTimestamp: snapshot?.timestamp ?? null,
      totalSnapshot: relevantSnapshot.length,
      totalLive: liveCookies.length,
      entries,
      summary,
    };

    return { success: true, data: result };
  },

  [MessageType.GET_RESTORE_FAILURES]: async () => {
    return { success: true, data: getRestoreFailures() };
  },

  [MessageType.GET_LOGS]: async () => {
    return { success: true, data: getLogs() };
  },

  [MessageType.CLEAR_LOGS]: async () => {
    clearLogs();
    return { success: true };
  },

  // ── Cloud Sync handlers ─────────────────────────────────────

  [MessageType.SYNC_CONNECT]: async () => {
    const token = await getToken(true);
    const googleId = await getGoogleUserId(token);
    // Hydrated read: if this message woke a dormant SW, the in-memory config
    // is still the default and a plain read would regenerate the device ID.
    const config = await getSyncConfigHydrated();
    const deviceId = config.deviceId || generateId();
    await setSyncConfig({ enabled: true, deviceId, googleId, lastSyncError: '' });
    return { success: true };
  },

  [MessageType.SYNC_DISCONNECT]: async () => {
    await revokeAccess();
    await setSyncConfig({
      enabled: false,
      lastSyncAt: 0,
      lastSyncError: '',
      deviceId: '',
      googleId: '',
      // A conflict pending against the connection being torn down would
      // otherwise leave the badge/banner warning about it indefinitely.
      pendingConflicts: [],
    });
    return { success: true };
  },

  [MessageType.SYNC_NOW]: async () => {
    const state = await triggerSync();
    return { success: true, data: state };
  },

  [MessageType.SYNC_GET_STATE]: async () => {
    return { success: true, data: getSyncState() };
  },

  [MessageType.SYNC_CONFIGURE]: async (msg) => {
    if (msg.type !== MessageType.SYNC_CONFIGURE) return { success: false };
    await setSyncConfig(msg.updates);
    return { success: true };
  },

  [MessageType.SYNC_RESOLVE_CONFLICTS]: async (msg) => {
    if (msg.type !== MessageType.SYNC_RESOLVE_CONFLICTS) return { success: false };
    const state = await resolveConflicts(msg.resolutions);
    return { success: true, data: state };
  },

  [MessageType.PING]: async () => {
    return { success: true, data: { status: 'alive' } };
  },

  [MessageType.CONTENT_SCRIPT_READY]: async (_msg, sender) => {
    if (sender.tab?.id != null) {
      handleContentScriptReady(sender.tab.id);
    }
    return { success: true };
  },
};

export function initMessaging(): void {
  chrome.runtime.onMessage.addListener(
    (message: Message, sender: chrome.runtime.MessageSender, sendResponse) => {
      const handler = handlers[message.type];
      if (!handler) {
        log.warn(`Unknown message type: ${message.type}`);
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
        return false;
      }

      log.debug(`Handling ${message.type}`, { sender: sender.tab?.id ?? 'extension' });

      handler(message, sender)
        .then(sendResponse)
        .catch((err: Error) => {
          log.error(`Handler ${message.type} failed: ${err.message}`);
          sendResponse({ success: false, error: err.message });
        });

      return true; // async response
    },
  );
}
