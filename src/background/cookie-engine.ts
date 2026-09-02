import type {
  CookieSnapshot,
  StorageSnapshot,
  MessageResponse,
  RestoreFailureEntry,
} from '@shared/types';
import { MessageType } from '@shared/types';
import { extractDomain, buildCookieUrl, isValidUrl, now } from '@shared/utils';
import { getDomainIsolationMode } from '@shared/settings-store';
import { createLogger } from '@shared/logger';
import { cookieStore } from './cookie-store';
import { storageStore } from './storage-store';
import { recordStorageWriteError } from './storage-health';
import {
  snapshotUndo,
  isEmptyCookieSnapshot,
  isEmptyStorageSnapshot,
  type SnapshotKind,
} from './snapshot-undo';
import { getTabEntry, assignTab } from './tab-tracker';
import { updateRulesForTab, removeRulesForTab } from './dnr-manager';

const log = createLogger('cookie-engine');

const MESSAGE_TIMEOUT_MS = 5000;
const MAX_RESTORE_FAILURES = 200;

/**
 * Resolve the cookie store ID that a tab belongs to.
 * Chrome separates normal ("0") and incognito ("1") cookie stores;
 * operations must target the correct store to avoid cross-context mixing.
 */
export async function getCookieStoreIdForTab(tabId: number): Promise<string | undefined> {
  const stores = await chrome.cookies.getAllCookieStores();
  for (const store of stores) {
    if (store.tabIds.includes(tabId)) {
      return store.id;
    }
  }
  return undefined;
}

// Pending storage restores keyed by tabId
const pendingRestores: Map<number, { sessionId: string; origin: string }> = new Map();

// Per-tab mutex to prevent interleaved switchSession calls.
// If a switch is in progress on tab N, a second switch on the same tab waits
// for the first to complete before starting.
const switchLocks: Map<number, Promise<void>> = new Map();

export function isTabSwitching(tabId: number): boolean {
  return switchLocks.has(tabId);
}

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
 *
 * When `storeId` is provided, only cookies from that specific cookie store
 * are returned (e.g., "0" for normal, "1" for incognito). Without it,
 * cookies from ALL stores are returned (legacy/debug behavior).
 */
