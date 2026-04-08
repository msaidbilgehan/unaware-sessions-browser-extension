import type { SessionProfile, SessionSettings } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import { getLocal, setLocal } from '@shared/storage';
import { generateId, now } from '@shared/utils';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';

let sessions: Map<string, SessionProfile> = new Map();
let hydrated = false;

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  await hydrateSessions();
}

export async function hydrateSessions(): Promise<void> {
  const stored = await getLocal<SessionProfile[]>(STORAGE_KEYS.SESSIONS);
  sessions = new Map((stored ?? []).map((s) => [s.id, s]));
  hydrated = true;
}

async function persistSessions(): Promise<void> {
  await setLocal(STORAGE_KEYS.SESSIONS, Array.from(sessions.values()));
}

export async function createSession(
  name: string,
  color: string,
  emoji?: string,
): Promise<SessionProfile> {
  await ensureHydrated();

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Session name cannot be empty');
  }

  const session: SessionProfile = {
    id: generateId(),
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

  if (!sessions.has(sessionId)) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  sessions.delete(sessionId);
  await persistSessions();
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

export async function duplicateSession(sessionId: string): Promise<SessionProfile> {
  await ensureHydrated();
  const source = sessions.get(sessionId);
  if (!source) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return createSession(`Copy of ${source.name}`, source.color, source.emoji);
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
