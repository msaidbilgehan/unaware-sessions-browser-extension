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
} from '@shared/types';

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
): Promise<SessionProfile> {
  return sendMessage({
    type: MessageType.CREATE_SESSION,
    name,
    color,
    ...(emoji ? { emoji } : {}),
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
  return sendMessage({ type: MessageType.DUPLICATE_SESSION, sessionId });
}

export function reorderSessions(orderedIds: string[]): Promise<void> {
  return sendMessage({ type: MessageType.REORDER_SESSIONS, orderedIds });
}

export function getSessionsForOrigin(origin: string): Promise<string[]> {
  return sendMessage({ type: MessageType.GET_SESSIONS_FOR_ORIGIN, origin });
}

export function saveSessionData(tabId: number): Promise<void> {
  return sendMessage({ type: MessageType.SAVE_SESSION_DATA, tabId });
}

export function detectSession(origin: string): Promise<string | null> {
  return sendMessage({ type: MessageType.DETECT_SESSION, origin });
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

export function exportFull(): Promise<FullExportData> {
  return sendMessage({ type: MessageType.EXPORT_FULL });
}

export function importFull(data: FullExportData): Promise<{ imported: number }> {
  return sendMessage({ type: MessageType.IMPORT_FULL, data });
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
