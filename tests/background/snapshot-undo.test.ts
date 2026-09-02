import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  snapshotUndo,
  isEmptyCookieSnapshot,
  isEmptyStorageSnapshot,
} from '@background/snapshot-undo';
import type { CookieSnapshot, StorageSnapshot } from '@shared/types';

function cookieSnap(sessionId: string, origin: string, cookieCount = 1): CookieSnapshot {
  return {
    sessionId,
    origin,
    timestamp: 1000,
    cookies: Array.from({ length: cookieCount }, (_, i) => ({
      name: `c${i}`,
      value: 'v',
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax' as chrome.cookies.SameSiteStatus,
      storeId: '0',
      hostOnly: false,
      session: false,
    })),
  };
}

function storageSnap(sessionId: string, origin: string): StorageSnapshot {
  return {
    sessionId,
    origin,
    timestamp: 1000,
    localStorage: { token: 'abc' },
    sessionStorage: {},
  };
}

beforeEach(async () => {
  resetChromeMocks();
  await snapshotUndo.deleteAll();
});

describe('emptiness predicates', () => {
  it('treats a snapshot with no cookies as empty', () => {
    expect(isEmptyCookieSnapshot(cookieSnap('s', 'https://a.com', 0))).toBe(true);
    expect(isEmptyCookieSnapshot(cookieSnap('s', 'https://a.com', 1))).toBe(false);
  });

  // A storage snapshot is only empty when all three areas are — a site whose
  // login lives in IndexedDB has no localStorage keys at all.
  it('requires localStorage, sessionStorage and IndexedDB to all be empty', () => {
    const base: StorageSnapshot = {
      sessionId: 's',
      origin: 'https://a.com',
      timestamp: 1,
      localStorage: {},
      sessionStorage: {},
    };
    expect(isEmptyStorageSnapshot(base)).toBe(true);
    expect(isEmptyStorageSnapshot({ ...base, localStorage: { a: '1' } })).toBe(false);
    expect(isEmptyStorageSnapshot({ ...base, sessionStorage: { a: '1' } })).toBe(false);
    expect(
      isEmptyStorageSnapshot({
        ...base,
        indexedDB: [{ name: 'db', version: 1, objectStores: [] }],
      }),
    ).toBe(false);
  });
});

describe('snapshotUndo', () => {
  it('stores and returns a slot per kind and origin', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com', 3));
    await snapshotUndo.put('storage', storageSnap('s1', 'https://a.com'));

    expect((await snapshotUndo.getCookies('s1', 'https://a.com'))?.cookies).toHaveLength(3);
    expect(await snapshotUndo.getStorage('s1', 'https://a.com')).toBeDefined();
    expect(await snapshotUndo.getCookies('s1', 'https://b.com')).toBeUndefined();
  });

  it('keeps one slot per key — a second put replaces the first', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com', 2));
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com', 5));

    expect((await snapshotUndo.getCookies('s1', 'https://a.com'))?.cookies).toHaveLength(5);
    expect(await snapshotUndo.countAll()).toBe(1);
  });

  it('drops both kinds for one origin', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com'));
    await snapshotUndo.put('storage', storageSnap('s1', 'https://a.com'));
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://b.com'));

    await snapshotUndo.deleteForOrigin('s1', 'https://a.com');

    expect(await snapshotUndo.getCookies('s1', 'https://a.com')).toBeUndefined();
    expect(await snapshotUndo.getStorage('s1', 'https://a.com')).toBeUndefined();
    expect(await snapshotUndo.getCookies('s1', 'https://b.com')).toBeDefined();
  });

  it('drops every slot of a session across both stores', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com'));
    await snapshotUndo.put('storage', storageSnap('s1', 'https://b.com'));
    await snapshotUndo.put('cookies', cookieSnap('s2', 'https://a.com'));

    await snapshotUndo.deleteForSession('s1');

    expect(await snapshotUndo.countAll()).toBe(1);
    expect(await snapshotUndo.getCookies('s2', 'https://a.com')).toBeDefined();
  });

  it('lists slots of one kind for a session', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com'));
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://b.com'));
    await snapshotUndo.put('cookies', cookieSnap('s2', 'https://c.com'));

    const slots = await snapshotUndo.getAllForSession<CookieSnapshot>('cookies', 's1');
    expect(slots.map((s) => s.origin).sort()).toEqual(['https://a.com', 'https://b.com']);
  });

  it('counts across both stores and clears everything', async () => {
    await snapshotUndo.put('cookies', cookieSnap('s1', 'https://a.com'));
    await snapshotUndo.put('storage', storageSnap('s1', 'https://a.com'));
    expect(await snapshotUndo.countAll()).toBe(2);

    await snapshotUndo.deleteAll();
    expect(await snapshotUndo.countAll()).toBe(0);
  });
});
