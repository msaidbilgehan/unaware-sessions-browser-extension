import type { TabSessionEntry, TabSessionMap } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import { getSession, setSession } from '@shared/storage';
import { extractOrigin, isValidUrl } from '@shared/utils';
import { createLogger } from '@shared/logger';
import { removeRulesForTab, updateRulesForTab } from './dnr-manager';
import { cleanupPendingRestore } from './cookie-engine';
import { hasSharedDomainCookie } from './cookie-scope';

const log = createLogger('tab-tracker');

let tabMap: Map<number, TabSessionEntry> = new Map();
let hydratePromise: Promise<void> | null = null;

async function ensureHydrated(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = hydrateTabMap();
  return hydratePromise;
}

export async function hydrateTabMap(): Promise<void> {
  const stored = await getSession<TabSessionMap>(STORAGE_KEYS.TAB_MAP);
  tabMap = new Map(Object.entries(stored ?? {}).map(([k, v]) => [Number(k), v]));
}

export async function persistTabMap(): Promise<void> {
  const obj: TabSessionMap = {};
  for (const [tabId, entry] of tabMap) {
    obj[tabId] = entry;
  }
  await setSession(STORAGE_KEYS.TAB_MAP, obj);
}

export async function assignTab(tabId: number, sessionId: string, origin: string): Promise<void> {
  await ensureHydrated();
  log.debug(`Assigning tab ${tabId} to session ${sessionId}`, { origin });
  tabMap.set(tabId, { sessionId, origin });
  await persistTabMap();
}

export async function unassignTab(tabId: number): Promise<void> {
  await ensureHydrated();
  tabMap.delete(tabId);
  await persistTabMap();
  await removeRulesForTab(tabId);
}

export async function unassignTabsForSession(sessionId: string): Promise<number[]> {
  await ensureHydrated();

  const tabIds: number[] = [];
  for (const [tabId, entry] of tabMap) {
    if (entry.sessionId === sessionId) {
      tabMap.delete(tabId);
      cleanupPendingRestore(tabId);
      tabIds.push(tabId);
    }
  }

  if (tabIds.length > 0) {
    await persistTabMap();
    await Promise.all(tabIds.map((tabId) => removeRulesForTab(tabId)));
  }

  return tabIds;
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

async function handleTabRemoved(tabId: number): Promise<void> {
  await ensureHydrated();
  cleanupPendingRestore(tabId);
  if (tabMap.has(tabId)) {
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
  if (changeInfo.url && tab.url) {
    const entry = tabMap.get(tabId);
    if (entry) {
      const newOrigin = extractOrigin(tab.url);
      if (newOrigin && isValidUrl(tab.url) && newOrigin !== entry.origin) {
        if (await hasSharedDomainCookie(entry.sessionId, entry.origin, newOrigin)) {
          log.info(
            `Tab ${tabId} navigated across compatible cookie domains: ${entry.origin} -> ${newOrigin}`,
          );
          tabMap.set(tabId, { ...entry, origin: newOrigin });
          await persistTabMap();
          cleanupPendingRestore(tabId);
          await updateRulesForTab(tabId, entry.sessionId, newOrigin);
          return;
        }
        // Origin changed — unassign session. The session data belongs to
        // the old origin; keeping it assigned on a different origin causes
        // cross-domain confusion (session appearing under wrong "THIS SITE").
        log.info(`Tab ${tabId} navigated cross-origin: ${entry.origin} -> ${newOrigin}, unassigning session ${entry.sessionId}`);
        tabMap.delete(tabId);
        await persistTabMap();
        await removeRulesForTab(tabId);
        cleanupPendingRestore(tabId);
      }
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
