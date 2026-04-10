import type {
  CookieSnapshot,
  StorageSnapshot,
  MessageResponse,
  RestoreFailureEntry,
} from '@shared/types';
import { MessageType } from '@shared/types';
import { extractDomain, buildCookieUrl, now } from '@shared/utils';
import { getDomainIsolationMode } from '@shared/settings-store';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { getTabEntry, assignTab } from './tab-tracker';
import { updateRulesForTab, removeRulesForTab } from './dnr-manager';

const MESSAGE_TIMEOUT_MS = 5000;
const MAX_RESTORE_FAILURES = 200;

// Pending storage restores keyed by tabId
const pendingRestores: Map<number, { sessionId: string; origin: string }> = new Map();

// Per-tab mutex to prevent interleaved switchSession calls.
// If a switch is in progress on tab N, a second switch on the same tab waits
// for the first to complete before starting.
const switchLocks: Map<number, Promise<void>> = new Map();

// Ring buffer of recent restore failures for debugging
const restoreFailures: RestoreFailureEntry[] = [];

function recordRestoreFailure(
  sessionId: string,
  origin: string,
  cookieName: string,
  cookieDomain: string,
  reason: string,
): void {
  restoreFailures.push({ timestamp: now(), sessionId, origin, cookieName, cookieDomain, reason });
  if (restoreFailures.length > MAX_RESTORE_FAILURES) {
    restoreFailures.splice(0, restoreFailures.length - MAX_RESTORE_FAILURES);
  }
}

export function getRestoreFailures(): RestoreFailureEntry[] {
  return [...restoreFailures];
}

