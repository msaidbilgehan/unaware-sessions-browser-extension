import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { STORAGE_KEYS, DEFAULT_EXTENSION_SETTINGS } from '@shared/constants';
import type { ExtensionSettings } from '@shared/types';

const {
  initSettings,
  getSettings,
  getAutoRefreshInterval,
  getAutoRefreshDefaultEnabled,
  setAutoRefreshInterval,
  setAutoRefreshDefaultEnabled,
  getDomainRefreshMap,
  isDomainAutoRefreshEnabled,
  setDomainAutoRefresh,
  onSettingsChange,
  onDomainRefreshChange,
} = await import('@shared/settings-store');

let settingsUnsubs: Array<() => void> = [];
let domainUnsubs: Array<() => void> = [];

beforeEach(async () => {
  for (const unsub of settingsUnsubs) unsub();
  for (const unsub of domainUnsubs) unsub();
  settingsUnsubs = [];
  domainUnsubs = [];
  resetChromeMocks();
  await initSettings();
});

describe('initSettings', () => {
  it('defaults to DEFAULT_EXTENSION_SETTINGS when storage is empty', () => {
    expect(getSettings()).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it('loads stored settings from chrome.storage.local', async () => {
    const stored: ExtensionSettings = {
      autoRefreshInterval: 30,
      autoRefreshDefaultEnabled: true,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.EXTENSION_SETTINGS]: stored });
    await initSettings();

    expect(getAutoRefreshInterval()).toBe(30);
    expect(getAutoRefreshDefaultEnabled()).toBe(true);
  });

  it('merges partial stored settings with defaults', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: { autoRefreshInterval: 10 },
    });
    await initSettings();

    expect(getAutoRefreshInterval()).toBe(10);
    expect(getAutoRefreshDefaultEnabled()).toBe(
      DEFAULT_EXTENSION_SETTINGS.autoRefreshDefaultEnabled,
    );
  });

  it('loads stored domain refresh map', async () => {
    const domainMap = { 'session1:https://example.com': true };
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTO_REFRESH_DOMAINS]: domainMap });
    await initSettings();

    expect(getDomainRefreshMap()).toEqual(domainMap);
  });

  it('defaults domain refresh map to empty object', async () => {
    await initSettings();
    expect(getDomainRefreshMap()).toEqual({});
  });

  it('notifies settings listeners after loading', async () => {
    const listener = vi.fn();
    settingsUnsubs.push(onSettingsChange(listener));

    await initSettings();

    expect(listener).toHaveBeenCalledWith(DEFAULT_EXTENSION_SETTINGS);
  });

  it('notifies domain listeners after loading', async () => {
    const listener = vi.fn();
    domainUnsubs.push(onDomainRefreshChange(listener));

    await initSettings();

    expect(listener).toHaveBeenCalledWith({});
  });
});

describe('setAutoRefreshInterval', () => {
  it('updates the interval and persists to storage', async () => {
    await setAutoRefreshInterval(60);

    expect(getAutoRefreshInterval()).toBe(60);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: expect.objectContaining({
        autoRefreshInterval: 60,
      }),
    });
  });

  it('notifies settings listeners', async () => {
    const listener = vi.fn();
    settingsUnsubs.push(onSettingsChange(listener));

    await setAutoRefreshInterval(30);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ autoRefreshInterval: 30 }),
    );
  });

  it('preserves other settings when updating interval', async () => {
    await setAutoRefreshDefaultEnabled(true);
    await setAutoRefreshInterval(60);

    expect(getAutoRefreshDefaultEnabled()).toBe(true);
    expect(getAutoRefreshInterval()).toBe(60);
  });
});

describe('setAutoRefreshDefaultEnabled', () => {
  it('updates default enabled and persists to storage', async () => {
    await setAutoRefreshDefaultEnabled(true);

    expect(getAutoRefreshDefaultEnabled()).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: expect.objectContaining({
        autoRefreshDefaultEnabled: true,
      }),
    });
  });

  it('notifies settings listeners', async () => {
    const listener = vi.fn();
    settingsUnsubs.push(onSettingsChange(listener));

    await setAutoRefreshDefaultEnabled(true);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ autoRefreshDefaultEnabled: true }),
    );
  });
});

describe('isDomainAutoRefreshEnabled', () => {
  it('returns false by default when autoRefreshDefaultEnabled is false', () => {
    expect(isDomainAutoRefreshEnabled('s1', 'https://example.com')).toBe(false);
  });

  it('falls back to autoRefreshDefaultEnabled when domain not set', async () => {
    await setAutoRefreshDefaultEnabled(true);
    expect(isDomainAutoRefreshEnabled('s1', 'https://unknown.com')).toBe(true);
  });

  it('returns explicit domain value over default', async () => {
    await setAutoRefreshDefaultEnabled(true);
    await setDomainAutoRefresh('s1', 'https://example.com', false);

    expect(isDomainAutoRefreshEnabled('s1', 'https://example.com')).toBe(false);
  });
});

describe('setDomainAutoRefresh', () => {
  it('enables auto-refresh for a specific domain', async () => {
    await setDomainAutoRefresh('s1', 'https://example.com', true);

    expect(isDomainAutoRefreshEnabled('s1', 'https://example.com')).toBe(true);
  });

  it('persists domain map to storage', async () => {
    await setDomainAutoRefresh('s1', 'https://example.com', true);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.AUTO_REFRESH_DOMAINS]: {
        's1:https://example.com': true,
      },
    });
  });

  it('notifies domain listeners', async () => {
    const listener = vi.fn();
    domainUnsubs.push(onDomainRefreshChange(listener));

    await setDomainAutoRefresh('s1', 'https://example.com', true);

    expect(listener).toHaveBeenCalledWith({ 's1:https://example.com': true });
  });

  it('handles multiple domains independently', async () => {
    await setDomainAutoRefresh('s1', 'https://a.com', true);
    await setDomainAutoRefresh('s1', 'https://b.com', false);

    expect(isDomainAutoRefreshEnabled('s1', 'https://a.com')).toBe(true);
    expect(isDomainAutoRefreshEnabled('s1', 'https://b.com')).toBe(false);
  });
});

describe('onSettingsChange', () => {
  it('returns an unsubscribe function that stops notifications', async () => {
    const listener = vi.fn();
    const unsub = onSettingsChange(listener);

    unsub();
    await setAutoRefreshInterval(60);

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple concurrent listeners', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    settingsUnsubs.push(onSettingsChange(listener1));
    settingsUnsubs.push(onSettingsChange(listener2));

    await setAutoRefreshInterval(30);

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('unsubscribing one listener does not affect others', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = onSettingsChange(listener1);
    settingsUnsubs.push(onSettingsChange(listener2));

    unsub1();
    await setAutoRefreshInterval(60);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledOnce();
  });
});

describe('onDomainRefreshChange', () => {
  it('returns an unsubscribe function that stops notifications', async () => {
    const listener = vi.fn();
    const unsub = onDomainRefreshChange(listener);

    unsub();
    await setDomainAutoRefresh('s1', 'https://example.com', true);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('getSettings', () => {
  it('returns the full settings object', () => {
    const settings = getSettings();
    expect(settings).toHaveProperty('autoRefreshInterval');
    expect(settings).toHaveProperty('autoRefreshDefaultEnabled');
  });

  it('reflects changes after setters', async () => {
    await setAutoRefreshInterval(60);
    await setAutoRefreshDefaultEnabled(true);

    const settings = getSettings();
    expect(settings.autoRefreshInterval).toBe(60);
    expect(settings.autoRefreshDefaultEnabled).toBe(true);
  });
});
