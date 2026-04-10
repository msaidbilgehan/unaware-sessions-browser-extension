import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { ALARM_AUTO_REFRESH, STORAGE_KEYS } from '@shared/constants';
import { hydrateSessions, createSession } from '@background/session-manager';
import { hydrateTabMap, assignTab } from '@background/tab-tracker';
import { initAutoRefresh, refreshAllActiveSessions } from '@background/auto-refresh';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateSessions();
  await hydrateTabMap();
});

describe('refreshAllActiveSessions', () => {
  it('returns 0 when no tabs are tracked', async () => {
    const count = await refreshAllActiveSessions();
    expect(count).toBe(0);
  });

  it('refreshes tracked tabs and returns count of unique sessions', async () => {
    const s = await createSession('test', '#F00');
    await assignTab(1, s.id, 'https://example.com');

    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      url: 'https://example.com/page',
    });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // saveTabStorage will fail (no content script) — that's OK, refreshed set still counts
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('No content script'),
    );

    const count = await refreshAllActiveSessions();
    expect(count).toBe(1);
  });

  it('skips tabs without URLs', async () => {
    const s = await createSession('test', '#F00');
    await assignTab(2, s.id, 'https://example.com');

    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 2 });

    const count = await refreshAllActiveSessions();
    expect(count).toBe(0);
  });

  it('skips closed tabs gracefully', async () => {
    const s = await createSession('test', '#F00');
    await assignTab(3, s.id, 'https://example.com');

    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Tab not found'),
    );

    const count = await refreshAllActiveSessions();
    expect(count).toBe(0);
  });

  it('deduplicates sessions when multiple tabs share a session', async () => {
    const s = await createSession('test', '#F00');
    await assignTab(10, s.id, 'https://a.com');
    await assignTab(11, s.id, 'https://b.com');

    (chrome.tabs.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 10, url: 'https://a.com' })
      .mockResolvedValueOnce({ id: 11, url: 'https://b.com' });
    (chrome.cookies.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No content script'),
    );

    const count = await refreshAllActiveSessions();
    expect(count).toBe(1); // One unique session
  });
});

describe('initAutoRefresh', () => {
  it('creates alarm when stored interval is non-zero', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: {
        autoRefreshInterval: 60,
        autoRefreshDefaultEnabled: false,
        isolationModeDefault: 'soft',
      },
    });

    await initAutoRefresh();

    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_AUTO_REFRESH, {
      periodInMinutes: 1,
    });
  });

  it('clears alarm when stored interval is 0', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: {
        autoRefreshInterval: 0,
        autoRefreshDefaultEnabled: false,
        isolationModeDefault: 'soft',
      },
    });

    await initAutoRefresh();

    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM_AUTO_REFRESH);
  });

  it('clears alarm when no settings stored (defaults to 0)', async () => {
    await initAutoRefresh();

    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM_AUTO_REFRESH);
  });

  it('does not recreate alarm when period is unchanged', async () => {
    (chrome.alarms.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: ALARM_AUTO_REFRESH,
      periodInMinutes: 1,
      scheduledTime: Date.now(),
    });

    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTENSION_SETTINGS]: {
        autoRefreshInterval: 60,
        autoRefreshDefaultEnabled: false,
        isolationModeDefault: 'soft',
      },
    });

    await initAutoRefresh();

    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });

  it('registers storage change listener', async () => {
    await initAutoRefresh();
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
  });

  it('updates alarm when settings change via storage listener', async () => {
    await initAutoRefresh();

    // Access the registered listener directly
    const storageListeners = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls;
    const lastListener = storageListeners[storageListeners.length - 1][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    // Clear previous calls
    vi.clearAllMocks();

    lastListener(
      {
        [STORAGE_KEYS.EXTENSION_SETTINGS]: {
          newValue: {
            autoRefreshInterval: 120,
            autoRefreshDefaultEnabled: false,
            isolationModeDefault: 'soft',
          },
        },
      },
      'local',
    );

    // Wait for async syncAlarm to settle
    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM_AUTO_REFRESH, {
      periodInMinutes: 2,
    });
  });

  it('ignores storage changes from non-local area', async () => {
    await initAutoRefresh();

    const storageListeners = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls;
    const lastListener = storageListeners[storageListeners.length - 1][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    vi.clearAllMocks();

    lastListener(
      {
        [STORAGE_KEYS.EXTENSION_SETTINGS]: {
          newValue: { autoRefreshInterval: 300 },
        },
      },
      'sync', // Not 'local'
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.alarms.create).not.toHaveBeenCalled();
    expect(chrome.alarms.clear).not.toHaveBeenCalled();
  });
});
