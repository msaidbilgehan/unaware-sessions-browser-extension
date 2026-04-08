import { ALARM_PERSIST_STATE, ALARM_INTERVAL_MINUTES, ALARM_AUTO_REFRESH } from '@shared/constants';
import { initMessaging } from './messaging';
import { initTabTracker, hydrateTabMap, persistTabMap } from './tab-tracker';
import { hydrateSessions } from './session-manager';
import { initContextMenu } from './context-menu';
import { initBadgeManager } from './badge-manager';
import { cleanupStaleRules } from './dnr-manager';
import { initAutoRefresh, refreshAllActiveSessions } from './auto-refresh';

async function hydrateState(): Promise<void> {
  await Promise.all([hydrateSessions(), hydrateTabMap()]);
}

// Hydrate on every SW wake (top-level runs each time the worker starts)
hydrateState().catch((err) => {
  console.error('[Unaware Sessions] Failed to hydrate state:', err);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Unaware Sessions] Extension installed');
  }

  // Set up periodic state persistence alarm
  chrome.alarms.create(ALARM_PERSIST_STATE, {
    periodInMinutes: ALARM_INTERVAL_MINUTES,
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Unaware Sessions] Browser startup — state hydrated');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PERSIST_STATE) {
    await persistTabMap();
    await cleanupStaleRules();
  } else if (alarm.name === ALARM_AUTO_REFRESH) {
    await refreshAllActiveSessions();
  }
});

// Initialize modules
initMessaging();
initTabTracker();
initContextMenu();
initBadgeManager();
initAutoRefresh().catch((err) => {
  console.error('[Unaware Sessions] Failed to init auto-refresh:', err);
});
