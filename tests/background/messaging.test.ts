import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { initMessaging } from '@background/messaging';
import { hydrateSessions } from '@background/session-manager';
import { hydrateTabMap } from '@background/tab-tracker';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import { MessageType } from '@shared/types';
import type { MessageResponse, CookieSnapshot, StorageSnapshot } from '@shared/types';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateSessions();
  await hydrateTabMap();
  initMessaging();
});

function sendTestMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender = {},
): Promise<MessageResponse> {
  return new Promise((resolve) => {
    const listeners = mockChrome.runtime.onMessage._listeners;
    const handler = listeners[listeners.length - 1];
    handler(message, sender, resolve);
  });
}

describe('messaging', () => {
  it('handles CREATE_SESSION', async () => {
    const response = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });

    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({ name: 'test', color: '#3B82F6' });
  });

  it('handles LIST_SESSIONS', async () => {
    // Create a session first
    await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });

    const response = await sendTestMessage({ type: MessageType.LIST_SESSIONS });

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(1);
  });

  it('handles DELETE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'to-delete',
      color: '#EF4444',
    });

    const sessionId = (createResp.data as { id: string }).id;
    const deleteResp = await sendTestMessage({
      type: MessageType.DELETE_SESSION,
      sessionId,
    });

    expect(deleteResp.success).toBe(true);

    const listResp = await sendTestMessage({ type: MessageType.LIST_SESSIONS });
    expect(listResp.data).toHaveLength(0);
  });

  it('handles PING', async () => {
    const response = await sendTestMessage({ type: MessageType.PING });
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ status: 'alive' });
  });

  it('handles CONTENT_SCRIPT_READY with tab sender', async () => {
    const response = await sendTestMessage(
      { type: MessageType.CONTENT_SCRIPT_READY },
      { tab: { id: 42 } as chrome.tabs.Tab },
    );
    expect(response.success).toBe(true);
  });

  it('returns error for unknown message type', async () => {
    const response = await sendTestMessage({ type: 'UNKNOWN_TYPE' });
    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown message type');
  });

  it('handles errors in handlers gracefully', async () => {
    const response = await sendTestMessage({
      type: MessageType.DELETE_SESSION,
      sessionId: 'non-existent',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Session not found');
  });

  it('handles UPDATE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'original',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const updateResp = await sendTestMessage({
      type: MessageType.UPDATE_SESSION,
      sessionId,
      updates: { name: 'renamed', color: '#EF4444' },
    });

    expect(updateResp.success).toBe(true);
    expect(updateResp.data).toMatchObject({ name: 'renamed', color: '#EF4444' });
  });

  it('handles CREATE_SESSION with emoji', async () => {
    const response = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Work',
      color: '#3B82F6',
      emoji: '\u{1F4BC}',
    });

    expect(response.success).toBe(true);
    expect((response.data as { emoji: string }).emoji).toBe('\u{1F4BC}');
  });

  it('handles GET_ALL_TAB_COUNTS', async () => {
    const response = await sendTestMessage({
      type: MessageType.GET_ALL_TAB_COUNTS,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({});
  });

  it('handles GET_TABS_FOR_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const response = await sendTestMessage({
      type: MessageType.GET_TABS_FOR_SESSION,
      sessionId,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('handles GET_SESSION_STATS', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const response = await sendTestMessage({
      type: MessageType.GET_SESSION_STATS,
      sessionId,
    });

    expect(response.success).toBe(true);
    const stats = response.data as Record<string, unknown>;
    expect(stats.tabCount).toBe(0);
    expect(stats.cookieCount).toBe(0);
  });

  it('handles DUPLICATE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Original',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const dupResp = await sendTestMessage({
      type: MessageType.DUPLICATE_SESSION,
      sessionId,
    });

    expect(dupResp.success).toBe(true);
    expect((dupResp.data as { name: string }).name).toBe('Copy of Original');
    expect((dupResp.data as { color: string }).color).toBe('#3B82F6');
  });

  it('handles REORDER_SESSIONS', async () => {
    const response = await sendTestMessage({
      type: MessageType.REORDER_SESSIONS,
      orderedIds: ['id1', 'id2', 'id3'],
    });

    expect(response.success).toBe(true);
  });

  it('handles GET_SESSION_FOR_TAB when no session assigned', async () => {
    const response = await sendTestMessage({
      type: MessageType.GET_SESSION_FOR_TAB,
      tabId: 42,
    });

    expect(response.success).toBe(true);
    expect(response.data).toBeUndefined();
  });

  it('handles GET_SESSION_FOR_TAB with assigned tab', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    await sendTestMessage({
      type: MessageType.ASSIGN_TAB,
      tabId: 10,
      sessionId,
      origin: 'https://example.com',
    });

    const response = await sendTestMessage({
      type: MessageType.GET_SESSION_FOR_TAB,
      tabId: 10,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ sessionId, origin: 'https://example.com' });
  });

  it('handles ASSIGN_TAB and UNASSIGN_TAB', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const assignResp = await sendTestMessage({
      type: MessageType.ASSIGN_TAB,
      tabId: 5,
      sessionId,
      origin: 'https://example.com',
    });
    expect(assignResp.success).toBe(true);

    const unassignResp = await sendTestMessage({
      type: MessageType.UNASSIGN_TAB,
      tabId: 5,
    });
    expect(unassignResp.success).toBe(true);

    const getResp = await sendTestMessage({
      type: MessageType.GET_SESSION_FOR_TAB,
      tabId: 5,
    });
    expect(getResp.data).toBeUndefined();
  });

  it('handles GET_SESSIONS_FOR_ORIGIN', async () => {
    const response = await sendTestMessage({
      type: MessageType.GET_SESSIONS_FOR_ORIGIN,
      origin: 'https://nonexistent.com',
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('handles DETECT_SESSION', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const response = await sendTestMessage({
      type: MessageType.DETECT_SESSION,
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    expect(response.data).toBeNull();
  });

  it('handles SAVE_SESSION_DATA when tab has no URL', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 1 } as chrome.tabs.Tab);

    const response = await sendTestMessage({
      type: MessageType.SAVE_SESSION_DATA,
      tabId: 1,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Tab has no URL');
  });

  it('handles SAVE_SESSION_DATA when tab is not assigned', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 99,
      url: 'https://example.com',
    } as chrome.tabs.Tab);

    const response = await sendTestMessage({
      type: MessageType.SAVE_SESSION_DATA,
      tabId: 99,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Tab is not assigned to a session');
  });

  it('handles CLEAR_ORIGIN_DATA', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      url: 'https://example.com/page',
    } as chrome.tabs.Tab);
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const response = await sendTestMessage({
      type: MessageType.CLEAR_ORIGIN_DATA,
      tabId: 1,
    });

    expect(response.success).toBe(true);
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com/page' });
  });

  it('handles CLEAR_ORIGIN_DATA when tab has no URL', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 1 } as chrome.tabs.Tab);

    const response = await sendTestMessage({
      type: MessageType.CLEAR_ORIGIN_DATA,
      tabId: 1,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Tab has no URL');
  });

  it('handles DELETE_SESSION_ORIGIN_DATA', async () => {
    const response = await sendTestMessage({
      type: MessageType.DELETE_SESSION_ORIGIN_DATA,
      sessionId: 's1',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
  });

  it('handles UPDATE_SESSION_COOKIE', async () => {
    // Save a cookie snapshot first
    const snapshot: CookieSnapshot = {
      sessionId: 'msg-s1',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        {
          name: 'token',
          value: 'old',
          domain: '.example.com',
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'lax',
          hostOnly: false,
          session: false,
          storeId: '0',
        } as chrome.cookies.Cookie,
      ],
    };
    await cookieStore.save(snapshot);

    const response = await sendTestMessage({
      type: MessageType.UPDATE_SESSION_COOKIE,
      sessionId: 'msg-s1',
      origin: 'https://example.com',
      cookieName: 'token',
      cookieDomain: '.example.com',
      newValue: 'updated',
    });

    expect(response.success).toBe(true);
    const loaded = await cookieStore.load('msg-s1', 'https://example.com');
    expect(loaded?.cookies[0].value).toBe('updated');
  });

  it('handles DELETE_SESSION_COOKIE', async () => {
    const snapshot: CookieSnapshot = {
      sessionId: 'msg-s2',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        {
          name: 'to-delete',
          value: 'val',
          domain: '.example.com',
          path: '/',
          secure: false,
          httpOnly: false,
          sameSite: 'lax',
          hostOnly: false,
          session: true,
          storeId: '0',
        } as chrome.cookies.Cookie,
      ],
    };
    await cookieStore.save(snapshot);

    const response = await sendTestMessage({
      type: MessageType.DELETE_SESSION_COOKIE,
      sessionId: 'msg-s2',
      origin: 'https://example.com',
      cookieName: 'to-delete',
      cookieDomain: '.example.com',
    });

    expect(response.success).toBe(true);
    const loaded = await cookieStore.load('msg-s2', 'https://example.com');
    expect(loaded?.cookies).toHaveLength(0);
  });

  it('handles UPDATE_SESSION_STORAGE_ENTRY', async () => {
    const snapshot: StorageSnapshot = {
      sessionId: 'msg-s3',
      origin: 'https://example.com',
      timestamp: Date.now(),
      localStorage: { key1: 'old' },
      sessionStorage: {},
    };
    await storageStore.save(snapshot);

    const response = await sendTestMessage({
      type: MessageType.UPDATE_SESSION_STORAGE_ENTRY,
      sessionId: 'msg-s3',
      origin: 'https://example.com',
      storageType: 'localStorage',
      key: 'key1',
      value: 'new-value',
    });

    expect(response.success).toBe(true);
    const loaded = await storageStore.load('msg-s3', 'https://example.com');
    expect(loaded?.localStorage.key1).toBe('new-value');
  });

  it('handles DELETE_SESSION_STORAGE_ENTRY', async () => {
    const snapshot: StorageSnapshot = {
      sessionId: 'msg-s4',
      origin: 'https://example.com',
      timestamp: Date.now(),
      localStorage: { remove_me: 'val', keep: 'val2' },
      sessionStorage: {},
    };
    await storageStore.save(snapshot);

    const response = await sendTestMessage({
      type: MessageType.DELETE_SESSION_STORAGE_ENTRY,
      sessionId: 'msg-s4',
      origin: 'https://example.com',
      storageType: 'localStorage',
      key: 'remove_me',
    });

    expect(response.success).toBe(true);
    const loaded = await storageStore.load('msg-s4', 'https://example.com');
    expect(loaded?.localStorage).toEqual({ keep: 'val2' });
  });

  it('handles REFRESH_ACTIVE_SESSIONS', async () => {
    const response = await sendTestMessage({
      type: MessageType.REFRESH_ACTIVE_SESSIONS,
    });

    expect(response.success).toBe(true);
    expect((response.data as { refreshedCount: number }).refreshedCount).toBe(0);
  });

  it('handles EXPORT_FULL', async () => {
    // Create a session first
    await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'export-test',
      color: '#3B82F6',
    });

    const response = await sendTestMessage({
      type: MessageType.EXPORT_FULL,
    });

    expect(response.success).toBe(true);
    const data = response.data as {
      version: number;
      exportedAt: number;
      sessions: unknown[];
      cookieSnapshots: unknown[];
      storageSnapshots: unknown[];
    };
    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeGreaterThan(0);
    expect(data.sessions).toHaveLength(1);
    expect(data.cookieSnapshots).toEqual([]);
    expect(data.storageSnapshots).toEqual([]);
  });

  it('handles IMPORT_FULL with valid data', async () => {
    const response = await sendTestMessage({
      type: MessageType.IMPORT_FULL,
      data: {
        version: 1,
        exportedAt: Date.now(),
        sessions: [
          {
            id: 'old-id',
            name: 'imported',
            color: '#EF4444',
            createdAt: 1,
            updatedAt: 1,
            settings: {},
          },
        ],
        cookieSnapshots: [
          {
            sessionId: 'old-id',
            origin: 'https://example.com',
            timestamp: Date.now(),
            cookies: [{ name: 'c', value: 'v', domain: 'example.com', path: '/' }],
          },
        ],
        storageSnapshots: [],
      },
    });

    expect(response.success).toBe(true);
    expect((response.data as { imported: number }).imported).toBe(1);

    // Verify session was created
    const listResp = await sendTestMessage({ type: MessageType.LIST_SESSIONS });
    const sessions = listResp.data as Array<{ name: string }>;
    expect(sessions.some((s) => s.name === 'imported')).toBe(true);
  });

  it('handles IMPORT_FULL skipping duplicate names', async () => {
    await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'existing',
      color: '#3B82F6',
    });

    const response = await sendTestMessage({
      type: MessageType.IMPORT_FULL,
      data: {
        version: 1,
        exportedAt: Date.now(),
        sessions: [
          {
            id: 'dup-id',
            name: 'existing',
            color: '#EF4444',
            createdAt: 1,
            updatedAt: 1,
            settings: {},
          },
        ],
        cookieSnapshots: [],
        storageSnapshots: [],
      },
    });

    expect(response.success).toBe(true);
    expect((response.data as { imported: number }).imported).toBe(0);
  });

  it('handles GET_LIVE_COOKIES', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await sendTestMessage({
      type: MessageType.GET_LIVE_COOKIES,
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('handles GET_COOKIE_DIFF with no snapshot', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'no-session',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as { totalSnapshot: number; totalLive: number };
    expect(diff.totalSnapshot).toBe(0);
    expect(diff.totalLive).toBe(0);
  });

  it('handles GET_COOKIE_DIFF with matching cookies', async () => {
    const cookie = {
      name: 'SID',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    await cookieStore.save({
      sessionId: 'diff-session',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [cookie],
    });

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([cookie]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-session',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { matched: number };
      entries: Array<{ status: string }>;
    };
    expect(diff.summary.matched).toBe(1);
  });

  it('handles GET_COOKIE_DIFF with value_changed cookies', async () => {
    const snapCookie = {
      name: 'SID',
      value: 'old-value',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    await cookieStore.save({
      sessionId: 'diff-val',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [snapCookie],
    });

    const liveCookie = { ...snapCookie, value: 'new-value' };
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([liveCookie]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-val',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { valueChanged: number };
      entries: Array<{ status: string; snapshotValue: string; liveValue: string }>;
    };
    expect(diff.summary.valueChanged).toBe(1);
    expect(diff.entries[0].status).toBe('value_changed');
    expect(diff.entries[0].snapshotValue).toBe('old-value');
    expect(diff.entries[0].liveValue).toBe('new-value');
  });

  it('handles GET_COOKIE_DIFF with flags_changed cookies', async () => {
    const snapCookie = {
      name: 'SID',
      value: 'same',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax' as const,
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    await cookieStore.save({
      sessionId: 'diff-flags',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [snapCookie],
    });

    const liveCookie = { ...snapCookie, secure: false };
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([liveCookie]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-flags',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { flagsChanged: number };
      entries: Array<{ status: string; flagDiffs?: string[] }>;
    };
    expect(diff.summary.flagsChanged).toBe(1);
    expect(diff.entries[0].status).toBe('flags_changed');
    expect(diff.entries[0].flagDiffs).toContain('secure: true → false');
  });

  it('handles GET_COOKIE_DIFF with missing_in_browser cookies', async () => {
    const snapCookie = {
      name: 'SID',
      value: 'val',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    await cookieStore.save({
      sessionId: 'diff-missing',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [snapCookie],
    });

    // No live cookies — the snapshot cookie is missing in browser
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-missing',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { missingInBrowser: number };
      entries: Array<{ status: string }>;
    };
    expect(diff.summary.missingInBrowser).toBe(1);
    expect(diff.entries[0].status).toBe('missing_in_browser');
  });

  it('handles GET_COOKIE_DIFF with expired cookies', async () => {
    const snapCookie = {
      name: 'SID',
      value: 'val',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      hostOnly: false,
      session: false,
      storeId: '0',
      // Expired 1 hour ago
      expirationDate: Date.now() / 1000 - 3600,
    } as chrome.cookies.Cookie;

    await cookieStore.save({
      sessionId: 'diff-expired',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [snapCookie],
    });

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-expired',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { expired: number };
      entries: Array<{ status: string }>;
    };
    expect(diff.summary.expired).toBe(1);
    expect(diff.entries[0].status).toBe('expired');
  });

  it('handles GET_COOKIE_DIFF with extra_in_browser cookies', async () => {
    // Empty snapshot
    await cookieStore.save({
      sessionId: 'diff-extra',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [],
    });

    const liveCookie = {
      name: 'NEW',
      value: 'val',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([liveCookie]);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-extra',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      summary: { extraInBrowser: number };
      entries: Array<{ status: string; liveValue: string }>;
    };
    expect(diff.summary.extraInBrowser).toBe(1);
    expect(diff.entries[0].status).toBe('extra_in_browser');
    expect(diff.entries[0].liveValue).toBe('val');
  });

  it('handles GET_COOKIE_DIFF entries sorted by severity', async () => {
    const snapCookies = [
      {
        name: 'MATCH',
        value: 'same',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
        hostOnly: false,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
      {
        name: 'CHANGED',
        value: 'old',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
        hostOnly: false,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];

    await cookieStore.save({
      sessionId: 'diff-sort',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: snapCookies,
    });

    const liveCookies = [
      { ...snapCookies[0] }, // match
      { ...snapCookies[1], value: 'new' }, // value changed
    ];
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(liveCookies);

    const response = await sendTestMessage({
      type: MessageType.GET_COOKIE_DIFF,
      sessionId: 'diff-sort',
      origin: 'https://example.com',
    });

    expect(response.success).toBe(true);
    const diff = response.data as {
      entries: Array<{ status: string; name: string }>;
    };
    // value_changed should come before match in sort order
    expect(diff.entries[0].status).toBe('value_changed');
    expect(diff.entries[1].status).toBe('match');
  });

  it('handles GET_RESTORE_FAILURES', async () => {
    const response = await sendTestMessage({
      type: MessageType.GET_RESTORE_FAILURES,
    });

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
  });

  it('handles GET_SESSION_DETAILS with cookie and storage data', async () => {
    const cookieSnap: CookieSnapshot = {
      sessionId: 'msg-details',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        {
          name: 'c1',
          value: 'v1',
          domain: '.example.com',
          path: '/',
          secure: false,
          httpOnly: false,
          sameSite: 'lax',
          hostOnly: false,
          session: true,
          storeId: '0',
        } as chrome.cookies.Cookie,
      ],
    };
    await cookieStore.save(cookieSnap);

    const storageSnap: StorageSnapshot = {
      sessionId: 'msg-details',
      origin: 'https://example.com',
      timestamp: Date.now(),
      localStorage: { k: 'v' },
      sessionStorage: {},
    };
    await storageStore.save(storageSnap);

    const response = await sendTestMessage({
      type: MessageType.GET_SESSION_DETAILS,
      sessionId: 'msg-details',
    });

    expect(response.success).toBe(true);
    const details = response.data as {
      sessionId: string;
      origins: Array<{ origin: string; cookieCount: number }>;
      totalCookies: number;
    };
    expect(details.sessionId).toBe('msg-details');
    expect(details.origins).toHaveLength(1);
    expect(details.origins[0].origin).toBe('https://example.com');
    expect(details.origins[0].cookieCount).toBe(1);
    expect(details.totalCookies).toBe(1);
  });
});
