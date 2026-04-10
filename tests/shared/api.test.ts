import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { MessageType } from '@shared/types';

const {
  createSession,
  deleteSession,
  listSessions,
  updateSession,
  getSessionForTab,
  switchSession,
  assignTab,
  unassignTab,
  getCurrentTab,
  getTabsForSession,
  getAllTabCounts,
  getSessionStats,
  duplicateSession,
  reorderSessions,
  getSessionsForOrigin,
  saveSessionData,
  detectSession,
  clearOriginData,
  getSessionDetails,
  deleteSessionOriginData,
  updateSessionCookie,
  deleteSessionCookie,
  updateSessionStorageEntry,
  deleteSessionStorageEntry,
  refreshActiveSessions,
  exportFull,
  importFull,
  getLiveCookies,
  getCookieDiff,
  getRestoreFailures,
} = await import('@shared/api');

function mockSendResponse<T>(data: T): void {
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    success: true,
    data,
  });
}

function mockSendError(error?: string): void {
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    success: false,
    error,
  });
}

beforeEach(() => {
  resetChromeMocks();
});

// ── sendMessage error handling (tested via public API) ──────────

describe('sendMessage error handling', () => {
  it('throws Error with response.error when success is false', async () => {
    mockSendError('Session not found');

    await expect(listSessions()).rejects.toThrow('Session not found');
  });

  it('throws "Unknown error" when success is false and error is undefined', async () => {
    mockSendError(undefined);

    await expect(listSessions()).rejects.toThrow('Unknown error');
  });
});

// ── Session management ──────────────────────────────────────────

describe('createSession', () => {
  it('sends CREATE_SESSION with name and color', async () => {
    const session = { id: 's1', name: 'Work', color: '#3B82F6', createdAt: 0, updatedAt: 0, settings: {} };
    mockSendResponse(session);

    const result = await createSession('Work', '#3B82F6');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.CREATE_SESSION,
      name: 'Work',
      color: '#3B82F6',
    });
    expect(result).toEqual(session);
  });

  it('includes emoji when provided', async () => {
    mockSendResponse({ id: 's1' });

    await createSession('Play', '#EF4444', '\u{1F3AE}');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.CREATE_SESSION,
      name: 'Play',
      color: '#EF4444',
      emoji: '\u{1F3AE}',
    });
  });

  it('omits emoji key when emoji is undefined', async () => {
    mockSendResponse({ id: 's1' });

    await createSession('Test', '#000');

    const sentMessage = vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0];
    expect(sentMessage).not.toHaveProperty('emoji');
  });
});

describe('deleteSession', () => {
  it('sends DELETE_SESSION with sessionId', async () => {
    mockSendResponse(undefined);

    await deleteSession('s1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DELETE_SESSION,
      sessionId: 's1',
    });
  });
});

describe('listSessions', () => {
  it('sends LIST_SESSIONS and returns session array', async () => {
    const sessions = [{ id: 's1' }, { id: 's2' }];
    mockSendResponse(sessions);

    const result = await listSessions();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.LIST_SESSIONS,
    });
    expect(result).toEqual(sessions);
  });
});

describe('updateSession', () => {
  it('sends UPDATE_SESSION with sessionId and updates', async () => {
    const updated = { id: 's1', name: 'New Name' };
    mockSendResponse(updated);

    const result = await updateSession('s1', { name: 'New Name' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.UPDATE_SESSION,
      sessionId: 's1',
      updates: { name: 'New Name' },
    });
    expect(result).toEqual(updated);
  });
});

describe('getSessionForTab', () => {
  it('sends GET_SESSION_FOR_TAB with tabId', async () => {
    const entry = { sessionId: 's1', origin: 'https://example.com' };
    mockSendResponse(entry);

    const result = await getSessionForTab(42);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_SESSION_FOR_TAB,
      tabId: 42,
    });
    expect(result).toEqual(entry);
  });

  it('returns undefined when no session assigned', async () => {
    mockSendResponse(undefined);

    const result = await getSessionForTab(42);

    expect(result).toBeUndefined();
  });
});

// ── Session switching ───────────────────────────────────────────

describe('switchSession', () => {
  it('sends SWITCH_SESSION with tabId and targetSessionId', async () => {
    mockSendResponse(undefined);

    await switchSession(42, 's2');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.SWITCH_SESSION,
      tabId: 42,
      targetSessionId: 's2',
    });
  });
});

