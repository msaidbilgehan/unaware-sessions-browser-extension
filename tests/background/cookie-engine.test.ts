import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { saveCookies, clearCookies, restoreCookies, switchSession } from '@background/cookie-engine';
import { cookieStore } from '@background/cookie-store';
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
});
