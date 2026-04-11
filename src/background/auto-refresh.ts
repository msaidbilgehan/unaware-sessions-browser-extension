import { ALARM_AUTO_REFRESH, STORAGE_KEYS } from '@shared/constants';
import type { ExtensionSettings, AutoRefreshInterval } from '@shared/types';
import { saveCookies, saveTabStorage, isTabSwitching, getCookieStoreIdForTab } from './cookie-engine';
import { getAllTabEntries } from './tab-tracker';
import { touchSessionRefresh } from './session-manager';
import { isDomainAutoRefreshEnabled } from '@shared/settings-store';
import { createLogger } from '@shared/logger';

const log = createLogger('auto-refresh');

/**
 * Save fresh cookies + DOM storage for every tracked tab.
 * Called by both the alarm handler and the REFRESH_ACTIVE_SESSIONS message handler.
 */
export async function refreshAllActiveSessions(): Promise<number> {
  const entries = await getAllTabEntries();
  const refreshed = new Set<string>();

  log.debug(`Auto-refresh: processing ${entries.size} tracked tab(s)`);

  await Promise.allSettled(
    Array.from(entries).map(async ([tabId, entry]) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url) return;
        const origin = new URL(tab.url).origin;
        if (!isDomainAutoRefreshEnabled(entry.sessionId, origin)) return;
        if (isTabSwitching(tabId)) return;
        const storeId = await getCookieStoreIdForTab(tabId);
        await Promise.all([
          saveCookies(entry.sessionId, origin, storeId),
          saveTabStorage(tabId, entry.sessionId, origin),
        ]);
        refreshed.add(entry.sessionId);
      } catch (err) {
        log.warn(`Auto-refresh failed for tab ${tabId}`, err);
      }
    }),
  );

  for (const sessionId of refreshed) {
    await touchSessionRefresh(sessionId);
  }

  log.info(`Auto-refresh complete: ${refreshed.size} session(s) refreshed`);
  return refreshed.size;
}

function intervalToMinutes(seconds: AutoRefreshInterval): number {
  if (seconds <= 0) return 0;
  return seconds / 60;
}

async function syncAlarm(interval: AutoRefreshInterval): Promise<void> {
  if (interval === 0) {
    await chrome.alarms.clear(ALARM_AUTO_REFRESH);
    return;
  }

  const existing = await chrome.alarms.get(ALARM_AUTO_REFRESH);
  const period = intervalToMinutes(interval);

  // Only recreate if period changed
  if (existing?.periodInMinutes && Math.abs(existing.periodInMinutes - period) < 0.01) return;

  await chrome.alarms.create(ALARM_AUTO_REFRESH, { periodInMinutes: period });
}

let autoRefreshInitialized = false;

/** Reset init guard — for tests only. */
export function resetAutoRefreshInit(): void {
  autoRefreshInitialized = false;
}

/**
 * Initialize alarm-based auto-refresh.
 * Reads the current interval from storage and watches for changes.
 */
export async function initAutoRefresh(): Promise<void> {
  if (autoRefreshInitialized) return;
  autoRefreshInitialized = true;
  // Read current interval
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXTENSION_SETTINGS);
  const settings = result[STORAGE_KEYS.EXTENSION_SETTINGS] as ExtensionSettings | undefined;
  const interval: AutoRefreshInterval = settings?.autoRefreshInterval ?? 0;
  await syncAlarm(interval);

  // Watch for interval changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (STORAGE_KEYS.EXTENSION_SETTINGS in changes) {
      const newSettings = changes[STORAGE_KEYS.EXTENSION_SETTINGS]
        .newValue as ExtensionSettings | undefined;
      const newInterval: AutoRefreshInterval = newSettings?.autoRefreshInterval ?? 0;
      syncAlarm(newInterval).catch((err) => {
        log.warn('Failed to sync alarm', err);
      });
    }
  });
}
