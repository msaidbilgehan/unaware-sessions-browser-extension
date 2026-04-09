import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  saveCookies,
  clearCookies,
  restoreCookies,
  switchSession,
  saveTabStorage,
  saveAllCookiesForSession,
  detectSessionForOrigin,
  handleContentScriptReady,
  cleanupPendingRestore,
} from '@background/cookie-engine';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import { hydrateSessions, createSession } from '@background/session-manager';
import { hydrateTabMap, assignTab } from '@background/tab-tracker';

const MOCK_COOKIES: chrome.cookies.Cookie[] = [
  {
    name: 'sid',
    value: 'abc123',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Date.now() / 1000 + 3600,
    hostOnly: false,
    session: false,
    storeId: '0',
  } as chrome.cookies.Cookie,
  {
    name: 'theme',
    value: 'dark',
    domain: 'example.com',
    path: '/',
    secure: false,
    httpOnly: false,
    sameSite: 'lax',
    hostOnly: true,
    session: true,
    storeId: '0',
  } as chrome.cookies.Cookie,
];

beforeEach(async () => {
  resetChromeMocks();
  await cookieStore.deleteAll();
  // storageStore uses fake-indexeddb, cleaned implicitly between sessions
  await hydrateSessions();
  await hydrateTabMap();
});

describe('saveCookies', () => {
  it('saves cookies for a session and origin', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);

    await saveCookies('session-1', 'https://example.com');

    const snapshot = await cookieStore.load('session-1', 'https://example.com');
    expect(snapshot).toBeDefined();
    expect(snapshot?.cookies).toHaveLength(2);
    expect(snapshot?.cookies[0].name).toBe('sid');
  });

  it('does nothing for empty domain', async () => {
    await saveCookies('session-1', '');
    expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  });
});

describe('clearCookies', () => {
  it('removes all cookies for a domain', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);

    await clearCookies('https://example.com');

    expect(chrome.cookies.remove).toHaveBeenCalledTimes(2);
    expect(chrome.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sid' }),
    );
    expect(chrome.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'theme' }),
    );
  });

  it('clears parent-domain cookies when on a subdomain', async () => {
    const wwwCookie = {
      name: 'pref',
      value: 'dark',
      domain: 'www.google.com',
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'lax' as const,
      hostOnly: true,
      session: true,
      storeId: '0',
    } as chrome.cookies.Cookie;

    const parentCookie = {
      name: 'SID',
      value: 'abc123',
      domain: '.google.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax' as const,
      hostOnly: false,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    // First getAll({ domain: "www.google.com" }) returns only the www cookie
    // Second getAll({ domain: "google.com" }) returns both (parent includes subdomains)
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([wwwCookie])
      .mockResolvedValueOnce([parentCookie, wwwCookie]);

    await clearCookies('https://www.google.com');

    expect(chrome.cookies.remove).toHaveBeenCalledTimes(2);
    expect(chrome.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pref' }),
    );
    expect(chrome.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SID' }),
    );
  });

  it('does not clear sibling subdomain cookies', async () => {
    const wwwCookie = {
      name: 'pref',
      value: 'dark',
      domain: 'www.google.com',
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'lax' as const,
      hostOnly: true,
      session: true,
      storeId: '0',
    } as chrome.cookies.Cookie;

    const mailCookie = {
      name: 'MAID',
      value: 'xyz',
      domain: 'mail.google.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax' as const,
      hostOnly: true,
      session: false,
      storeId: '0',
    } as chrome.cookies.Cookie;

    // getAll({ domain: "www.google.com" }) returns only www cookie
    // getAll({ domain: "google.com" }) returns both subdomains
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([wwwCookie])
      .mockResolvedValueOnce([wwwCookie, mailCookie]);

    await clearCookies('https://www.google.com');

    // Only www cookie should be removed, NOT mail.google.com cookie
    expect(chrome.cookies.remove).toHaveBeenCalledTimes(1);
    expect(chrome.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pref' }),
    );
  });
});

