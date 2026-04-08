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
import { switchSession, handleContentScriptReady } from './cookie-engine';
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
