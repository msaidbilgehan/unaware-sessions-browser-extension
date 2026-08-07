import { createLogger } from '@shared/logger';
import { listSessions } from './session-manager';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';

const log = createLogger('orphan-cleanup');

export interface OrphanCleanupResult {
  sessionIds: string[];
  cookieSnapshots: number;
  storageSnapshots: number;
}

/**
 * Permanently remove snapshots whose session profile no longer exists.
 * Active sessions are the sole source of truth; tab assignment is irrelevant.
 */
export async function cleanupOrphanSnapshots(): Promise<OrphanCleanupResult> {
  const [sessions, cookieSnapshots, storageSnapshots] = await Promise.all([
    listSessions(),
    cookieStore.getAllSnapshots(),
    storageStore.getAllSnapshots(),
  ]);

  const activeSessionIds = new Set(sessions.map((session) => session.id));
  const orphanSessionIds = new Set<string>();
  let orphanCookieSnapshots = 0;
  let orphanStorageSnapshots = 0;

  for (const snapshot of cookieSnapshots) {
    if (!activeSessionIds.has(snapshot.sessionId)) {
      orphanSessionIds.add(snapshot.sessionId);
      orphanCookieSnapshots++;
    }
  }
  for (const snapshot of storageSnapshots) {
    if (!activeSessionIds.has(snapshot.sessionId)) {
      orphanSessionIds.add(snapshot.sessionId);
      orphanStorageSnapshots++;
    }
  }

  const sessionIds = [...orphanSessionIds];
  await Promise.all(
    sessionIds.flatMap((sessionId) => [
      cookieStore.deleteForSession(sessionId),
      storageStore.deleteForSession(sessionId),
    ]),
  );

  if (sessionIds.length > 0) {
    log.info('Removed orphan snapshots', {
      sessionIds,
      cookieSnapshots: orphanCookieSnapshots,
      storageSnapshots: orphanStorageSnapshots,
    });
  }

  return {
    sessionIds,
    cookieSnapshots: orphanCookieSnapshots,
    storageSnapshots: orphanStorageSnapshots,
  };
}