export function clearRestoreFailures(): void {
  restoreFailures.length = 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Get all cookies that apply to the given origin's hostname.
 * Walks up the domain hierarchy to capture parent-domain cookies
 * (e.g., .google.com cookies when on www.google.com) that
 * chrome.cookies.getAll({ domain: "www.google.com" }) would miss.
 */
export async function getCookiesForOrigin(origin: string): Promise<chrome.cookies.Cookie[]> {
  const hostname = extractDomain(origin);
  if (!hostname) return [];

  // Build domain levels: "www.google.com" → ["www.google.com", "google.com"]
  const parts = hostname.split('.');
  const domainLevels: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    domainLevels.push(parts.slice(i).join('.'));
  }
  // Handle single-label hostnames (e.g., localhost)
  if (domainLevels.length === 0) {
    domainLevels.push(hostname);
  }

  const results = await Promise.all(
    domainLevels.map((d) => chrome.cookies.getAll({ domain: d })),
  );

  // Deduplicate and keep only cookies that apply to our hostname
  const seen = new Set<string>();
  const cookies: chrome.cookies.Cookie[] = [];

  for (const batch of results) {
    for (const cookie of batch) {
      const key = `${cookie.name}\0${cookie.domain}\0${cookie.path}\0${cookie.storeId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const bare = cookie.domain.replace(/^\./, '');
      if (hostname === bare || hostname.endsWith(`.${bare}`)) {
        cookies.push(cookie);
      }
    }
  }

  return cookies;
}

export async function saveCookies(sessionId: string, origin: string): Promise<void> {
  const domain = extractDomain(origin);
  if (!domain) return;

  const cookies = await getCookiesForOrigin(origin);

  const snapshot: CookieSnapshot = {
    sessionId,
    origin,
    timestamp: now(),
    cookies,
  };

  await cookieStore.save(snapshot);
}

export async function clearCookies(origin: string): Promise<void> {
  const domain = extractDomain(origin);
  if (!domain) return;

  const cookies = await getCookiesForOrigin(origin);

  await Promise.all(
    cookies.map((cookie) => {
      const url = buildCookieUrl(cookie);
      return chrome.cookies.remove({ url, name: cookie.name });
    }),
  );
}

export async function restoreCookies(sessionId: string, origin: string): Promise<void> {
  const snapshot = await cookieStore.load(sessionId, origin);
  if (!snapshot) return;

  const domain = extractDomain(origin);

  // Only restore cookies that belong to this origin's domain hierarchy.
  // Legacy snapshots may contain cross-domain cookies — filter them out.
  const originCookies = domain
    ? snapshot.cookies.filter((cookie) => {
        const cookieDomain = cookie.domain.replace(/^\./, '');
        return (
          cookieDomain === domain ||
          cookieDomain.endsWith(`.${domain}`) ||
          domain.endsWith(`.${cookieDomain}`)
        );
      })
    : snapshot.cookies;

  // Restore origin-scoped cookies in parallel for speed
  const results = await Promise.allSettled(
    originCookies.map((cookie) => {
      const url = buildCookieUrl(cookie);
      const isHostCookie = cookie.name.startsWith('__Host-');
      const isSecureCookie = cookie.name.startsWith('__Secure-');

      let secure = cookie.secure;
      if (cookie.sameSite === 'no_restriction' || isHostCookie || isSecureCookie) {
        secure = true;
      }

      return chrome.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        ...(isHostCookie ? {} : { domain: cookie.domain }),
        path: isHostCookie ? '/' : cookie.path,
        secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
      });
    }),
  );

  let failCount = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const cookie = originCookies[i];
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      recordRestoreFailure(sessionId, origin, cookie.name, cookie.domain, reason);
      failCount++;
    } else if (result.value === null) {
      // chrome.cookies.set returns null when the cookie was rejected silently
      const cookie = originCookies[i];
      recordRestoreFailure(sessionId, origin, cookie.name, cookie.domain, 'Silently rejected (returned null)');
      failCount++;
    }
  }

  if (failCount > 0) {
    console.warn(`[Unaware Sessions] Failed to restore ${failCount} cookie(s) for ${origin}`);
  }
}

export async function saveTabStorage(
  tabId: number,
  sessionId: string,
  origin: string,
): Promise<void> {
  try {
    const response = (await withTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: MessageType.SAVE_STORAGE,
        sessionId,
        origin,
      }),
      MESSAGE_TIMEOUT_MS,
    )) as MessageResponse<Pick<StorageSnapshot, 'localStorage' | 'sessionStorage' | 'indexedDB'>>;

    if (response.success && response.data) {
      const snapshot: StorageSnapshot = {
        sessionId,
        origin,
        timestamp: now(),
        localStorage: response.data.localStorage,
        sessionStorage: response.data.sessionStorage,
        indexedDB: response.data.indexedDB,
      };
      await storageStore.save(snapshot);
    }
  } catch (err) {
    console.warn('[Unaware Sessions] Failed to save tab storage:', err);
  }
}

async function restoreTabStorage(tabId: number, sessionId: string, origin: string): Promise<void> {
  const snapshot = await storageStore.load(sessionId, origin);
  if (!snapshot) return;

  try {
    await withTimeout(
      chrome.tabs.sendMessage(tabId, {
        type: MessageType.RESTORE_STORAGE,
        sessionId,
        origin,
        data: {
          localStorage: snapshot.localStorage,
          sessionStorage: snapshot.sessionStorage,
          indexedDB: snapshot.indexedDB ?? [],
        },
      }),
      MESSAGE_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn('[Unaware Sessions] Failed to restore tab storage:', err);
  }
}

/**
 * Detect which saved session best matches the current cookies for a given origin.
 * Compares live browser cookies against each session's saved cookie snapshot.
 * Returns the session ID with the highest cookie match ratio, or null if no match.
 */
export async function detectSessionForOrigin(origin: string): Promise<string | null> {
  const domain = extractDomain(origin);
  if (!domain) return null;

  const liveCookies = await getCookiesForOrigin(origin);
  if (liveCookies.length === 0) return null;

  // Build a set of "name=value" fingerprints from live cookies
  const liveFingerprints = new Set(liveCookies.map((c) => `${c.name}=${c.value}`));

  // Get all session IDs that have snapshots for this origin
  const sessionIds = await cookieStore.getSessionIdsForOrigin(origin);
  if (sessionIds.length === 0) return null;

  // Load all snapshots in parallel instead of sequential N+1 queries
  const snapshots = await Promise.all(
    sessionIds.map((sid) => cookieStore.load(sid, origin)),
  );

  let bestSessionId: string | null = null;
  let bestScore = 0;

  for (let i = 0; i < sessionIds.length; i++) {
    const snapshot = snapshots[i];
    if (!snapshot || snapshot.cookies.length === 0) continue;

    // Filter snapshot to only cookies relevant to this domain
    const relevantSaved = snapshot.cookies.filter(
      (c) =>
        c.domain === domain ||
        c.domain === `.${domain}` ||
        domain.endsWith(c.domain.replace(/^\./, '')),
    );
    if (relevantSaved.length === 0) continue;

    // Count how many saved cookies match live cookies exactly
    let matches = 0;
    for (const saved of relevantSaved) {
      if (liveFingerprints.has(`${saved.name}=${saved.value}`)) {
        matches++;
      }
    }

    // Score = matched cookies / max(live, relevant saved)
    const score = matches / Math.max(liveCookies.length, relevantSaved.length);

    if (score > bestScore && matches > 0) {
      bestScore = score;
      bestSessionId = sessionIds[i];
    }
  }

  // Require at least 30% match to avoid false positives
  return bestScore >= 0.3 ? bestSessionId : null;
}

export function handleContentScriptReady(tabId: number): void {
  const pending = pendingRestores.get(tabId);
  if (!pending) return;

  pendingRestores.delete(tabId);
  restoreTabStorage(tabId, pending.sessionId, pending.origin).catch((err) => {
    console.warn('[Unaware Sessions] Failed to restore storage on ready:', err);
  });
}

export function cleanupPendingRestore(tabId: number): void {
  pendingRestores.delete(tabId);
}


export async function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  // Serialize switches on the same tab — wait for any in-progress switch to finish.
  const existing = switchLocks.get(tabId);
  if (existing) {
    await existing.catch(() => {});
  }

  const work = doSwitchSession(tabId, targetSessionId);
  switchLocks.set(tabId, work);

  try {
    await work;
  } finally {
    // Only clear if this is still the latest lock (avoids clearing a newer switch)
    if (switchLocks.get(tabId) === work) {
      switchLocks.delete(tabId);
    }
  }
}

async function doSwitchSession(tabId: number, targetSessionId: string): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) {
    throw new Error('Tab has no URL');
  }

  const origin = new URL(tab.url).origin;
  const domain = extractDomain(origin);
  const currentEntry = await getTabEntry(tabId);

  // 1. Save current session's data before switching (parallel — independent I/O)
  if (currentEntry) {
    await Promise.all([
      saveCookies(currentEntry.sessionId, origin),
      saveTabStorage(tabId, currentEntry.sessionId, origin),
    ]);
  }

  // 2. Check if the target session has cookie data for this origin.
  //    In "soft" isolation mode, skip clear+restore when no snapshot exists
  //    so unmanaged domains (e.g., Google when using Instagram sessions) pass through.
  const targetSnapshot = await cookieStore.load(targetSessionId, origin);
  const isolationMode = domain ? getDomainIsolationMode(domain) : 'strict';
  const hasTargetData = targetSnapshot != null && targetSnapshot.cookies.length > 0;

  if (!hasTargetData && isolationMode === 'soft') {
    // Soft mode: no data for this domain → skip cookie operations, preserve current state.
    // Update tab mapping for badge/tracking, but REMOVE any DNR rule so the browser's
    // native Cookie header passes through (no header injection = no cookie override).
    await Promise.all([
      assignTab(tabId, targetSessionId, origin),
      removeRulesForTab(tabId),
    ]);

    // No storage restore needed — we're passing through
    await chrome.tabs.update(tabId, { url: tab.url });
    return;
  }

  // Strict mode (or target has data): full clear + restore cycle
  await clearCookies(origin);

  // 3. Restore target session's cookies for this origin
  await restoreCookies(targetSessionId, origin);

  // 4. Update tab-session mapping + DNR rules (parallel — independent)
  await Promise.all([
    assignTab(tabId, targetSessionId, origin),
    updateRulesForTab(tabId, targetSessionId, origin),
  ]);

  // 5. Queue storage restore for when the content script loads on the new page
  pendingRestores.set(tabId, { sessionId: targetSessionId, origin });

  // 6. Navigate tab to same URL — clean up pending entry on failure
  try {
    await chrome.tabs.update(tabId, { url: tab.url });
  } catch (err) {
    pendingRestores.delete(tabId);
    throw err;
  }
}
