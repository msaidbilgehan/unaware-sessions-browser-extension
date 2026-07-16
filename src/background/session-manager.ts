import type { SessionProfile, SessionSettings } from '@shared/types';
import { STORAGE_KEYS, SESSION_TOMBSTONE_RETENTION_MS } from '@shared/constants';
import { getLocal, setLocal } from '@shared/storage';
import { generateId, now } from '@shared/utils';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';

let sessions: Map<string, SessionProfile> = new Map();
let hydratePromise: Promise<void> | null = null;

async function ensureHydrated(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  return hydrateSessions();
}

// All callers (service-worker top-level and message handlers via ensureHydrated)
// must share one load promise. Two concurrent loads would let the later one
// overwrite the in-memory map with a snapshot read before an interleaved
// mutation persisted — resurrecting deleted sessions or dropping new ones on
// the next persist.
export function hydrateSessions(): Promise<void> {
  hydratePromise = (async () => {
    const stored = await getLocal<SessionProfile[]>(STORAGE_KEYS.SESSIONS);
    sessions = new Map((stored ?? []).map((s) => [s.id, s]));
  })();
  return hydratePromise;
}

async function persistSessions(): Promise<void> {
  await setLocal(STORAGE_KEYS.SESSIONS, Array.from(sessions.values()));
}

export async function createSession(
  name: string,
  color: string,
  emoji?: string,
  id?: string,
): Promise<SessionProfile> {
  await ensureHydrated();

  // Idempotency: the API layer retries on connection errors that can occur
  // AFTER the first attempt persisted ("message port closed"). A retry with
  // the same client-generated ID must return the existing session, not
  // create a duplicate.
  if (id) {
    const existing = sessions.get(id);
    if (existing) return existing;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Session name cannot be empty');
  }

  const session: SessionProfile = {
    id: id ?? generateId(),
    name: trimmedName,
    color,
    ...(emoji ? { emoji } : {}),
    createdAt: now(),
    updatedAt: now(),
    settings: {},
  };

  sessions.set(session.id, session);
  await persistSessions();
  await appendSessionOrder(session.id);
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await ensureHydrated();

  // Idempotent: deleting an already-deleted session is a success, so a
  // retried DELETE message doesn't surface a bogus "Session not found".
  if (!sessions.has(sessionId)) return;

  sessions.delete(sessionId);
  await persistSessions();
  await recordTombstone(sessionId);
  await removeSessionFromOrder(sessionId);
  await cookieStore.deleteForSession(sessionId);
  await storageStore.deleteForSession(sessionId);
}

export async function listSessions(): Promise<SessionProfile[]> {
  await ensureHydrated();
  const all = Array.from(sessions.values());
  const order = await getLocal<string[]>(STORAGE_KEYS.SESSION_ORDER);
  if (!order) return all;

  const orderMap = new Map(order.map((id, i) => [id, i]));
  return all.sort((a, b) => {
    const ai = orderMap.get(a.id) ?? Infinity;
    const bi = orderMap.get(b.id) ?? Infinity;
    return ai - bi;
  });
}

export async function getSession(sessionId: string): Promise<SessionProfile | undefined> {
  await ensureHydrated();
  return sessions.get(sessionId);
}

export async function updateSession(
  sessionId: string,
  updates: Partial<Pick<SessionProfile, 'name' | 'color' | 'emoji' | 'pinned' | 'settings'>>,
): Promise<SessionProfile> {
  await ensureHydrated();

  const existing = sessions.get(sessionId);
  if (!existing) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) {
      throw new Error('Session name cannot be empty');
    }
    updates = { ...updates, name: trimmed };
  }

  const updated: SessionProfile = {
    ...existing,
    ...updates,
    settings: { ...existing.settings, ...(updates.settings ?? {}) } as SessionSettings,
    updatedAt: now(),
  };

  sessions.set(sessionId, updated);
  await persistSessions();
  return updated;
}

export async function duplicateSession(sessionId: string, newId?: string): Promise<SessionProfile> {
  await ensureHydrated();
  const source = sessions.get(sessionId);
  if (!source) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return createSession(`Copy of ${source.name}`, source.color, source.emoji, newId);
}

