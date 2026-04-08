import { describe, it, expect, beforeEach } from 'vitest';
import type { CookieSnapshot } from '@shared/types';
import { cookieStore } from '@background/cookie-store';

function makeCookieSnapshot(
  sessionId: string,
  origin: string,
): CookieSnapshot {
  return {
    sessionId,
    origin,
    timestamp: Date.now(),
    cookies: [
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
    ],
  };
}

beforeEach(async () => {
  // Clear the store before each test
  await cookieStore.deleteAll();
});

describe('cookie-store', () => {
  it('saves and loads a cookie snapshot', async () => {
    const snapshot = makeCookieSnapshot('session-1', 'https://example.com');
    await cookieStore.save(snapshot);

    const loaded = await cookieStore.load('session-1', 'https://example.com');
    expect(loaded).toBeDefined();
    expect(loaded?.cookies).toHaveLength(1);
    expect(loaded?.cookies[0].name).toBe('sid');
  });

  it('returns undefined for non-existent snapshot', async () => {
    const loaded = await cookieStore.load('missing', 'https://example.com');
    expect(loaded).toBeUndefined();
  });

  it('overwrites existing snapshot on save', async () => {
    const s1 = makeCookieSnapshot('session-1', 'https://example.com');
    await cookieStore.save(s1);

    const s2 = { ...s1, cookies: [] };
    await cookieStore.save(s2);

    const loaded = await cookieStore.load('session-1', 'https://example.com');
    expect(loaded?.cookies).toHaveLength(0);
  });

  it('deletes all snapshots for a session', async () => {
    await cookieStore.save(makeCookieSnapshot('session-1', 'https://a.com'));
    await cookieStore.save(makeCookieSnapshot('session-1', 'https://b.com'));
    await cookieStore.save(makeCookieSnapshot('session-2', 'https://a.com'));

    await cookieStore.deleteForSession('session-1');

    expect(await cookieStore.load('session-1', 'https://a.com')).toBeUndefined();
    expect(await cookieStore.load('session-1', 'https://b.com')).toBeUndefined();
    expect(await cookieStore.load('session-2', 'https://a.com')).toBeDefined();
  });

  it('clears all snapshots', async () => {
    await cookieStore.save(makeCookieSnapshot('session-1', 'https://a.com'));
    await cookieStore.save(makeCookieSnapshot('session-2', 'https://b.com'));

    await cookieStore.deleteAll();

    expect(await cookieStore.load('session-1', 'https://a.com')).toBeUndefined();
    expect(await cookieStore.load('session-2', 'https://b.com')).toBeUndefined();
  });
});

describe('getStatsForSession', () => {
  it('returns correct cookie count and origins', async () => {
    await cookieStore.save(makeCookieSnapshot('s1', 'https://a.com'));
    await cookieStore.save(makeCookieSnapshot('s1', 'https://b.com'));

    const stats = await cookieStore.getStatsForSession('s1');
    expect(stats.cookieCount).toBe(2); // 1 cookie per snapshot
    expect(stats.origins).toContain('https://a.com');
    expect(stats.origins).toContain('https://b.com');
    expect(stats.origins).toHaveLength(2);
    expect(stats.cookieBytes).toBeGreaterThan(0);
  });

  it('returns zeros for unknown session', async () => {
    const stats = await cookieStore.getStatsForSession('unknown');
    expect(stats.cookieCount).toBe(0);
    expect(stats.cookieBytes).toBe(0);
    expect(stats.origins).toHaveLength(0);
  });

  it('does not count other sessions', async () => {
    await cookieStore.save(makeCookieSnapshot('s1', 'https://a.com'));
    await cookieStore.save(makeCookieSnapshot('s2', 'https://b.com'));

    const stats = await cookieStore.getStatsForSession('s1');
    expect(stats.origins).toEqual(['https://a.com']);
    expect(stats.cookieCount).toBe(1);
  });
});
