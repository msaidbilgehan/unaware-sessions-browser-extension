import { MessageType } from '@shared/types';
import type { Message, MessageResponse } from '@shared/types';
import {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
  duplicateSession,
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
    await switchSession(msg.tabId, msg.targetSessionId);
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
    const cookieSessionIds = await cookieStore.getSessionIdsForOrigin(msg.origin);
    const storageSessionIds = await storageStore.getSessionIdsForOrigin(msg.origin);
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
    const cookieStats = await cookieStore.getStatsForSession(msg.sessionId);
    const storageStats = await storageStore.getStatsForSession(msg.sessionId);
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