describe('restoreCookies', () => {
  it('restores cookies from a saved snapshot', async () => {
    // First save a snapshot
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);
    await saveCookies('session-1', 'https://example.com');

    // Then restore
    await restoreCookies('session-1', 'https://example.com');

    expect(chrome.cookies.set).toHaveBeenCalledTimes(2);
    expect(chrome.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'sid', value: 'abc123' }),
    );
  });

  it('does nothing when no snapshot exists', async () => {
    await restoreCookies('non-existent', 'https://example.com');
    expect(chrome.cookies.set).not.toHaveBeenCalled();
  });

  it('forces secure=true for sameSite no_restriction', async () => {
    const noneRestrictionCookie = [
      {
        name: 'cross',
        value: 'val',
        domain: '.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'no_restriction' as const,
        hostOnly: false,
        session: true,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      noneRestrictionCookie,
    );
    await saveCookies('session-1', 'https://example.com');
    await restoreCookies('session-1', 'https://example.com');

    expect(chrome.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'cross', secure: true }),
    );
  });
});

describe('switchSession', () => {
  it('orchestrates the full switch flow', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      url: 'https://example.com/page',
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const session = await createSession('test', '#3B82F6');
    await assignTab(1, session.id, 'https://example.com');

    const newSession = await createSession('new-session', '#EF4444');

    // Mock sendMessage for content script interaction (may fail gracefully)
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    await switchSession(1, newSession.id);

    // Tab should be navigated to same URL (fresh navigation)
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: 'https://example.com/page' });

    // DNR rules should be updated
    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalled();
  });

  it('throws if tab has no URL', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 1 });

    await expect(switchSession(1, 'session-2')).rejects.toThrow('Tab has no URL');
  });

  it('queues pending storage restore before navigating (regression: pendingRestores)', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 3,
      url: 'https://example.com/page',
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const session = await createSession('target', '#3B82F6');

    // Save a storage snapshot for the target session so restoreTabStorage has data to restore
    await storageStore.save({
      sessionId: session.id,
      origin: 'https://example.com',
      timestamp: Date.now(),
      localStorage: { restored: 'true' },
      sessionStorage: {},
    });

    await switchSession(3, session.id);

    // After switchSession, handleContentScriptReady should find the pending entry
    // and attempt to restore storage via chrome.tabs.sendMessage
    const sendCallsBefore = (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length;
    handleContentScriptReady(3);
    await new Promise((r) => setTimeout(r, 20));
    const sendCallsAfter = (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(sendCallsAfter).toBeGreaterThan(sendCallsBefore);

    // Second call should be a no-op — pending entry was consumed
    const callsAfterSecond = (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length;
    handleContentScriptReady(3);
    await new Promise((r) => setTimeout(r, 20));
    expect((chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterSecond);
  });

  it('saves all cookies (not just origin) before switching (regression: cross-domain)', async () => {
    const crossDomainCookies = [
      ...MOCK_COOKIES,
      {
        name: 'auth',
        value: 'cross-token',
        domain: '.auth-provider.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax' as const,
        hostOnly: false,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];

    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 4,
      url: 'https://example.com/page',
    });
    // getAll({}) returns all cookies including cross-domain
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(crossDomainCookies);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    const currentSession = await createSession('current', '#3B82F6');
    await assignTab(4, currentSession.id, 'https://example.com');
    const targetSession = await createSession('target', '#EF4444');

    await switchSession(4, targetSession.id);

    // Verify the saved snapshot contains ALL cookies (including cross-domain)
    const savedSnapshot = await cookieStore.load(currentSession.id, 'https://example.com');
    expect(savedSnapshot).toBeDefined();
    expect(savedSnapshot?.cookies).toHaveLength(3);
    expect(savedSnapshot?.cookies.some((c) => c.domain === '.auth-provider.com')).toBe(true);
  });
});

describe('saveTabStorage', () => {
  it('saves storage data from content script response', async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: {
        localStorage: { key: 'val' },
        sessionStorage: { skey: 'sval' },
        indexedDB: [],
      },
    });

    await saveTabStorage(1, 'session-1', 'https://example.com');

    const snapshot = await storageStore.load('session-1', 'https://example.com');
    expect(snapshot).toBeDefined();
    expect(snapshot?.localStorage).toEqual({ key: 'val' });
    expect(snapshot?.sessionStorage).toEqual({ skey: 'sval' });
  });

  it('does not save when content script response fails', async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'No access',
    });

    await saveTabStorage(1, 'session-fail', 'https://fail.example.com');

    const snapshot = await storageStore.load('session-fail', 'https://fail.example.com');
    expect(snapshot).toBeUndefined();
  });

  it('handles content script timeout gracefully', async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    // Should not throw (timeout is caught internally)
    await saveTabStorage(1, 'session-timeout', 'https://timeout.example.com');

    const snapshot = await storageStore.load('session-timeout', 'https://timeout.example.com');
    expect(snapshot).toBeUndefined();
  }, 10000);
});

