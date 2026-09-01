import type { CookieSnapshot } from '@shared/types';
import { extractDomain } from '@shared/utils';
import { cookieStore } from './cookie-store';

function normalizeCookieDomain(domain: string): string {
  return domain.replace(/^\./, '').toLowerCase();
}

function cookieAppliesToHostname(cookie: chrome.cookies.Cookie, hostname: string): boolean {
  const cookieDomain = normalizeCookieDomain(cookie.domain);
  const target = hostname.toLowerCase();
  return target === cookieDomain || (!cookie.hostOnly && target.endsWith(`.${cookieDomain}`));
}

function cookieCanCrossHostnames(
  cookie: chrome.cookies.Cookie,
  sourceHostname: string,
  targetHostname: string,
): boolean {
  if (sourceHostname === targetHostname) return cookieAppliesToHostname(cookie, targetHostname);
  if (cookie.hostOnly) return false;
  return (
    cookieAppliesToHostname(cookie, sourceHostname) &&
    cookieAppliesToHostname(cookie, targetHostname)
  );
}

function cookieKey(cookie: chrome.cookies.Cookie): string {
  return `${cookie.name}\0${cookie.domain}\0${cookie.path}\0${cookie.storeId}`;
}

function resolveApplicableCookieSnapshot(
  sessionId: string,
  targetOrigin: string,
  snapshots: CookieSnapshot[],
): CookieSnapshot | undefined {
  const targetHostname = extractDomain(targetOrigin);
  if (!targetHostname) return undefined;

  const ordered = [...snapshots].sort((a, b) => {
    const timestampDiff = a.timestamp - b.timestamp;
    if (timestampDiff !== 0) return timestampDiff;
    if (a.origin === targetOrigin && b.origin !== targetOrigin) return 1;
    if (b.origin === targetOrigin && a.origin !== targetOrigin) return -1;
    return 0;
  });

  const cookies = new Map<string, chrome.cookies.Cookie>();
  let latestTimestamp = 0;

  for (const snapshot of ordered) {
    const sourceHostname = extractDomain(snapshot.origin);
    if (!sourceHostname) continue;

    for (const cookie of snapshot.cookies) {
      if (!cookieCanCrossHostnames(cookie, sourceHostname, targetHostname)) continue;
      cookies.set(cookieKey(cookie), cookie);
      latestTimestamp = Math.max(latestTimestamp, snapshot.timestamp);
    }
  }

  if (cookies.size === 0) return undefined;
  return {
    sessionId,
    origin: targetOrigin,
    timestamp: latestTimestamp,
    cookies: [...cookies.values()],
  };
}

export async function getApplicableCookieSnapshot(
  sessionId: string,
  targetOrigin: string,
): Promise<CookieSnapshot | undefined> {
  const snapshots = await cookieStore.getAllSnapshotsForSession(sessionId);
  return resolveApplicableCookieSnapshot(sessionId, targetOrigin, snapshots);
}

/** Resolve compatible cookie snapshots for every session in one IndexedDB scan. */
export async function getAllApplicableCookieSnapshots(
  origin: string,
): Promise<Map<string, CookieSnapshot>> {
  const snapshots = await cookieStore.getAllSnapshots();
  const bySession = new Map<string, CookieSnapshot[]>();

  for (const snapshot of snapshots) {
    const existing = bySession.get(snapshot.sessionId);
    if (existing) existing.push(snapshot);
    else bySession.set(snapshot.sessionId, [snapshot]);
  }

  const resolved = new Map<string, CookieSnapshot>();
  for (const [sessionId, sessionSnapshots] of bySession) {
    const snapshot = resolveApplicableCookieSnapshot(sessionId, origin, sessionSnapshots);
    if (snapshot) resolved.set(sessionId, snapshot);
  }
  return resolved;
}

export async function getSessionIdsWithApplicableCookies(origin: string): Promise<string[]> {
  const snapshots = await getAllApplicableCookieSnapshots(origin);
  return [...snapshots.keys()];
}

export async function hasSharedDomainCookie(
  sessionId: string,
  fromOrigin: string,
  toOrigin: string,
): Promise<boolean> {
  const fromHostname = extractDomain(fromOrigin);
  const toHostname = extractDomain(toOrigin);
  if (!fromHostname || !toHostname || fromHostname === toHostname) return false;

  const snapshots = await cookieStore.getAllSnapshotsForSession(sessionId);
  return snapshots.some((snapshot) =>
    snapshot.cookies.some(
      (cookie) =>
        !cookie.hostOnly &&
        cookieAppliesToHostname(cookie, fromHostname) &&
        cookieAppliesToHostname(cookie, toHostname),
    ),
  );
}
