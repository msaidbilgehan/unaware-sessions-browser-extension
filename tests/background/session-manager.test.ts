import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  createSession,
  deleteSession,
  listSessions,
  getSession,
  updateSession,
  hydrateSessions,
  duplicateSession,
  batchSetSessions,
  deleteAllSessions,
} from '@background/session-manager';
import type { SessionProfile } from '@shared/types';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateSessions();
});

describe('session-manager', () => {
  it('creates a session with name and color', async () => {
    const session = await createSession('test-session', '#3B82F6');
    expect(session.name).toBe('test-session');
    expect(session.color).toBe('#3B82F6');
    expect(session.id).toBeTruthy();
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBeGreaterThan(0);
    expect(session.settings).toEqual({});
  });

  it('lists all sessions', async () => {
    await createSession('session-1', '#3B82F6');
    await createSession('session-2', '#EF4444');
    const sessions = await listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.name)).toEqual(['session-1', 'session-2']);
  });

  it('gets a session by ID', async () => {
    const created = await createSession('my-session', '#10B981');
    const found = await getSession(created.id);
    expect(found).toEqual(created);
  });

  it('returns undefined for non-existent session', async () => {
    const found = await getSession('non-existent');
    expect(found).toBeUndefined();
  });

  it('deletes a session', async () => {
    const session = await createSession('to-delete', '#3B82F6');
    await deleteSession(session.id);
    const sessions = await listSessions();
    expect(sessions).toHaveLength(0);
  });

  it('throws when deleting non-existent session', async () => {
    await expect(deleteSession('non-existent')).rejects.toThrow('Session not found');
  });

  it('updates a session name', async () => {
    const session = await createSession('original', '#3B82F6');
    const updated = await updateSession(session.id, { name: 'renamed' });
    expect(updated.name).toBe('renamed');
    expect(updated.color).toBe('#3B82F6');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(session.updatedAt);
  });

  it('updates a session color', async () => {
    const session = await createSession('test', '#3B82F6');
    const updated = await updateSession(session.id, { color: '#EF4444' });
    expect(updated.color).toBe('#EF4444');
  });

  it('throws when updating non-existent session', async () => {
    await expect(updateSession('non-existent', { name: 'fail' })).rejects.toThrow(
      'Session not found',
    );
  });

  it('persists sessions across hydration cycles', async () => {
    await createSession('persistent', '#3B82F6');

    // Simulate SW restart by re-hydrating
    await hydrateSessions();

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('persistent');
  });

  it('creates a session with emoji', async () => {
    const session = await createSession('Work', '#3B82F6', '\u{1F4BC}');
    expect(session.emoji).toBe('\u{1F4BC}');
  });

  it('creates a session without emoji when not provided', async () => {
    const session = await createSession('Plain', '#3B82F6');
    expect(session.emoji).toBeUndefined();
  });

  it('updates session emoji', async () => {
    const session = await createSession('test', '#3B82F6');
    const updated = await updateSession(session.id, { emoji: '\u{1F3AE}' });
    expect(updated.emoji).toBe('\u{1F3AE}');
  });

  it('updates session pinned state', async () => {
    const session = await createSession('test', '#3B82F6');
    expect(session.pinned).toBeUndefined();

    const updated = await updateSession(session.id, { pinned: true });
    expect(updated.pinned).toBe(true);

    const unpinned = await updateSession(session.id, { pinned: false });
    expect(unpinned.pinned).toBe(false);
  });

  it('rejects empty name in updateSession (regression: name validation)', async () => {
    const session = await createSession('valid', '#3B82F6');
    await expect(updateSession(session.id, { name: '' })).rejects.toThrow(
      'Session name cannot be empty',
    );
  });

  it('rejects whitespace-only name in updateSession (regression: name validation)', async () => {
    const session = await createSession('valid', '#3B82F6');
    await expect(updateSession(session.id, { name: '   ' })).rejects.toThrow(
      'Session name cannot be empty',
    );
  });

  it('trims name in updateSession', async () => {
    const session = await createSession('original', '#3B82F6');
    const updated = await updateSession(session.id, { name: '  padded  ' });
    expect(updated.name).toBe('padded');
  });

  it('duplicates a session', async () => {
    const original = await createSession('Original', '#EF4444', '\u{1F3E0}');
    const copy = await duplicateSession(original.id);

    expect(copy.name).toBe('Copy of Original');
    expect(copy.color).toBe('#EF4444');
    expect(copy.emoji).toBe('\u{1F3E0}');
    expect(copy.id).not.toBe(original.id);
  });

  it('throws when duplicating non-existent session', async () => {
    await expect(duplicateSession('non-existent')).rejects.toThrow('Session not found');
  });

  it('trims whitespace from session name', async () => {
    const session = await createSession('  padded  ', '#3B82F6');
    expect(session.name).toBe('padded');
  });

  it('throws on empty session name', async () => {
    await expect(createSession('', '#3B82F6')).rejects.toThrow('Session name cannot be empty');
    await expect(createSession('   ', '#3B82F6')).rejects.toThrow('Session name cannot be empty');
  });

  describe('deleteAllSessions', () => {
    it('removes all sessions', async () => {
      await createSession('sess-1', '#3B82F6');
      await createSession('sess-2', '#EF4444');
      expect(await listSessions()).toHaveLength(2);

      await deleteAllSessions();
      expect(await listSessions()).toHaveLength(0);
    });

    it('is safe on empty state', async () => {
      await deleteAllSessions();
      expect(await listSessions()).toHaveLength(0);
    });
  });

  describe('batchSetSessions', () => {
    function makeProfile(id: string, name: string): SessionProfile {
      return {
        id,
        name,
        color: '#3B82F6',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        settings: {},
      };
    }

    it('replaces all sessions atomically', async () => {
      await createSession('old-1', '#3B82F6');
      await createSession('old-2', '#EF4444');

      const profiles = [makeProfile('new-1', 'New A'), makeProfile('new-2', 'New B')];
      await batchSetSessions(profiles);

      const sessions = await listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.name)).toEqual(['New A', 'New B']);
    });

    it('preserves session order from input array', async () => {
      const profiles = [
        makeProfile('z-id', 'Zulu'),
        makeProfile('a-id', 'Alpha'),
        makeProfile('m-id', 'Mike'),
      ];
      await batchSetSessions(profiles);

      const sessions = await listSessions();
      expect(sessions.map((s) => s.id)).toEqual(['z-id', 'a-id', 'm-id']);
    });

    it('persists across hydration cycles', async () => {
      const profiles = [makeProfile('persist-1', 'Persisted')];
      await batchSetSessions(profiles);

      await hydrateSessions();
      const sessions = await listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].name).toBe('Persisted');
    });

    it('handles empty array', async () => {
      await createSession('existing', '#3B82F6');
      await batchSetSessions([]);

      const sessions = await listSessions();
      expect(sessions).toHaveLength(0);
    });
  });
});
