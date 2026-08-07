import { beforeEach, describe, expect, it } from 'vitest';
import { resetChromeMocks } from '../setup';
import { cleanupOrphanSnapshots } from '@background/orphan-cleanup';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import { createSession, hydrateSessions } from '@background/session-manager';

beforeEach(async () => {
  resetChromeMocks();
  await Promise.all([cookieStore.deleteAll(), storageStore.deleteAll()]);
  await hydrateSessions();
});

describe('cleanupOrphanSnapshots', () => {
  it('permanently removes orphan snapshots and preserves active session data', async () => {
    const activeSession = await createSession('active', '#3B82F6');
    const origin = 'https://cleanup.example.com';

    await cookieStore.save({
      sessionId: activeSession.id,
      origin,
      timestamp: 1,
      cookies: [],
    });
    await storageStore.save({
      sessionId: activeSession.id,
      origin,
      timestamp: 1,
      localStorage: { active: 'true' },
      sessionStorage: {},
    });
    await cookieStore.save({
      sessionId: 'deleted-session',
      origin,
      timestamp: 1,
      cookies: [],
    });
    await storageStore.save({
      sessionId: 'deleted-session',
      origin,
      timestamp: 1,
      localStorage: { orphan: 'true' },
      sessionStorage: {},
    });

    const result = await cleanupOrphanSnapshots();

    expect(result).toEqual({
      sessionIds: ['deleted-session'],
      cookieSnapshots: 1,
      storageSnapshots: 1,
    });
    expect(await cookieStore.load('deleted-session', origin)).toBeUndefined();
    expect(await storageStore.load('deleted-session', origin)).toBeUndefined();
    expect(await cookieStore.load(activeSession.id, origin)).toBeDefined();
    expect(await storageStore.load(activeSession.id, origin)).toBeDefined();
  });

  it('is idempotent when no orphan snapshots remain', async () => {
    expect(await cleanupOrphanSnapshots()).toEqual({
      sessionIds: [],
      cookieSnapshots: 0,
      storageSnapshots: 0,
    });
  });
});
