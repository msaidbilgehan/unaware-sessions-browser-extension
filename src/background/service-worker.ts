import {
  ALARM_PERSIST_STATE,
  ALARM_INTERVAL_MINUTES,
  ALARM_AUTO_REFRESH,
  ALARM_DRIVE_SYNC,
} from '@shared/constants';
import { initMessaging } from './messaging';
import { initTabTracker, hydrateTabMap, persistTabMap } from './tab-tracker';
import { hydrateSessions } from './session-manager';
import { initContextMenu } from './context-menu';
import { initBadgeManager } from './badge-manager';
import { cleanupStaleRules } from './dnr-manager';
import { initAutoRefresh, refreshAllActiveSessions } from './auto-refresh';
import { initDriveSync, handleDriveSyncAlarm } from './drive-sync';
import { initSettings } from '@shared/settings-store';
import { initSyncStore } from '@shared/sync/sync-store';
import { createLogger } from '@shared/logger';

const log = createLogger('service-worker');

async function hydrateState(): Promise<void> {
  // Init settings first so the logger level is available for all subsequent modules
  await initSettings();
  await initSyncStore();
  await Promise.all([hydrateSessions(), hydrateTabMap()]);
}

// Hydrate on every SW wake (top-level runs each time the worker starts)
hydrateState().catch((err) => {
  log.error('Failed to hydrate state', err);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    log.info('Extension installed');
  }

  // Set up periodic state persistence alarm
  chrome.alarms.create(ALARM_PERSIST_STATE, {
    periodInMinutes: ALARM_INTERVAL_MINUTES,
  });
});

chrome.runtime.onStartup.addListener(() => {
  log.info('Browser startup — state hydrated');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === ALARM_PERSIST_STATE) {
      log.debug('Alarm: persisting tab map and cleaning stale rules');
      await persistTabMap();
      await cleanupStaleRules();
    } else if (alarm.name === ALARM_AUTO_REFRESH) {
      log.debug('Alarm: auto-refreshing active sessions');
      await refreshAllActiveSessions();
    } else if (alarm.name === ALARM_DRIVE_SYNC) {
      log.debug('Alarm: drive sync');
      await handleDriveSyncAlarm();
    }
  } catch (err) {
    log.warn('Alarm handler error', err);
  }
});

// Initialize modules
initMessaging();
initTabTracker();
initContextMenu();
initBadgeManager();
initAutoRefresh().catch((err) => {
  log.error('Failed to init auto-refresh', err);
});
initDriveSync().catch((err) => {
  log.error('Failed to init drive-sync', err);
});