async function appendSessionOrder(sessionId: string): Promise<void> {
  const order = (await getLocal<string[]>(STORAGE_KEYS.SESSION_ORDER)) ?? [];
  if (!order.includes(sessionId)) {
    order.push(sessionId);
    await setLocal(STORAGE_KEYS.SESSION_ORDER, order);
  }
}

async function removeSessionFromOrder(sessionId: string): Promise<void> {
  const order = (await getLocal<string[]>(STORAGE_KEYS.SESSION_ORDER)) ?? [];
  const filtered = order.filter((id) => id !== sessionId);
  await setLocal(STORAGE_KEYS.SESSION_ORDER, filtered);
}

// ── Sync Helpers ────────────────────────────────────────────

/**
 * Replace all in-memory sessions with the provided array and persist once.
 * Used by applyFullData to avoid O(N²) storage writes from calling
 * upsertSessionDirect in a loop (each call would persistSessions + appendOrder).
 */
export async function batchSetSessions(profiles: SessionProfile[]): Promise<void> {
  await ensureHydrated();
  sessions.clear();
  for (const p of profiles) {
    sessions.set(p.id, p);
  }
  await persistSessions();
  await setLocal(
    STORAGE_KEYS.SESSION_ORDER,
    profiles.map((p) => p.id),
  );
}

export async function upsertSessionDirect(profile: SessionProfile): Promise<void> {
  await ensureHydrated();
  sessions.set(profile.id, profile);
  await persistSessions();
  await appendSessionOrder(profile.id);
}

/**
 * Delete every session and its snapshots.
 *
 * `recordTombstones` must be true for user-initiated deletion (so sync
 * propagates it to other devices) and false for internal replaces
 * (applyFullData), where tombstoning the incoming sessions would make the
 * next sync delete everything that was just applied.
 */
export async function deleteAllSessions(
  options: { recordTombstones?: boolean } = {},
): Promise<void> {
  await ensureHydrated();
  const { recordTombstones = true } = options;

  const ids = Array.from(sessions.keys());
  await Promise.all(
    ids.map(async (id) => {
      await cookieStore.deleteForSession(id);
      await storageStore.deleteForSession(id);
    }),
  );

  sessions.clear();
  await persistSessions();
  if (recordTombstones && ids.length > 0) {
    const tombstones = pruneTombstones(await getSessionTombstones());
    const deletedAt = now();
    for (const id of ids) {
      tombstones[id] = deletedAt;
    }
    await setSessionTombstones(tombstones);
  }
  await setLocal(STORAGE_KEYS.SESSION_ORDER, [] as string[]);
}

export async function touchSessionRefresh(sessionId: string): Promise<void> {
  await ensureHydrated();
  const existing = sessions.get(sessionId);
  if (!existing) return;

  const updated: SessionProfile = { ...existing, lastRefreshedAt: now() };
  sessions.set(sessionId, updated);
  await persistSessions();
}

// ── Deletion Tombstones ─────────────────────────────────────
//
// Sync merges session profiles by union; without a record of deletions, a
// session deleted on one device is resurrected from the other side's copy on
// the next sync. Tombstones (sessionId → deletedAt) let the merge distinguish
// "deleted here" from "created there".

export async function getSessionTombstones(): Promise<Record<string, number>> {
  const stored = await getLocal<Record<string, number>>(STORAGE_KEYS.SESSION_TOMBSTONES);
  return stored ?? {};
}

export async function setSessionTombstones(tombstones: Record<string, number>): Promise<void> {
  await setLocal(STORAGE_KEYS.SESSION_TOMBSTONES, tombstones);
}

/** Drop tombstones past retention so the map cannot grow unbounded. */
export function pruneTombstones(
  tombstones: Record<string, number>,
  nowMs: number = now(),
): Record<string, number> {
  const pruned: Record<string, number> = {};
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    if (nowMs - deletedAt < SESSION_TOMBSTONE_RETENTION_MS) {
      pruned[id] = deletedAt;
    }
  }
  return pruned;
}

async function recordTombstone(sessionId: string): Promise<void> {
  const tombstones = pruneTombstones(await getSessionTombstones());
  tombstones[sessionId] = now();
  await setSessionTombstones(tombstones);
}