export async function getCookiesForOrigin(
  origin: string,
  storeId?: string,
): Promise<chrome.cookies.Cookie[]> {
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
    domainLevels.map((d) =>
      chrome.cookies.getAll(storeId != null ? { domain: d, storeId } : { domain: d }),
    ),
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

export async function saveCookies(
  sessionId: string,
  origin: string,
  storeId?: string,
): Promise<void> {
  const domain = extractDomain(origin);
  if (!domain) return;

  const cookies = await getCookiesForOrigin(origin, storeId);

  const snapshot: CookieSnapshot = {
    sessionId,
    origin,
    timestamp: now(),
    cookies,
  };

  // An empty read is a logout as far as this code can tell, so the snapshot
  // still becomes empty — but the outgoing data is preserved first. If the
  // undo slot cannot be written we keep the existing snapshot instead:
  // never destroy the only copy.
  if (cookies.length === 0 && !(await preserveCookiesForUndo(sessionId, origin))) {
    return;
  }

  // Log after the write, not before: the previous "Saved N cookies" line was
  // emitted ahead of cookieStore.save(), so a rejected write (quota, aborted
  // transaction) left logs claiming a save that never happened.
  try {
    await cookieStore.save(snapshot);
  } catch (err) {
    await recordStorageWriteError('cookieStore.save', sessionId, origin, err);
    throw err;
  }

  if (cookies.length > 0) {
    // Real data again — a stale pre-logout slot would only be a credential
    // kept around for no reason.
    await dropUndo('cookies', sessionId, origin);
  }

  log.debug(`Saved ${cookies.length} cookies for session ${sessionId} on ${origin}`, { storeId });
}

/**
 * Move the current non-empty cookie snapshot into the undo slot.
 * Returns false when the caller must abort rather than overwrite.
 */
async function preserveCookiesForUndo(sessionId: string, origin: string): Promise<boolean> {
  const existing = await cookieStore.load(sessionId, origin);
  if (!existing || isEmptyCookieSnapshot(existing)) return true;

  try {
    await snapshotUndo.put('cookies', existing);
  } catch (err) {
    await recordStorageWriteError('snapshotUndo.put', sessionId, origin, err);
    log.error(
      `Keeping existing cookie snapshot for ${origin}: the undo slot could not be written, ` +
        'so replacing it with an empty capture would destroy the only copy',
    );
    return false;
  }

  log.info(
    `Cookie snapshot for ${origin} went empty — previous ${existing.cookies.length} cookie(s) ` +
      'kept as a recoverable undo slot',
  );
  return true;
}

/** Undo bookkeeping is best-effort once the primary data is safe. */
async function dropUndo(kind: SnapshotKind, sessionId: string, origin: string): Promise<void> {
  try {
    await snapshotUndo.delete(kind, sessionId, origin);
  } catch (err) {
    log.warn(`Failed to drop ${kind} undo slot for ${origin}`, err);
  }
}

export async function clearCookies(origin: string, storeId?: string): Promise<void> {
  const domain = extractDomain(origin);
  if (!domain) return;

  const cookies = await getCookiesForOrigin(origin, storeId);

  await Promise.all(
    cookies.map((cookie) => {
      const url = buildCookieUrl(cookie);
      return chrome.cookies.remove({
        url,
        name: cookie.name,
        ...(storeId != null ? { storeId } : {}),
      });
    }),
  );
}

export async function restoreCookies(
  sessionId: string,
  origin: string,
  storeId?: string,
): Promise<void> {
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
      // chrome.cookies.set makes a cookie host-only by OMITTING `domain`;
      // passing it back always produces a domain cookie. Restoring a captured
      // host-only cookie with its `domain` therefore silently widens it to
      // every subdomain — a scope the site deliberately refused. The widening
      // is also sticky: the broadened cookie starts matching the domain
      // hierarchy walk in getCookiesForOrigin, so sibling subdomains sweep it
      // into their own snapshots on the next switch.
      const isHostOnly = isHostCookie || cookie.hostOnly === true;

      let secure = cookie.secure;
      if (cookie.sameSite === 'no_restriction' || isHostCookie || isSecureCookie) {
        secure = true;
      }

      return chrome.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        ...(isHostOnly ? {} : { domain: cookie.domain }),
        path: isHostCookie ? '/' : cookie.path,
        secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
        ...(storeId != null ? { storeId } : {}),
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
      recordRestoreFailure(
        sessionId,
        origin,
        cookie.name,
        cookie.domain,
        'Silently rejected (returned null)',
      );
      failCount++;
    }
  }

  if (failCount > 0) {
    log.warn(`Failed to restore ${failCount} cookie(s) for ${origin}`);
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
      // Same undo rule as cookies: a "Clear browsing data" wipes localStorage
      // and the cookie jar in one go, so protecting only cookies would still
      // lose the half of the login that lives in DOM storage.
      if (isEmptyStorageSnapshot(snapshot) && !(await preserveStorageForUndo(sessionId, origin))) {
        return;
      }

      // A failed *write* is data loss and is recorded as such; a failed
      // *read* (no content script on this page, tab already gone) is
      // routine and stays a warning.
      try {
        await storageStore.save(snapshot);
      } catch (err) {
        await recordStorageWriteError('storageStore.save', sessionId, origin, err);
        return;
      }

      if (!isEmptyStorageSnapshot(snapshot)) {
        await dropUndo('storage', sessionId, origin);
      }
    }
  } catch (err) {
    log.warn('Failed to save tab storage', err);
  }
}

async function preserveStorageForUndo(sessionId: string, origin: string): Promise<boolean> {
  const existing = await storageStore.load(sessionId, origin);
  if (!existing || isEmptyStorageSnapshot(existing)) return true;

  try {
    await snapshotUndo.put('storage', existing);
  } catch (err) {
    await recordStorageWriteError('snapshotUndo.put', sessionId, origin, err);
    log.error(
      `Keeping existing storage snapshot for ${origin}: the undo slot could not be written, ` +
        'so replacing it with an empty capture would destroy the only copy',
    );
    return false;
  }

  log.info(
    `Storage snapshot for ${origin} went empty — previous state kept as a recoverable undo slot`,
  );
  return true;
}

