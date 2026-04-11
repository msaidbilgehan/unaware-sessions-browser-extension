import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../../setup';
import {
  getSyncConfig,
  isSyncEnabled,
  setSyncConfig,
  onSyncConfigChange,
  initSyncStore,
  resetSyncStoreInit,
} from '@shared/sync/sync-store';
import { DEFAULT_SYNC_CONFIG, STORAGE_KEYS } from '@shared/constants';

beforeEach(() => {
  resetChromeMocks();
  resetSyncStoreInit();
});

describe('sync-store', () => {
  describe('initSyncStore', () => {
    it('initializes with defaults when nothing in storage', async () => {
      await initSyncStore();
      expect(getSyncConfig()).toEqual(DEFAULT_SYNC_CONFIG);
    });

    it('loads persisted config from storage', async () => {
      const stored = { ...DEFAULT_SYNC_CONFIG, enabled: true, deviceId: 'test-device' };
      mockChrome.storage.local._store.set(STORAGE_KEYS.SYNC_CONFIG, stored);

      await initSyncStore();
      expect(getSyncConfig().enabled).toBe(true);
      expect(getSyncConfig().deviceId).toBe('test-device');
    });
  });

  describe('setSyncConfig', () => {
    it('updates in-memory config and persists', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true, deviceId: 'new-id' });

      expect(getSyncConfig().enabled).toBe(true);
      expect(getSyncConfig().deviceId).toBe('new-id');
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ [STORAGE_KEYS.SYNC_CONFIG]: expect.any(Object) }),
      );
    });

    it('merges partial updates', async () => {
      await initSyncStore();
      await setSyncConfig({ mergeStrategy: 'trust-cloud' });

      expect(getSyncConfig().mergeStrategy).toBe('trust-cloud');
      expect(getSyncConfig().syncInterval).toBe(0); // unchanged default
    });
  });

  describe('isSyncEnabled', () => {
    it('returns false by default', async () => {
      await initSyncStore();
      expect(isSyncEnabled()).toBe(false);
    });

    it('returns true after enabling', async () => {
      await initSyncStore();
      await setSyncConfig({ enabled: true });
      expect(isSyncEnabled()).toBe(true);
    });
  });

  describe('listeners', () => {
    it('fires listener on change', async () => {
      await initSyncStore();
      let received = false;
      const unsub = onSyncConfigChange(() => {
        received = true;
      });

      await setSyncConfig({ syncInterval: 15 });
      expect(received).toBe(true);
      unsub();
    });

    it('unsubscribes correctly', async () => {
      await initSyncStore();
      let callCount = 0;
      const unsub = onSyncConfigChange(() => {
        callCount++;
      });

      await setSyncConfig({ syncInterval: 5 });
      expect(callCount).toBe(1);

      unsub();
      await setSyncConfig({ syncInterval: 15 });
      expect(callCount).toBe(1);
    });
  });

  describe('storage.onChanged listener', () => {
    it('updates in-memory config on external storage change', async () => {
      await initSyncStore();
      const newConfig = { ...DEFAULT_SYNC_CONFIG, enabled: true, lastSyncAt: 12345 };

      // Simulate external storage change
      const onChanged = mockChrome.storage.onChanged as unknown as { _fire: (...args: unknown[]) => void };
      onChanged._fire(
        { [STORAGE_KEYS.SYNC_CONFIG]: { newValue: newConfig } },
        'local',
      );

      expect(getSyncConfig().enabled).toBe(true);
      expect(getSyncConfig().lastSyncAt).toBe(12345);
    });
  });
});
