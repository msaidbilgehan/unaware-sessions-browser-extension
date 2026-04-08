import { MessageType } from '@shared/types';
import type {
  Message,
  SessionProfile,
  SessionStats,
  TabSessionEntry,
  MessageResponse,
} from '@shared/types';

async function sendMessage<T>(message: Message): Promise<T> {
  const response: MessageResponse<T> = await chrome.runtime.sendMessage(message);
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
