import { MessageType } from '@shared/types';
import type { Message, MessageResponse } from '@shared/types';
import {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
  duplicateSession,
  touchSessionRefresh,
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
  saveAllCookiesForSession,
  saveTabStorage,
  detectSessionForOrigin,
} from './cookie-engine';
import { rebuildContextMenu } from './context-menu';
import { updateBadge } from './badge-manager';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { STORAGE_KEYS } from '@shared/constants';
import { setLocal } from '@shared/storage';
import { estimateCookieBytes, estimateRecordBytes } from '@shared/utils';
import { refreshAllActiveSessions } from './auto-refresh';

type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

const handlers: Partial<Record<MessageType, MessageHandler>> = {
  [MessageType.CREATE_SESSION]: async (msg) => {
    if (msg.type !== MessageType.CREATE_SESSION) return { success: false };
    const session = await createSession(msg.name, msg.color, msg.emoji);
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
    const entry = getTabEntry(msg.tabId);
    return { success: true, data: entry };
  },

  [MessageType.SWITCH_SESSION]: async (msg) => {
    if (msg.type !== MessageType.SWITCH_SESSION) return { success: false };
    const outgoing = getTabEntry(msg.tabId);
    await switchSession(msg.tabId, msg.targetSessionId);
    if (outgoing) {
      await touchSessionRefresh(outgoing.sessionId);
    }
    await touchSessionRefresh(msg.targetSessionId);
    return { success: true };
  },

  [MessageType.ASSIGN_TAB]: async (msg) => {
    if (msg.type !== MessageType.ASSIGN_TAB) return { success: false };
    await assignTab(msg.tabId, msg.sessionId, msg.origin);
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
    const tabs = getTabsForSession(msg.sessionId);
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

  [MessageType.GET_ALL_TAB_COUNTS]: async () => {
    const entries = getAllTabEntries();
    const counts: Record<string, number> = {};
    for (const [, entry] of entries) {
      counts[entry.sessionId] = (counts[entry.sessionId] ?? 0) + 1;
    }
    return { success: true, data: counts };
  },

  [MessageType.GET_SESSION_STATS]: async (msg) => {
    if (msg.type !== MessageType.GET_SESSION_STATS) return { success: false };
    const tabs = getTabsForSession(msg.sessionId);
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
    const session = await duplicateSession(msg.sessionId);
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

    const entry = getTabEntry(msg.tabId);
    if (!entry) return { success: false, error: 'Tab is not assigned to a session' };

    const origin = new URL(tab.url).origin;
    await saveAllCookiesForSession(entry.sessionId, origin);
    await saveTabStorage(msg.tabId, entry.sessionId, origin);
    await touchSessionRefresh(entry.sessionId);
    return { success: true };
  },

  [MessageType.DETECT_SESSION]: async (msg) => {
    if (msg.type !== MessageType.DETECT_SESSION) return { success: false };
    const sessionId = await detectSessionForOrigin(msg.origin);
    return { success: true, data: sessionId };
  },

  [MessageType.CLEAR_ORIGIN_DATA]: async (msg) => {
    if (msg.type !== MessageType.CLEAR_ORIGIN_DATA) return { success: false };
    const tab = await chrome.tabs.get(msg.tabId);
    if (!tab.url) return { success: false, error: 'Tab has no URL' };

    await unassignTab(msg.tabId);

    // Clear ALL cookies (not just the origin) for a true fresh start.
    // Auth flows span multiple domains (e.g., authenticator.cursor.sh for cursor.com)
    // so clearing only the origin's cookies leaves stale auth tokens.
    const allCookies = await chrome.cookies.getAll({});
    await Promise.allSettled(
      allCookies.map((cookie) => {
        const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
        return chrome.cookies.remove({ url, name: cookie.name });
      }),
    );

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
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
        return false;
      }

      handler(message, sender)
        .then(sendResponse)
        .catch((err: Error) => {
          sendResponse({ success: false, error: err.message });
        });

      return true; // async response
    },
  );
}
