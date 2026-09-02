import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  recordStorageWriteError,
  getStorageWriteErrors,
  clearStorageWriteErrors,
  getStorageHealth,
} from '@background/storage-health';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import { hydrateSessions, createSession } from '@background/session-manager';
import { STORAGE_WRITE_ERROR_MAX_SIZE } from '@shared/constants';
import type { CookieSnapshot } from '@shared/types';

function makeCookieSnapshot(sessionId: string, origin: string): CookieSnapshot {
  return { sessionId, origin, timestamp: Date.now(), cookies: [] };
}

beforeEach(async () => {
  resetChromeMocks();
  await cookieStore.deleteAll();
  await storageStore.deleteAll();
  await hydrateSessions();
  await clearStorageWriteErrors();
});

describe('recordStorageWriteError', () => {
  it('persists the failure with the operation and origin', async () => {
    await recordStorageWriteError(
      'cookieStore.save',
      'sess-1',
      'https://example.com',
      new Error('Failed to save cookie snapshot failed: QuotaExceededError: full'),
    );

    const errors = await getStorageWriteErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].operation).toBe('cookieStore.save');
    expect(errors[0].origin).toBe('https://example.com');
    expect(errors[0].quotaExceeded).toBe(true);
  });

  it('flags non-quota failures as such', async () => {
    await recordStorageWriteError('storageStore.save', 's', 'https://a.com', new Error('aborted'));
    const errors = await getStorageWriteErrors();
    expect(errors[0].quotaExceeded).toBe(false);
  });

  it('keeps the list bounded', async () => {
    for (let i = 0; i < STORAGE_WRITE_ERROR_MAX_SIZE + 5; i++) {
      await recordStorageWriteError('cookieStore.save', 's', `https://a${i}.com`, new Error('x'));
    }

    const errors = await getStorageWriteErrors();
    expect(errors).toHaveLength(STORAGE_WRITE_ERROR_MAX_SIZE);
    // Oldest entries dropped, newest kept.
    expect(errors[errors.length - 1].origin).toBe(
      `https://a${STORAGE_WRITE_ERROR_MAX_SIZE + 4}.com`,
    );
  });
});

describe('getStorageHealth', () => {
  it('reports snapshot record counts alongside the profile count', async () => {
    await createSession('One', '#fff');
    await cookieStore.save(makeCookieSnapshot('s1', 'https://a.com'));

    const health = await getStorageHealth();
    expect(health.cookieRecords).toBe(1);
    expect(health.storageRecords).toBe(0);
    expect(health.sessionProfiles).toBe(1);
  });

  // The signature of an evicted quota bucket: profiles live in
  // chrome.storage.local and survive, snapshots live in IndexedDB and do not.
  it('surfaces profiles-without-snapshots, the data-loss signature', async () => {
    await createSession('One', '#fff');
    await createSession('Two', '#000');

    const health = await getStorageHealth();
    expect(health.sessionProfiles).toBe(2);
    expect(health.cookieRecords).toBe(0);
  });

  it('reports null usage when the storage estimate API is unavailable', async () => {
    const health = await getStorageHealth();
    expect(health.usageBytes).toBeNull();
    expect(health.quotaBytes).toBeNull();
  });
});
