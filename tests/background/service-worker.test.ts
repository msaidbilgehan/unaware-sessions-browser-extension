import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { ALARM_PERSIST_STATE, ALARM_INTERVAL_MINUTES } from '@shared/constants';

// The service worker import triggers side effects. We import it once.
await import('@background/service-worker');

beforeEach(() => {
  resetChromeMocks();
});

describe('service-worker initialization', () => {
  it('registers onMessage listener via initMessaging', () => {
    expect(mockChrome.runtime.onMessage._listeners.length).toBeGreaterThan(0);
  });

  it('registers tab event listeners via initTabTracker and initBadgeManager', () => {
    expect(mockChrome.tabs.onRemoved._listeners.length).toBeGreaterThan(0);
    expect(mockChrome.tabs.onUpdated._listeners.length).toBeGreaterThan(0);
    expect(mockChrome.tabs.onActivated._listeners.length).toBeGreaterThan(0);
  });

  it('registers context menu listener', () => {
    expect(mockChrome.contextMenus.onClicked._listeners.length).toBeGreaterThan(0);
  });
});

describe('onInstalled handler', () => {
  it('creates persist-state alarm on install', () => {
    mockChrome.runtime.onInstalled._fire({ reason: 'install' });

    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_PERSIST_STATE, {
      periodInMinutes: ALARM_INTERVAL_MINUTES,
    });
  });

  it('creates persist-state alarm on update too', () => {
    mockChrome.runtime.onInstalled._fire({ reason: 'update' });

    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_PERSIST_STATE, {
      periodInMinutes: ALARM_INTERVAL_MINUTES,
    });
  });
});

describe('onAlarm handler', () => {
  it('persists tab map and cleans up stale rules on persist-state alarm', async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    mockChrome.alarms.onAlarm._fire({ name: ALARM_PERSIST_STATE });
    await new Promise((r) => setTimeout(r, 20));

    // persistTabMap writes to chrome.storage.session
    expect(chrome.storage.session.set).toHaveBeenCalled();
    // cleanupStaleRules queries session rules
    expect(chrome.declarativeNetRequest.getSessionRules).toHaveBeenCalled();
  });
});
