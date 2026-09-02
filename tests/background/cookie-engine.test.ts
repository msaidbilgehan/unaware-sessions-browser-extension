import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  saveCookies,
  clearCookies,
  restoreCookies,
  switchSession,
  saveTabStorage,
  detectSessionForOrigin,
  handleContentScriptReady,
  cleanupPendingRestore,
  restorePreviousSnapshot,
} from '@background/cookie-engine';
import { snapshotUndo } from '@background/snapshot-undo';
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

/** Two cookies scoped to `host`, so getCookiesForOrigin's origin filter keeps them. */
function cookiesForHost(host: string): chrome.cookies.Cookie[] {
  return MOCK_COOKIES.map(
    (c) =>
      ({
        ...c,
        domain: c.hostOnly ? host : `.${host}`,
      }) as chrome.cookies.Cookie,
  );
}

beforeEach(async () => {
  resetChromeMocks();
  await cookieStore.deleteAll();
  await snapshotUndo.deleteAll();
  await storageStore.deleteAll();
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

    // Save a cookie snapshot so the full switch path executes
    // (soft isolation skips clear+restore when no cookie data exists)
    await cookieStore.save({
      sessionId: session.id,
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'sid', value: '123', domain: 'example.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });

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

  it('saves only origin-scoped cookies before switching (no cross-domain pollution)', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 4,
      url: 'https://example.com/page',
    });
    // getCookiesForOrigin returns only origin-scoped cookies (no cross-domain)
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_COOKIES);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    const currentSession = await createSession('current', '#3B82F6');
    await assignTab(4, currentSession.id, 'https://example.com');
    const targetSession = await createSession('target', '#EF4444');

    await switchSession(4, targetSession.id);

    // Verify the saved snapshot only contains origin-scoped cookies
    const savedSnapshot = await cookieStore.load(currentSession.id, 'https://example.com');
    expect(savedSnapshot).toBeDefined();
    expect(savedSnapshot?.cookies).toHaveLength(2);
    expect(savedSnapshot?.cookies.some((c) => c.domain === '.auth-provider.com')).toBe(false);
  });

  it('adopts live state into an empty target session on soft-mode pass-through', async () => {
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 6,
      url: 'https://adopt.example/page',
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'live',
        value: 'state',
        domain: 'adopt.example',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'lax',
        hostOnly: true,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    const target = await createSession('empty-target', '#EF4444');
    await switchSession(6, target.id);

    // Pass-through must snapshot the live cookies into the target session so
    // a brand-new session has durable data immediately
    const snapshot = await cookieStore.load(target.id, 'https://adopt.example');
    expect(snapshot).toBeTruthy();
    expect(snapshot?.cookies.some((c) => c.name === 'live')).toBe(true);

    // Pass-through must not clear the live cookies
    expect(chrome.cookies.remove).not.toHaveBeenCalled();

    // Tab still reloads for a clean state
    expect(chrome.tabs.update).toHaveBeenCalledWith(6, { url: 'https://adopt.example/page' });
  });

  // The pass-through *adopts* live state into the target session, so anything
  // it misclassifies as unmanaged gets its saved login overwritten by the
  // outgoing session's. A session can hold real data for an origin and still
  // have no live cookies, in two shapes — both must take the clear+restore path.
  it('restores instead of adopting when the target has storage-only data', async () => {
    const ORIGIN = 'https://storage-only.example';
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 7,
      url: `${ORIGIN}/app`,
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(
      cookiesForHost('storage-only.example'),
    );
    // The live page reports the *outgoing* session's token.
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { localStorage: { token: 'outgoing-token' }, sessionStorage: {}, indexedDB: [] },
    });

    // A Firebase/Supabase-style login: token in localStorage, no cookie snapshot.
    const target = await createSession('storage-only-target', '#EF4444');
    await storageStore.save({
      sessionId: target.id,
      origin: ORIGIN,
      timestamp: Date.now(),
      localStorage: { token: 'real-token' },
      sessionStorage: {},
      indexedDB: [],
    });

    await switchSession(7, target.id);

    // The session's own token must survive the switch, not be replaced by the
    // state that happened to be on screen.
    const stored = await storageStore.load(target.id, ORIGIN);
    expect(stored?.localStorage.token).toBe('real-token');
    // And the switch must actually isolate rather than pass through.
    expect(chrome.cookies.remove).toHaveBeenCalled();
  });

  it('restores instead of adopting when the target is logged out but has an undo slot', async () => {
    const ORIGIN = 'https://logged-out.example';
    const target = await createSession('logged-out-target', '#EF4444');

    // Log in, then out: the empty capture moves the real cookies to the undo slot.
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(
      cookiesForHost('logged-out.example'),
    );
    await saveCookies(target.id, ORIGIN);
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await saveCookies(target.id, ORIGIN);
    expect((await snapshotUndo.getCookies(target.id, ORIGIN))?.cookies).toHaveLength(2);

    // Now switch to it while another session's cookies are live in the jar.
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 8,
      url: `${ORIGIN}/page`,
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        name: 'other-session-sid',
        value: 'not-mine',
        domain: 'logged-out.example',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'lax',
        hostOnly: true,
        session: false,
        storeId: '0',
      } as chrome.cookies.Cookie,
    ]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    await switchSession(8, target.id);

    // The undo slot is the only surviving copy of this session's cookies —
    // adopting would overwrite the snapshot and then drop the slot.
    expect((await snapshotUndo.getCookies(target.id, ORIGIN))?.cookies).toHaveLength(2);
    const snapshot = await cookieStore.load(target.id, ORIGIN);
    expect(snapshot?.cookies.some((c) => c.name === 'other-session-sid')).toBe(false);
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

