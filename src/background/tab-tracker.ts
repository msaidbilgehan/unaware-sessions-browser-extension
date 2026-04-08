import type { TabSessionEntry, TabSessionMap } from '@shared/types';
import { STORAGE_KEYS } from '@shared/constants';
import { getSession, setSession } from '@shared/storage';
import { extractOrigin, isValidUrl } from '@shared/utils';
import { removeRulesForTab } from './dnr-manager';

let tabMap: Map<number, TabSessionEntry> = new Map();
let hydrated = false;

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  await hydrateTabMap();
}

export async function hydrateTabMap(): Promise<void> {
  const stored = await getSession<TabSessionMap>(STORAGE_KEYS.TAB_MAP);
  tabMap = new Map(Object.entries(stored ?? {}).map(([k, v]) => [Number(k), v]));
  hydrated = true;
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
  tabMap.set(tabId, { sessionId, origin });
  await persistTabMap();
}

export async function unassignTab(tabId: number): Promise<void> {
  await ensureHydrated();
  tabMap.delete(tabId);
  await persistTabMap();
  await removeRulesForTab(tabId);
}

export function getTabEntry(tabId: number): TabSessionEntry | undefined {
  return tabMap.get(tabId);
}

export function getTabsForSession(sessionId: string): number[] {
  const tabs: number[] = [];
  for (const [tabId, entry] of tabMap) {
    if (entry.sessionId === sessionId) {
      tabs.push(tabId);
    }
  }
  return tabs;
}

export function getAllTabEntries(): Map<number, TabSessionEntry> {
  return new Map(tabMap);
}

async function handleTabRemoved(tabId: number): Promise<void> {
  await ensureHydrated();
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
        tabMap.set(tabId, { ...entry, origin: newOrigin });
        await persistTabMap();
      }
    }
  }
}

export function initTabTracker(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId).catch((err) => {
      console.error('[Unaware Sessions] Tab removed handler failed:', err);
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    handleTabUpdated(tabId, changeInfo, tab).catch((err) => {
      console.error('[Unaware Sessions] Tab updated handler failed:', err);
    });
  });
}
