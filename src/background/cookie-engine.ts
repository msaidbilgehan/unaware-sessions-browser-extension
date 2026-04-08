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

  for (const cookie of snapshot.cookies) {
    const url = buildCookieUrl(cookie);

    let secure = cookie.secure;
    // sameSite 'no_restriction' maps to SameSite=None which requires Secure on Chromium
    if (cookie.sameSite === 'no_restriction') {
      secure = true;
    }

    try {
      await chrome.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
      });
    } catch (err) {
      console.warn(`[Unaware Sessions] Failed to restore cookie "${cookie.name}":`, err);
    }
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

export function handleContentScriptReady(tabId: number): void {
  const pending = pendingRestores.get(tabId);
  if (!pending) return;

  pendingRestores.delete(tabId);
  restoreTabStorage(tabId, pending.sessionId, pending.origin).catch((err) => {
    console.warn('[Unaware Sessions] Failed to restore storage on ready:', err);
  });
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

/**
 * Clear ALL cookies in the browser (not just one domain).
 * Necessary for clean session switching across multi-domain auth flows.
 */
async function clearAllCookies(): Promise<void> {
  const allCookies = await chrome.cookies.getAll({});

  await Promise.all(
    allCookies.map((cookie) => {
      const url = buildCookieUrl(cookie);
      return chrome.cookies.remove({ url, name: cookie.name });
    }),
  );
}

export async function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) {
    throw new Error('Tab has no URL');
  }

  const origin = new URL(tab.url).origin;
  const currentEntry = getTabEntry(tabId);

  // 1. Save current session's ALL cookies and tab storage
  //    Saves all browser cookies (not just this origin) to capture cross-domain
  //    auth flows like OAuth, SSO, and multi-subdomain authentication.
  if (currentEntry) {
    await saveAllCookiesForSession(currentEntry.sessionId, origin);
    await saveTabStorage(tabId, currentEntry.sessionId, origin);
  }

  // 2. Clear ALL cookies (not just this origin) for clean isolation
  await clearAllCookies();

  // 3. Restore target session's cookies (includes all domains)
  await restoreCookies(targetSessionId, origin);

  // 4. Update tab-session mapping
  await assignTab(tabId, targetSessionId, origin);

  // 5. Update DNR rules
  await updateRulesForTab(tabId, targetSessionId, origin);

  // 6. Queue storage restore for when content script is ready after reload
  pendingRestores.set(tabId, { sessionId: targetSessionId, origin });

  // 7. Reload tab — content script will send CONTENT_SCRIPT_READY on load,
  //    which triggers handleContentScriptReady to restore storage
  await chrome.tabs.reload(tabId);
}