describe('assignTab', () => {
  it('sends ASSIGN_TAB with tabId, sessionId, and origin', async () => {
    mockSendResponse(undefined);

    await assignTab(42, 's1', 'https://example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.ASSIGN_TAB,
      tabId: 42,
      sessionId: 's1',
      origin: 'https://example.com',
    });
  });
});

describe('unassignTab', () => {
  it('sends UNASSIGN_TAB with tabId', async () => {
    mockSendResponse(undefined);

    await unassignTab(42);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.UNASSIGN_TAB,
      tabId: 42,
    });
  });
});

// ── Tab queries ─────────────────────────────────────────────────

describe('getCurrentTab', () => {
  it('queries for the active tab in current window', async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 1, url: 'https://test.com' } as chrome.tabs.Tab,
    ]);

    const tab = await getCurrentTab();

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(tab?.id).toBe(1);
  });

  it('returns undefined when no active tab', async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const tab = await getCurrentTab();

    expect(tab).toBeUndefined();
  });
});

describe('getTabsForSession', () => {
  it('sends GET_TABS_FOR_SESSION and returns tab IDs', async () => {
    mockSendResponse([1, 2, 3]);

    const result = await getTabsForSession('s1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_TABS_FOR_SESSION,
      sessionId: 's1',
    });
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('getAllTabCounts', () => {
  it('sends GET_ALL_TAB_COUNTS and returns counts map', async () => {
    const counts = { s1: 2, s2: 1 };
    mockSendResponse(counts);

    const result = await getAllTabCounts();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_ALL_TAB_COUNTS,
    });
    expect(result).toEqual(counts);
  });
});

// ── Stats & data ────────────────────────────────────────────────

describe('getSessionStats', () => {
  it('sends GET_SESSION_STATS with sessionId', async () => {
    const stats = { tabCount: 1, origins: ['https://a.com'], cookieCount: 5 };
    mockSendResponse(stats);

    const result = await getSessionStats('s1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_SESSION_STATS,
      sessionId: 's1',
    });
    expect(result).toEqual(stats);
  });
});

describe('duplicateSession', () => {
  it('sends DUPLICATE_SESSION and returns new profile', async () => {
    const dup = { id: 's2', name: 'Work (copy)' };
    mockSendResponse(dup);

    const result = await duplicateSession('s1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DUPLICATE_SESSION,
      sessionId: 's1',
    });
    expect(result).toEqual(dup);
  });
});

describe('reorderSessions', () => {
  it('sends REORDER_SESSIONS with orderedIds', async () => {
    mockSendResponse(undefined);

    await reorderSessions(['s2', 's1', 's3']);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.REORDER_SESSIONS,
      orderedIds: ['s2', 's1', 's3'],
    });
  });
});

describe('getSessionsForOrigin', () => {
  it('sends GET_SESSIONS_FOR_ORIGIN with origin', async () => {
    mockSendResponse(['s1', 's3']);

    const result = await getSessionsForOrigin('https://example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_SESSIONS_FOR_ORIGIN,
      origin: 'https://example.com',
    });
    expect(result).toEqual(['s1', 's3']);
  });
});

describe('saveSessionData', () => {
  it('sends SAVE_SESSION_DATA with tabId', async () => {
    mockSendResponse(undefined);

    await saveSessionData(42);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.SAVE_SESSION_DATA,
      tabId: 42,
    });
  });
});

describe('detectSession', () => {
  it('sends DETECT_SESSION and returns session ID or null', async () => {
    mockSendResponse('s1');

    const result = await detectSession('https://example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DETECT_SESSION,
      origin: 'https://example.com',
    });
    expect(result).toBe('s1');
  });

  it('returns null when no session detected', async () => {
    mockSendResponse(null);

    const result = await detectSession('https://unknown.com');

    expect(result).toBeNull();
  });
});

describe('clearOriginData', () => {
  it('sends CLEAR_ORIGIN_DATA with tabId', async () => {
    mockSendResponse(undefined);

    await clearOriginData(42);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.CLEAR_ORIGIN_DATA,
      tabId: 42,
    });
  });
});

// ── Session details & editing ───────────────────────────────────

describe('getSessionDetails', () => {
  it('sends GET_SESSION_DETAILS and returns details', async () => {
    const details = { sessionId: 's1', origins: [], totalCookies: 0, totalStorageBytes: 0 };
    mockSendResponse(details);

    const result = await getSessionDetails('s1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_SESSION_DETAILS,
      sessionId: 's1',
    });
    expect(result).toEqual(details);
  });
});

describe('deleteSessionOriginData', () => {
  it('sends DELETE_SESSION_ORIGIN_DATA with sessionId and origin', async () => {
    mockSendResponse(undefined);

    await deleteSessionOriginData('s1', 'https://example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DELETE_SESSION_ORIGIN_DATA,
      sessionId: 's1',
      origin: 'https://example.com',
    });
  });
});

