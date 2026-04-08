import type { CookieSnapshot, StorageSnapshot, MessageResponse } from '@shared/types';
import { MessageType } from '@shared/types';
import { extractDomain, buildCookieUrl, now } from '@shared/utils';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { getTabEntry, assignTab } from './tab-tracker';
import { updateRulesForTab } from './dnr-manager';

const MESSAGE_TIMEOUT_MS = 5000;

// Pending storage restores keyed by tabId
const pendingRestores: Map<number, { sessionId: string; origin: string }> = new Map();

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

export async function saveCookies(sessionId: string, origin: string): Promise<void> {
  const domain = extractDomain(origin);
  if (!domain) return;

  const cookies = await chrome.cookies.getAll({ domain });

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

  const cookies = await chrome.cookies.getAll({ domain });

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

  // Restore all cookies in parallel for speed — sequential was too slow
  // for snapshots with hundreds of cross-domain cookies
  const results = await Promise.allSettled(
    snapshot.cookies.map((cookie) => {
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

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`[Unaware Sessions] Failed to restore ${failures.length} cookie(s)`);
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

  const liveCookies = await chrome.cookies.getAll({ domain });
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
    // (snapshots may contain ALL browser cookies from saveAllCookiesForSession)
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

/**
 * Save cookies for ALL domains in the browser under the given session+origin key.
 * This captures cross-domain auth cookies (e.g., authenticator.cursor.sh for cursor.com).
 */
export async function saveAllCookiesForSession(sessionId: string, origin: string): Promise<void> {
  const allCookies = await chrome.cookies.getAll({});

  const snapshot: CookieSnapshot = {
    sessionId,
    origin,
    timestamp: now(),
    cookies: allCookies,
  };

  await cookieStore.save(snapshot);
}

export async function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) {
    throw new Error('Tab has no URL');
  }

  const origin = new URL(tab.url).origin;
  const domain = extractDomain(origin);
  const currentEntry = getTabEntry(tabId);

  // 1. Save current session's data before switching (parallel — independent I/O)
  if (currentEntry) {
    await Promise.all([
      saveAllCookiesForSession(currentEntry.sessionId, origin),
      saveTabStorage(tabId, currentEntry.sessionId, origin),
    ]);
  }

  // 2. Clear cookies for this origin
  await clearCookies(origin);

  // 3. Restore target session's cookies for this origin
  await restoreCookies(targetSessionId, origin);

  // 4. If the snapshot was saved with saveAllCookiesForSession (contains
  //    cross-domain cookies), also restore cookies for related domains
  //    that the target session needs (e.g., anthropic.com for claude.ai)
  const fullSnapshot = await cookieStore.load(targetSessionId, origin);
  if (fullSnapshot && domain) {
    // Find domains in the snapshot that are NOT the current origin's domain
    const extraDomains = new Set<string>();
    for (const cookie of fullSnapshot.cookies) {
      const cookieDomain = cookie.domain.replace(/^\./, '');
      if (
        cookieDomain !== domain &&
        !cookieDomain.endsWith(`.${domain}`) &&
        !domain.endsWith(`.${cookieDomain}`)
      ) {
        extraDomains.add(cookieDomain);
      }
    }

    // Restore cookies for related domains (e.g., anthropic.com)
    if (extraDomains.size > 0) {
      const extraCookies = fullSnapshot.cookies.filter((c) => {
        const cd = c.domain.replace(/^\./, '');
        return cd !== domain && extraDomains.has(cd);
      });

      if (extraCookies.length > 0) {
        await Promise.allSettled(
          extraCookies.map((cookie) => {
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
      }
    }
  }

  // 5. Update tab-session mapping + DNR rules (parallel — independent)
  await Promise.all([
    assignTab(tabId, targetSessionId, origin),
    updateRulesForTab(tabId, targetSessionId, origin),
  ]);

  // 7. Queue storage restore for when the content script loads on the new page
  pendingRestores.set(tabId, { sessionId: targetSessionId, origin });

  // 8. Navigate tab to same URL
  await chrome.tabs.update(tabId, { url: tab.url });
}
