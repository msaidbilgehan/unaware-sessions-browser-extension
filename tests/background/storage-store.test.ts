import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import { storageStore } from '@background/storage-store';
import type { StorageSnapshot } from '@shared/types';

function makeStorageSnapshot(
  sessionId: string,
  origin: string,
  overrides?: Partial<StorageSnapshot>,
): StorageSnapshot {
  return {
    sessionId,
    origin,
    timestamp: Date.now(),
    localStorage: { key1: 'val1' },
    sessionStorage: { skey1: 'sval1' },
    ...overrides,
  };
}

async function clearStore(): Promise<void> {
  // Use the store's own IDB connection to clear the object store
  const db = await storageStore.open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(async () => {
  resetChromeMocks();
  await clearStore();
});

describe('storage-store', () => {
  it('saves and loads a storage snapshot', async () => {
    const snapshot = makeStorageSnapshot('s1', 'https://example.com');
    await storageStore.save(snapshot);

    const loaded = await storageStore.load('s1', 'https://example.com');
    expect(loaded).toBeDefined();
    expect(loaded!.sessionId).toBe('s1');
    expect(loaded!.origin).toBe('https://example.com');
    expect(loaded!.localStorage).toEqual({ key1: 'val1' });
    expect(loaded!.sessionStorage).toEqual({ skey1: 'sval1' });
  });

  it('returns undefined for non-existent snapshot', async () => {
    const loaded = await storageStore.load('missing', 'https://none.com');
    expect(loaded).toBeUndefined();
  });

  it('overwrites snapshot on save with same key', async () => {
    const snap1 = makeStorageSnapshot('s1', 'https://a.com', {
      localStorage: { old: 'data' },
    });
    await storageStore.save(snap1);

    const snap2 = makeStorageSnapshot('s1', 'https://a.com', {
      localStorage: { new: 'data' },
    });
    await storageStore.save(snap2);

    const loaded = await storageStore.load('s1', 'https://a.com');
    expect(loaded!.localStorage).toEqual({ new: 'data' });
  });

  it('deletes all snapshots for a session', async () => {
    await storageStore.save(makeStorageSnapshot('s1', 'https://a.com'));
    await storageStore.save(makeStorageSnapshot('s1', 'https://b.com'));
    await storageStore.save(makeStorageSnapshot('s2', 'https://a.com'));

    await storageStore.deleteForSession('s1');

    expect(await storageStore.load('s1', 'https://a.com')).toBeUndefined();
    expect(await storageStore.load('s1', 'https://b.com')).toBeUndefined();
    expect(await storageStore.load('s2', 'https://a.com')).toBeDefined();
  });

  it('getStatsForSession returns correct counts', async () => {
    await storageStore.save(
      makeStorageSnapshot('s1', 'https://a.com', {
        localStorage: { k1: 'v1', k2: 'v2' },
        sessionStorage: { sk1: 'sv1' },
        indexedDB: [{ name: 'db1', version: 1, objectStores: [] }],
      }),
    );
    await storageStore.save(
      makeStorageSnapshot('s1', 'https://b.com', {
        localStorage: { k3: 'v3' },
        sessionStorage: {},
      }),
    );

    const stats = await storageStore.getStatsForSession('s1');
    expect(stats.entryCount).toBe(4); // 2+1 from a.com + 1+0 from b.com
    expect(stats.idbCount).toBe(1);
    expect(stats.origins).toContain('https://a.com');
    expect(stats.origins).toContain('https://b.com');
    expect(stats.origins).toHaveLength(2);
    expect(stats.storageBytes).toBeGreaterThan(0);
  });

  it('getStatsForSession returns zeros for unknown session', async () => {
    const stats = await storageStore.getStatsForSession('unknown');
    expect(stats.entryCount).toBe(0);
    expect(stats.storageBytes).toBe(0);
    expect(stats.idbCount).toBe(0);
    expect(stats.origins).toHaveLength(0);
  });

  it('getStatsForSession does not include other sessions', async () => {
    await storageStore.save(makeStorageSnapshot('s1', 'https://a.com'));
    await storageStore.save(makeStorageSnapshot('s2', 'https://b.com'));

    const stats = await storageStore.getStatsForSession('s1');
    expect(stats.origins).toEqual(['https://a.com']);
  });
});
