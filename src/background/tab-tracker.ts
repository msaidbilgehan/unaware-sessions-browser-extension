import type { TabSessionEntry, TabSessionMap } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import { getSession, setSession } from '@shared/storage';
import { extractOrigin, isValidUrl } from '@shared/utils';
import { createLogger } from '@shared/logger';
import { removeRulesForTab } from './dnr-manager';
import {
  cleanupPendingRestore,
  saveCookies,
  saveTabStorage,
  isTabSwitching,
} from './cookie-engine';

const log = createLogger('tab-tracker');

// Coalesces bursts of 'complete' events (redirect chains, SPA reloads) into
// one snapshot per tab.
const SAVE_DEBOUNCE_MS = 1500;

let tabMap: Map<number, TabSessionEntry> = new Map();
let hydratePromise: Promise<void> | null = null;

const pendingSaves: Map<number, ReturnType<typeof setTimeout>> = new Map();

async function ensureHydrated(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  return hydrateTabMap();
}

// All callers (service-worker top-level and handlers via ensureHydrated) must
// share one load promise — a second concurrent load could overwrite the map
// with a snapshot read before an interleaved assign/unassign persisted.
export function hydrateTabMap(): Promise<void> {
  hydratePromise = (async () => {
    const stored = await getSession<TabSessionMap>(STORAGE_KEYS.TAB_MAP);
    tabMap = new Map(Object.entries(stored ?? {}).map(([k, v]) => [Number(k), v]));
  })();
  return hydratePromise;
}

export async function persistTabMap(): Promise<void> {
  const obj: TabSessionMap = {};
  for (const [tabId, entry] of tabMap) {
    obj[tabId] = entry;
  }
  await setSession(STORAGE_KEYS.TAB_MAP, obj);
}

export async function assignTab(
  tabId: number,
  sessionId: string,
  origin: string,
  storeId?: string,
): Promise<void> {
  await ensureHydrated();
  log.debug(`Assigning tab ${tabId} to session ${sessionId}`, { origin, storeId });
  tabMap.set(tabId, { sessionId, origin, ...(storeId != null ? { storeId } : {}) });
  await persistTabMap();
}

export async function unassignTab(tabId: number): Promise<void> {
  await ensureHydrated();
  cancelPendingSave(tabId);
  tabMap.delete(tabId);
  await persistTabMap();
  await removeRulesForTab(tabId);
}

export async function getTabEntry(tabId: number): Promise<TabSessionEntry | undefined> {
  await ensureHydrated();
  return tabMap.get(tabId);
}

export async function getTabsForSession(sessionId: string): Promise<number[]> {
  await ensureHydrated();
  const tabs: number[] = [];
  for (const [tabId, entry] of tabMap) {
    if (entry.sessionId === sessionId) {
      tabs.push(tabId);
    }
  }
  return tabs;
}

export async function getAllTabEntries(): Promise<Map<number, TabSessionEntry>> {
  await ensureHydrated();
  return new Map(tabMap);
}

// ── Event-driven auto-save ──────────────────────────────────
//
// Switching away from a session is not the only moment its live state must be
// captured: tabs get closed, navigated cross-origin, and logins complete
// without any switch ever happening. Each of those events snapshots the
// session here so the data survives browser restarts and later switches.

function cancelPendingSave(tabId: number): void {
  const timer = pendingSaves.get(tabId);
  if (timer != null) {
    clearTimeout(timer);
    pendingSaves.delete(tabId);
  }
}

function scheduleTabSave(tabId: number): void {
  cancelPendingSave(tabId);
  const timer = setTimeout(() => {
    pendingSaves.delete(tabId);
    saveTrackedTabNow(tabId).catch((err) => {
      log.warn(`Auto-save failed for tab ${tabId}`, err);
    });
  }, SAVE_DEBOUNCE_MS);
  pendingSaves.set(tabId, timer);
}

async function saveTrackedTabNow(tabId: number): Promise<void> {
  await ensureHydrated();
  const entry = tabMap.get(tabId);
  if (!entry || isTabSwitching(tabId)) return;
  await Promise.all([
    saveCookies(entry.sessionId, entry.origin, entry.storeId),
    saveTabStorage(tabId, entry.sessionId, entry.origin),
  ]);
}

async function handleTabRemoved(tabId: number): Promise<void> {
  await ensureHydrated();
  cleanupPendingRestore(tabId);
  cancelPendingSave(tabId);
  const entry = tabMap.get(tabId);
  if (entry) {
    // The tab is gone but its cookies are still in the jar — snapshot them so
    // logins that happened after the last save are not lost. DOM storage
    // cannot be read from a closed tab.
    try {
      await saveCookies(entry.sessionId, entry.origin, entry.storeId);
    } catch (err) {
      log.warn(`Failed to save cookies for closed tab ${tabId}`, err);
    }
    tabMap.delete(tabId);
    await persistTabMap();
    await removeRulesForTab(tabId);
  }
}

async function handleTabUpdated(
  tabId: number,
  changeInfo: { url?: string; status?: string },
  tab: chrome.tabs.Tab,
): Promise<void> {
  await ensureHydrated();
  const entry = tabMap.get(tabId);
  if (!entry) return;

  if (changeInfo.url && tab.url) {
    const newOrigin = extractOrigin(tab.url);
    if (newOrigin && isValidUrl(tab.url) && newOrigin !== entry.origin) {
      // Origin changed — unassign session. The session data belongs to
      // the old origin; keeping it assigned on a different origin causes
      // cross-domain confusion (session appearing under wrong "THIS SITE").
      log.info(
        `Tab ${tabId} navigated cross-origin: ${entry.origin} -> ${newOrigin}, unassigning session ${entry.sessionId}`,
      );
      cancelPendingSave(tabId);
      // The old origin's cookies are still in the jar — capture them before
      // dropping the mapping, or state newer than the last save is lost.
      try {
        await saveCookies(entry.sessionId, entry.origin, entry.storeId);
      } catch (err) {
        log.warn(`Failed to save cookies before unassigning tab ${tabId}`, err);
      }
      tabMap.delete(tabId);
      await persistTabMap();
      await removeRulesForTab(tabId);
      cleanupPendingRestore(tabId);
      return;
    }
  }

  // Same-origin load finished (e.g. a login redirect landed) — capture fresh
  // cookies + storage shortly after, once per burst of navigation events.
  if (changeInfo.status === 'complete' && tab.url) {
    const origin = extractOrigin(tab.url);
    if (origin && origin === entry.origin && !isTabSwitching(tabId)) {
      scheduleTabSave(tabId);
    }
  }
}

export function initTabTracker(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId).catch((err) => {
      log.error('Tab removed handler failed', err);
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    handleTabUpdated(tabId, changeInfo, tab).catch((err) => {
      log.error('Tab updated handler failed', err);
    });
  });
}