describe('updateSessionCookie', () => {
  it('sends UPDATE_SESSION_COOKIE with all parameters', async () => {
    mockSendResponse(undefined);

    await updateSessionCookie('s1', 'https://example.com', 'token', '.example.com', 'abc123');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.UPDATE_SESSION_COOKIE,
      sessionId: 's1',
      origin: 'https://example.com',
      cookieName: 'token',
      cookieDomain: '.example.com',
      newValue: 'abc123',
    });
  });
});

describe('deleteSessionCookie', () => {
  it('sends DELETE_SESSION_COOKIE with all parameters', async () => {
    mockSendResponse(undefined);

    await deleteSessionCookie('s1', 'https://example.com', 'token', '.example.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DELETE_SESSION_COOKIE,
      sessionId: 's1',
      origin: 'https://example.com',
      cookieName: 'token',
      cookieDomain: '.example.com',
    });
  });
});

describe('updateSessionStorageEntry', () => {
  it('sends UPDATE_SESSION_STORAGE_ENTRY for localStorage', async () => {
    mockSendResponse(undefined);

    await updateSessionStorageEntry('s1', 'https://example.com', 'localStorage', 'key1', 'val1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.UPDATE_SESSION_STORAGE_ENTRY,
      sessionId: 's1',
      origin: 'https://example.com',
      storageType: 'localStorage',
      key: 'key1',
      value: 'val1',
    });
  });

  it('sends UPDATE_SESSION_STORAGE_ENTRY for sessionStorage', async () => {
    mockSendResponse(undefined);

    await updateSessionStorageEntry('s1', 'https://example.com', 'sessionStorage', 'k', 'v');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ storageType: 'sessionStorage' }),
    );
  });
});

describe('deleteSessionStorageEntry', () => {
  it('sends DELETE_SESSION_STORAGE_ENTRY with all parameters', async () => {
    mockSendResponse(undefined);

    await deleteSessionStorageEntry('s1', 'https://example.com', 'localStorage', 'key1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.DELETE_SESSION_STORAGE_ENTRY,
      sessionId: 's1',
      origin: 'https://example.com',
      storageType: 'localStorage',
      key: 'key1',
    });
  });
});

// ── Full export / import ──────────────────────────────────────

describe('exportFull', () => {
  it('sends EXPORT_FULL and returns full data', async () => {
    const data = { version: 1, exportedAt: 1, sessions: [], cookieSnapshots: [], storageSnapshots: [] };
    mockSendResponse(data);

    const result = await exportFull();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.EXPORT_FULL,
    });
    expect(result).toEqual(data);
  });
});

describe('importFull', () => {
  it('sends IMPORT_FULL with data payload', async () => {
    const data = { version: 1 as const, exportedAt: 1, sessions: [], cookieSnapshots: [], storageSnapshots: [] };
    mockSendResponse({ imported: 0 });

    const result = await importFull(data);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.IMPORT_FULL,
      data,
    });
    expect(result).toEqual({ imported: 0 });
  });
});

describe('refreshActiveSessions', () => {
  it('sends REFRESH_ACTIVE_SESSIONS', async () => {
    mockSendResponse({ refreshedCount: 3 });

    const result = await refreshActiveSessions();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.REFRESH_ACTIVE_SESSIONS,
    });
    expect(result).toEqual({ refreshedCount: 3 });
  });
});

// ── Debug API ─────────────────────────────────────────────────

describe('getLiveCookies', () => {
  it('sends GET_LIVE_COOKIES with origin', async () => {
    mockSendResponse([]);

    const result = await getLiveCookies('https://google.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_LIVE_COOKIES,
      origin: 'https://google.com',
    });
    expect(result).toEqual([]);
  });
});

describe('getCookieDiff', () => {
  it('sends GET_COOKIE_DIFF with sessionId and origin', async () => {
    const diff = { origin: 'https://a.com', sessionId: 's1', entries: [], summary: {} };
    mockSendResponse(diff);

    const result = await getCookieDiff('s1', 'https://a.com');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 's1',
      origin: 'https://a.com',
    });
    expect(result).toEqual(diff);
  });
});

describe('getRestoreFailures', () => {
  it('sends GET_RESTORE_FAILURES', async () => {
    mockSendResponse([]);

    const result = await getRestoreFailures();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.GET_RESTORE_FAILURES,
    });
    expect(result).toEqual([]);
  });
});
