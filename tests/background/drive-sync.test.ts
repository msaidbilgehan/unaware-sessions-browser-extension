import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import {
  getSyncState,
  triggerSync,
  handleDriveSyncAlarm,
  initDriveSync,
  resetDriveSyncInit,
} from '@background/drive-sync';
import { resetSyncStoreInit, initSyncStore, setSyncConfig, getSyncConfig } from '@shared/sync/sync-store';

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
  });
});