/**
 * Move the undo slot back into the live snapshot for one origin.
 *
 * Swaps rather than moves: if the current snapshot still holds data it takes
 * the undo slot's place, so the action is itself reversible. The primary
 * store is written before the slot is touched — an interrupted restore
 * leaves the same data in both places, never in neither.
 */
export async function restorePreviousSnapshot(
  sessionId: string,
  origin: string,
): Promise<{ cookiesRestored: number; storageRestored: boolean }> {
  const [prevCookies, prevStorage] = await Promise.all([
    snapshotUndo.getCookies(sessionId, origin),
    snapshotUndo.getStorage(sessionId, origin),
  ]);

  let cookiesRestored = 0;
  if (prevCookies) {
    const current = await cookieStore.load(sessionId, origin);
    await cookieStore.save({ ...prevCookies, timestamp: now() });
    cookiesRestored = prevCookies.cookies.length;
    if (current && !isEmptyCookieSnapshot(current)) {
      await snapshotUndo.put('cookies', current);
    } else {
      await dropUndo('cookies', sessionId, origin);
    }
  }

  let storageRestored = false;
  if (prevStorage) {
    const current = await storageStore.load(sessionId, origin);
    await storageStore.save({ ...prevStorage, timestamp: now() });
    storageRestored = true;
    if (current && !isEmptyStorageSnapshot(current)) {
      await snapshotUndo.put('storage', current);
    } else {
      await dropUndo('storage', sessionId, origin);
    }
  }

  log.info(`Restored previous snapshot for ${origin}`, {
    sessionId,
    cookiesRestored,
    storageRestored,
  });

  return { cookiesRestored, storageRestored };
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
    log.warn('Failed to restore tab storage', err);
  }
}

/**
 * Detect which saved session best matches the current cookies for a given origin.
 * Compares live browser cookies against each session's saved cookie snapshot.
 * Returns the session ID with the highest cookie match ratio, or null if no match.
 */
export async function detectSessionForOrigin(
  origin: string,
  storeId?: string,
): Promise<string | null> {
  const domain = extractDomain(origin);
  if (!domain) return null;

  const liveCookies = await getCookiesForOrigin(origin, storeId);
  if (liveCookies.length === 0) return null;

  // Build a set of "name=value" fingerprints from live cookies
  const liveFingerprints = new Set(liveCookies.map((c) => `${c.name}=${c.value}`));

  // Get all session IDs that have snapshots for this origin
  const sessionIds = await cookieStore.getSessionIdsForOrigin(origin);
  if (sessionIds.length === 0) return null;

  // Load all snapshots in parallel instead of sequential N+1 queries
  const snapshots = await Promise.all(sessionIds.map((sid) => cookieStore.load(sid, origin)));

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

/**
 * Attach a session to a tab and adopt the tab's live cookies + DOM storage as
 * the session's snapshot for its current origin. Used when a session is
 * created from an already-loaded tab: the state on screen must belong to the
 * new session immediately, not only after the next switch-away.
 *
 * Best-effort: returns false (never throws) when the tab is gone or not on an
 * http(s) page, so callers can treat capture as an optional side effect of a
 * creation that already succeeded.
 */
export async function captureTabIntoSession(tabId: number, sessionId: string): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !isValidUrl(tab.url)) return false;

    const origin = new URL(tab.url).origin;
    const storeId = await getCookieStoreIdForTab(tabId);

    await assignTab(tabId, sessionId, origin, storeId);
    await Promise.all([
      saveCookies(sessionId, origin, storeId),
      saveTabStorage(tabId, sessionId, origin),
    ]);
    return true;
  } catch (err) {
    log.warn(`Failed to capture tab ${tabId} into session ${sessionId}`, err);
    return false;
  }
}

export function handleContentScriptReady(tabId: number): void {
  const pending = pendingRestores.get(tabId);
  if (!pending) return;

  pendingRestores.delete(tabId);
  restoreTabStorage(tabId, pending.sessionId, pending.origin).catch((err) => {
    log.warn('Failed to restore storage on ready', err);
  });
}

export function cleanupPendingRestore(tabId: number): void {
  pendingRestores.delete(tabId);
}