describe('saveAllCookiesForSession', () => {
  it('saves all browser cookies under the session origin key', async () => {
    const allCookies = [
      ...MOCK_COOKIES,
      {
        name: 'auth',
        value: 'token',
        domain: '.other.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax' as const,
        hostOnly: false,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(allCookies);

    await saveAllCookiesForSession('session-1', 'https://example.com');

    const snapshot = await cookieStore.load('session-1', 'https://example.com');
    expect(snapshot).toBeDefined();
    expect(snapshot?.cookies).toHaveLength(3);
  });
});

describe('detectSessionForOrigin', () => {
  it('returns null when no domain can be extracted', async () => {
    const result = await detectSessionForOrigin('');
    expect(result).toBeNull();
  });

  it('returns null when no live cookies exist', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await detectSessionForOrigin('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null when no session snapshots exist', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);

    const result = await detectSessionForOrigin('https://example.com');
    expect(result).toBeNull();
  });

  it('detects session with matching cookies', async () => {
    // Save a snapshot for session-1
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);
    await saveCookies('session-1', 'https://example.com');

    // Now mock live cookies as same cookies
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);

    const result = await detectSessionForOrigin('https://example.com');
    expect(result).toBe('session-1');
  });

  it('returns null when match score is below 30% threshold', async () => {
    // Save a snapshot with many cookies
    const manyCookies = Array.from({ length: 10 }, (_, i) => ({
      name: `cookie${i}`,
      value: `val${i}`,
      domain: '.example.com',
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'lax' as const,
      hostOnly: false,
      session: true,
      storeId: '0',
    })) as chrome.cookies.Cookie[];

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(manyCookies);
    await saveCookies('session-1', 'https://example.com');

    // Live cookies have only 1 of 10 matching (10% < 30% threshold)
    const liveCookies = [
      manyCookies[0],
      ...Array.from({ length: 9 }, (_, i) => ({
        name: `different${i}`,
        value: `other${i}`,
        domain: '.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'lax' as const,
        hostOnly: false,
        session: true,
        storeId: '0',
      })),
    ] as chrome.cookies.Cookie[];

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(liveCookies);

    const result = await detectSessionForOrigin('https://example.com');
    expect(result).toBeNull();
  });
});

describe('handleContentScriptReady', () => {
  it('does nothing when no pending restore exists', () => {
    // Should not throw
    handleContentScriptReady(42);
  });
});

describe('cleanupPendingRestore', () => {
  it('removes pending restore for a tab', () => {
    // Should not throw even if no pending entry
    cleanupPendingRestore(42);
  });
});

describe('restoreCookies edge cases', () => {
  it('forces secure=true for __Host- prefixed cookies', async () => {
    const hostCookie = [
      {
        name: '__Host-session',
        value: 'xyz',
        domain: 'example.com',
        path: '/',
        secure: false,
        httpOnly: true,
        sameSite: 'strict' as const,
        hostOnly: true,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(hostCookie);
    await saveCookies('session-1', 'https://example.com');
    await restoreCookies('session-1', 'https://example.com');

    expect(chrome.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '__Host-session',
        secure: true,
        path: '/',
      }),
    );
    // __Host- cookies should NOT have domain set
    const call = (chrome.cookies.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).not.toHaveProperty('domain');
  });

  it('forces secure=true for __Secure- prefixed cookies', async () => {
    const secureCookie = [
      {
        name: '__Secure-token',
        value: 'abc',
        domain: '.example.com',
        path: '/app',
        secure: false,
        httpOnly: false,
        sameSite: 'lax' as const,
        hostOnly: false,
        session: true,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ];

    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(secureCookie);
    await saveCookies('session-1', 'https://example.com');
    await restoreCookies('session-1', 'https://example.com');

    expect(chrome.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '__Secure-token',
        secure: true,
      }),
    );
  });

  it('handles partial cookie set failures gracefully', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);
    await saveCookies('session-1', 'https://example.com');

    // First cookie fails, second succeeds
    (chrome.cookies.set as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Cookie rejected'))
      .mockResolvedValueOnce(null);

    // Should not throw — failures are warned, not thrown
    await restoreCookies('session-1', 'https://example.com');
  });
});
