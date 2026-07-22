import { getTabEntry } from './tab-tracker';
import { getSession } from './session-manager';
import { getSyncConfigHydrated, onSyncConfigChange } from '@shared/sync/sync-store';
import { createLogger } from '@shared/logger';

const log = createLogger('badge-manager');

// A pending sync conflict outranks the per-tab session badge — it's rare and
// actionable, and blocks auto-sync until resolved, so it takes over every
// tab's badge until the conflict is cleared.
const CONFLICT_BADGE_TEXT = '!';
const CONFLICT_BADGE_COLOR = '#f59e0b';

let syncConflictPending = false;

export async function updateBadge(tabId: number): Promise<void> {
  if (syncConflictPending) {
    await chrome.action.setBadgeText({ text: CONFLICT_BADGE_TEXT, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: CONFLICT_BADGE_COLOR, tabId });
    return;
  }

  const entry = await getTabEntry(tabId);

  if (!entry) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const session = await getSession(entry.sessionId);
  if (!session) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const abbreviation = session.name.slice(0, 2).toUpperCase();

  await chrome.action.setBadgeText({ text: abbreviation, tabId });
  await chrome.action.setBadgeBackgroundColor({ color: session.color, tabId });
}

async function refreshAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => (tab.id != null ? updateBadge(tab.id) : Promise.resolve())));
}

export function initBadgeManager(): void {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    updateBadge(activeInfo.tabId).catch((err) => {
      log.warn('Badge update failed', err);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      updateBadge(tabId).catch((err) => {
        log.warn('Badge update failed', err);
      });
    }
  });

  // A fresh SW instance starts with syncConflictPending defaulted to false;
  // read the persisted flag before any tab event can render a stale badge.
  // Tabs already showing the conflict badge from a prior SW instance need no
  // repaint here — chrome.action badge state persists across SW eviction.
  getSyncConfigHydrated()
    .then((config) => {
      syncConflictPending = (config.pendingConflicts?.length ?? 0) > 0;
    })
    .catch((err) => {
      log.warn('Failed to read sync conflict state for badge', err);
    });

  onSyncConfigChange((config) => {
    const hasConflict = (config.pendingConflicts?.length ?? 0) > 0;
    if (hasConflict === syncConflictPending) return;
    syncConflictPending = hasConflict;
    refreshAllBadges().catch((err) => {
      log.warn('Failed to refresh badges for sync conflict state', err);
    });
  });
}