export async function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  // Chain switches on the same tab — each new switch waits for the TAIL of the
  // chain (not the head), so 3+ concurrent calls serialize correctly.
  const previous = switchLocks.get(tabId) ?? Promise.resolve();

  const work = previous.catch(() => {}).then(() => doSwitchSession(tabId, targetSessionId));
  switchLocks.set(tabId, work);

  try {
    await work;
  } finally {
    // Only clear if this is still the latest link in the chain
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

  // Resolve cookie store for this tab (normal vs incognito)
  const storeId = await getCookieStoreIdForTab(tabId);

  log.info(`Switching tab ${tabId} to session ${targetSessionId}`, {
    origin,
    storeId,
    fromSession: currentEntry?.sessionId ?? null,
  });

  // 1. Save current session's data before switching (parallel — independent I/O)
  if (currentEntry) {
    log.debug(`Saving outgoing session ${currentEntry.sessionId} data for ${origin}`);
    await Promise.all([
      saveCookies(currentEntry.sessionId, origin, storeId),
      saveTabStorage(tabId, currentEntry.sessionId, origin),
    ]);
  }

  // 2. Check whether the target session manages this origin at all.
  //    In "soft" isolation mode, skip clear+restore when it does not, so
  //    unmanaged domains (e.g., Google when using Instagram sessions) pass through.
  //
  //    "Manages" is deliberately wider than "has cookies right now". The
  //    pass-through below *adopts* whatever is live into the target session, so
  //    anything misclassified as unmanaged gets its saved login overwritten by
  //    the outgoing session's state. Two shapes have real data but no live
  //    cookies, and both must take the clear+restore path instead:
  //      - storage-only logins (Firebase/Supabase/Auth0 SPAs keep their token in
  //        localStorage and hold no cookie snapshot at all);
  //      - a session logged out on this origin, whose cookie snapshot is empty
  //        but whose undo slot holds the only surviving copy of its cookies —
  //        adopting would overwrite the snapshot *and* drop that slot.
  const isolationMode = domain ? getDomainIsolationMode(domain) : 'strict';
  const [targetCookies, targetStorage, undoCookies, undoStorage] = await Promise.all([
    cookieStore.load(targetSessionId, origin),
    storageStore.load(targetSessionId, origin),
    snapshotUndo.getCookies(targetSessionId, origin),
    snapshotUndo.getStorage(targetSessionId, origin),
  ]);
  const managesOrigin =
    (targetCookies != null && !isEmptyCookieSnapshot(targetCookies)) ||
    (targetStorage != null && !isEmptyStorageSnapshot(targetStorage)) ||
    undoCookies != null ||
    undoStorage != null;

  if (!managesOrigin && isolationMode === 'soft') {
    // Logged at info: to the user this switch is a no-op ("switching to my
    // logged-in session does nothing"), and the reason — the session holds
    // nothing for this origin — is only visible here.
    log.info(
      `Soft mode pass-through for ${origin}: session ${targetSessionId} has no saved cookies, ` +
        `storage or undo slot, adopting the live state instead of restoring`,
    );
    // Soft mode: no data for this domain → skip cookie operations, preserve current state.
    // Update tab mapping for badge/tracking, but REMOVE any DNR rule so the browser's
    // native Cookie header passes through (no header injection = no cookie override).
    // Adopt the live state as the target session's snapshot: without it a
    // brand-new session stays empty until the next switch-away, and is lost
    // entirely if the tab or browser closes first. Storage must be captured
    // before the reload below tears down the content script.
    await Promise.all([
      assignTab(tabId, targetSessionId, origin, storeId),
      removeRulesForTab(tabId),
      saveCookies(targetSessionId, origin, storeId),
      saveTabStorage(tabId, targetSessionId, origin),
    ]);

    // No storage restore needed — we're passing through
    await chrome.tabs.update(tabId, { url: tab.url });
    return;
  }

  // Strict mode (or target has data): full clear + restore cycle
  log.debug(`${isolationMode} mode: clearing cookies for ${origin} (storeId=${storeId})`);
  await clearCookies(origin, storeId);

  // 3. Restore target session's cookies for this origin
  log.debug(`Restoring cookies for session ${targetSessionId} on ${origin}`);
  await restoreCookies(targetSessionId, origin, storeId);

  // 4. Update tab-session mapping + DNR rules (parallel — independent)
  await Promise.all([
    assignTab(tabId, targetSessionId, origin, storeId),
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
