import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import {
  getSyncState,
  triggerSync,
  handleDriveSyncAlarm,
  initDriveSync,
  resetDriveSyncInit,
} from '@background/drive-sync';
import {
  resetSyncStoreInit,
  initSyncStore,
  setSyncConfig,
  getSyncConfig,
} from '@shared/sync/sync-store';
import { DEFAULT_SYNC_CONFIG, STORAGE_KEYS } from '@shared/constants';

beforeEach(() => {
  resetChromeMocks();
  resetSyncStoreInit();
  resetDriveSyncInit();
});

describe('drive-sync', () => {
  describe('getSyncState', () => {
    it('defaults to idle', () => {
      const state = getSyncState();
      expect(state.status).toBe('idle');
      expect(state.conflicts).toEqual([]);
    });
  });

  describe('triggerSync', () => {
    it('returns error when no googleId configured', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, deviceId: 'dev-1', googleId: '' });

      const state = await triggerSync();
      expect(state.status).toBe('error');
      expect(state.progress).toContain('Google ID not available');
    });

    it('persists error to lastSyncError on failure', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, deviceId: 'dev-1', googleId: 'google-123' });

      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const state = await triggerSync();
      expect(state.status).toBe('error');
      expect(state.progress).toContain('Network error');

      const config = getSyncConfig();
      expect(config.lastSyncError).toContain('Network error');

      vi.unstubAllGlobals();
    });
  });

  describe('handleDriveSyncAlarm', () => {
    it('skips when sync is disabled', async () => {
      await initSyncStore();
      await setSyncConfig({ googleId: 'google-123' });
      await handleDriveSyncAlarm();
      expect(getSyncState().status).toBe('idle');
    });

    it('skips when no googleId', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, googleId: '' });
      await handleDriveSyncAlarm();
      expect(getSyncState().status).toBe('idle');
    });
  });

  describe('initDriveSync', () => {
    it('creates alarm when sync enabled with interval', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, syncInterval: 15 });
      await initDriveSync();

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('drive-sync', {
        periodInMinutes: 15,
      });
    });

    it('does not create alarm when interval is 0', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, syncInterval: 0 });
      await initDriveSync();

      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('drive-sync');
    });

    it('does not create alarm when sync disabled', async () => {
      await initSyncStore();
      await initDriveSync();

      expect(mockChrome.alarms.create).not.toHaveBeenCalledWith(
        'drive-sync',
        expect.any(Object),
      );
    });

    it('updates alarm when config changes to enabled with interval', async () => {
      await initSyncStore();
      await initDriveSync();

      // Config change: enable sync with 30m interval
      await setSyncConfig({ enabled: true, syncInterval: 30 });
      // Wait for the async listener to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(mockChrome.alarms.create).toHaveBeenCalledWith('drive-sync', {
        periodInMinutes: 30,
      });
    });

    it('clears alarm when config changes to disabled', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, syncInterval: 15 });
      await initDriveSync();

      mockChrome.alarms.clear.mockClear();
      await setSyncConfig({ enabled: false });
      await new Promise((r) => setTimeout(r, 10));

      expect(mockChrome.alarms.clear).toHaveBeenCalledWith('drive-sync');
    });
  });

  describe('handleDriveSyncAlarm with googleId', () => {
    it('triggers sync when enabled with googleId', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, googleId: 'google-123' });

      // triggerSync will fail (no fetch mock) — but alarm handler should attempt it
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('mock'));
      vi.stubGlobal('fetch', mockFetch);

      await handleDriveSyncAlarm();
      // Should have attempted sync (status changed from idle)
      expect(getSyncState().status).toBe('error');

      vi.unstubAllGlobals();
    });

    it('triggers sync on a cold worker where config is only in storage (finding 1)', async () => {
      // The normal case: the alarm wakes a dormant SW. Config lives in
      // storage but the store was never initialized in memory. Without lazy
      // hydration the handler would read the disabled default and no-op.
      mockChrome.storage.local._store.set(STORAGE_KEYS.SYNC_CONFIG, {
        ...DEFAULT_SYNC_CONFIG,
        enabled: true,
        googleId: 'google-123',
        deviceId: 'dev-1',
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error('mock'));
      vi.stubGlobal('fetch', mockFetch);

      await handleDriveSyncAlarm();
      // Sync was attempted (status left idle only if the handler skipped).
      expect(getSyncState().status).toBe('error');
      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('skips while a conflict resolution is pending (finding 5)', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, googleId: 'google-123' });

      // Force a conflict state to stand in for an open resolution dialog.
      // getSyncState() returns the module's live state object.
      getSyncState().status = 'conflict';

      const mockFetch = vi.fn().mockRejectedValue(new Error('should not be called'));
      vi.stubGlobal('fetch', mockFetch);

      await handleDriveSyncAlarm();
      expect(mockFetch).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe('sync cycle mutex (finding 5)', () => {
    it('coalesces concurrent triggerSync calls into one cycle', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, googleId: 'google-123', deviceId: 'dev-1' });

      // Hold the first fetch open so both triggers overlap in-flight.
      let releaseFetch: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      let fetchCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        await gate;
        throw new Error('stop after first network hit');
      });
      vi.stubGlobal('fetch', mockFetch);

      const p1 = triggerSync();
      const p2 = triggerSync();

      releaseFetch();
      const [s1, s2] = await Promise.all([p1, p2]);

      // Both callers observe the exact same coalesced cycle result object.
      expect(s1).toBe(s2);
      // One cycle issues two parallel lookups (manifest + payload). A second,
      // interleaved cycle would have issued two more (4 total) — coalescing
      // holds it to one cycle's worth.
      expect(fetchCount).toBe(2);

      vi.unstubAllGlobals();
    });
  });
});