describe('restoreCookies origin filtering', () => {
  it('filters out cross-domain cookies from legacy snapshots', async () => {
    // Manually save a snapshot with cross-domain cookies (simulating legacy data)
    await cookieStore.save({
      sessionId: 'filter-session',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        {
          name: 'sid',
          value: '123',
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
          name: 'gid',
          value: 'google-leak',
          domain: '.google.com',
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'lax',
          hostOnly: false,
          session: false,
          storeId: '0',
        } as chrome.cookies.Cookie,
      ],
    });

    await restoreCookies('filter-session', 'https://example.com');

    // Only the example.com cookie should be restored, NOT google.com
    const setCalls = (chrome.cookies.set as ReturnType<typeof vi.fn>).mock.calls;
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0][0].name).toBe('sid');
  });

  it('includes parent-domain cookies for subdomain origins', async () => {
    await cookieStore.save({
      sessionId: 'parent-session',
      origin: 'https://www.example.com',
      timestamp: Date.now(),
      cookies: [
        {
          name: 'sub',
          value: 'a',
          domain: 'www.example.com',
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'lax',
          hostOnly: true,
          session: false,
          storeId: '0',
        } as chrome.cookies.Cookie,
        {
          name: 'parent',
          value: 'b',
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
    });

    await restoreCookies('parent-session', 'https://www.example.com');

    const setCalls = (chrome.cookies.set as ReturnType<typeof vi.fn>).mock.calls;
    expect(setCalls).toHaveLength(2);
    const names = setCalls.map((c: unknown[]) => (c[0] as { name: string }).name).sort();
    expect(names).toEqual(['parent', 'sub']);
  });

  it('returns early when no snapshot exists', async () => {
    await restoreCookies('nonexistent', 'https://example.com');
    expect(chrome.cookies.set).not.toHaveBeenCalled();
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

  // chrome.cookies.set makes a cookie host-only by omitting `domain`; passing
  // it back always yields a domain cookie, silently widening the scope the site
  // deliberately refused.
  it('restores a host-only cookie without widening it to subdomains', async () => {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_COOKIES);
    await saveCookies('session-1', 'https://example.com');

    (chrome.cookies.set as ReturnType<typeof vi.fn>).mockClear();
    await restoreCookies('session-1', 'https://example.com');

    const calls = (chrome.cookies.set as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    // 'theme' is hostOnly:true in MOCK_COOKIES — must be re-created host-only.
    const hostOnly = calls.find((c) => c.name === 'theme');
    expect(hostOnly).toBeDefined();
    expect('domain' in hostOnly).toBe(false);

    // 'sid' is a genuine domain cookie (.example.com) and must keep its domain.
    const domainCookie = calls.find((c) => c.name === 'sid');
    expect(domainCookie?.domain).toBe('.example.com');
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

// A capture that reads zero cookies is indistinguishable from a real logout
// (Chrome's "Clear browsing data", another extension, and a site clearing its
// own cookie all look the same), so the snapshot still becomes empty — but the
// outgoing data is preserved in a recoverable slot first.
describe('snapshot undo buffer', () => {
  const ORIGIN = 'https://example.com';

  function mockLiveCookies(cookies: chrome.cookies.Cookie[]): void {
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(cookies);
  }

  it('preserves the previous snapshot when a capture comes back empty', async () => {
    mockLiveCookies(MOCK_COOKIES);
    await saveCookies('session-1', ORIGIN);

    mockLiveCookies([]);
    await saveCookies('session-1', ORIGIN);

    // Live snapshot mirrors the browser...
    expect((await cookieStore.load('session-1', ORIGIN))?.cookies).toHaveLength(0);
    // ...and the previous state is recoverable.
    expect((await snapshotUndo.getCookies('session-1', ORIGIN))?.cookies).toHaveLength(2);
  });

  it('does not create a slot when there was nothing to lose', async () => {
    mockLiveCookies([]);
    await saveCookies('session-1', ORIGIN);

    expect(await snapshotUndo.getCookies('session-1', ORIGIN)).toBeUndefined();
    expect(await cookieStore.load('session-1', ORIGIN)).toBeDefined();
  });

  it('does not overwrite an existing slot with a second empty capture', async () => {
    mockLiveCookies(MOCK_COOKIES);
    await saveCookies('session-1', ORIGIN);
    mockLiveCookies([]);
    await saveCookies('session-1', ORIGIN);
    await saveCookies('session-1', ORIGIN);

    expect((await snapshotUndo.getCookies('session-1', ORIGIN))?.cookies).toHaveLength(2);
  });

  it('drops the slot once real data is captured again', async () => {
    mockLiveCookies(MOCK_COOKIES);
    await saveCookies('session-1', ORIGIN);
    mockLiveCookies([]);
    await saveCookies('session-1', ORIGIN);
    expect(await snapshotUndo.getCookies('session-1', ORIGIN)).toBeDefined();

    mockLiveCookies(MOCK_COOKIES);
    await saveCookies('session-1', ORIGIN);

    expect(await snapshotUndo.getCookies('session-1', ORIGIN)).toBeUndefined();
  });

  // Fail closed: without a writable slot, replacing the snapshot with an empty
  // capture would destroy the only copy.
  it('keeps the existing snapshot when the undo slot cannot be written', async () => {
    mockLiveCookies(MOCK_COOKIES);
    await saveCookies('session-1', ORIGIN);

    const putSpy = vi.spyOn(snapshotUndo, 'put').mockRejectedValue(new Error('quota'));
    mockLiveCookies([]);
    await saveCookies('session-1', ORIGIN);
    putSpy.mockRestore();

    expect((await cookieStore.load('session-1', ORIGIN))?.cookies).toHaveLength(2);
  });

  it('preserves DOM storage the same way', async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { localStorage: { token: 'abc' }, sessionStorage: {}, indexedDB: [] },
    });
    await saveTabStorage(1, 'session-1', ORIGIN);

    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { localStorage: {}, sessionStorage: {}, indexedDB: [] },
    });
    await saveTabStorage(1, 'session-1', ORIGIN);

    expect(await storageStore.load('session-1', ORIGIN)).toBeDefined();
    expect((await snapshotUndo.getStorage('session-1', ORIGIN))?.localStorage).toEqual({
      token: 'abc',
    });
  });

  describe('restorePreviousSnapshot', () => {
    it('moves the slot back into the live snapshot and clears it', async () => {
      mockLiveCookies(MOCK_COOKIES);
      await saveCookies('session-1', ORIGIN);
      mockLiveCookies([]);
      await saveCookies('session-1', ORIGIN);

      const result = await restorePreviousSnapshot('session-1', ORIGIN);

      expect(result.cookiesRestored).toBe(2);
      expect((await cookieStore.load('session-1', ORIGIN))?.cookies).toHaveLength(2);
      expect(await snapshotUndo.getCookies('session-1', ORIGIN)).toBeUndefined();
    });

    it('swaps when the live snapshot still has data, so the restore is reversible', async () => {
      await cookieStore.save({
        sessionId: 'session-1',
        origin: ORIGIN,
        timestamp: 1,
        cookies: [MOCK_COOKIES[0]],
      });
      await snapshotUndo.put('cookies', {
        sessionId: 'session-1',
        origin: ORIGIN,
        timestamp: 2,
        cookies: MOCK_COOKIES,
      });

      await restorePreviousSnapshot('session-1', ORIGIN);

      expect((await cookieStore.load('session-1', ORIGIN))?.cookies).toHaveLength(2);
      expect((await snapshotUndo.getCookies('session-1', ORIGIN))?.cookies).toHaveLength(1);
    });

    it('is a no-op when there is no slot', async () => {
      const result = await restorePreviousSnapshot('session-1', ORIGIN);
      expect(result).toEqual({ cookiesRestored: 0, storageRestored: false });
    });
  });
});
