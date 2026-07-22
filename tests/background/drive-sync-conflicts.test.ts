import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';

// Mock the engine so triggerSync reaches a deterministic result
// (conflict / idle / error) without standing up the whole Drive REST flow.
// The point under test is that drive-sync mirrors that result into the
// persisted config so the badge/popup/options UI survive a SW restart.
vi.mock('@shared/sync/sync-engine', () => ({
  executeSyncCycle: vi.fn(),
  SyncConcurrencyError: class SyncConcurrencyError extends Error {},
}));

import * as syncEngine from '@shared/sync/sync-engine';
import { triggerSync, resetDriveSyncInit } from '@background/drive-sync';
import {
  resetSyncStoreInit,
  initSyncStore,
  setSyncConfig,
  getSyncConfig,
} from '@shared/sync/sync-store';
import type { ConflictEntry } from '@shared/sync/sync-types';

const mockEngine = syncEngine as unknown as { executeSyncCycle: ReturnType<typeof vi.fn> };

const conflict: ConflictEntry = {
  sessionId: 'sess-1',
  sessionName: 'Work',
  origin: 'https://example.com',
  localTimestamp: 2,
  cloudTimestamp: 3,
  resolution: null,
};

beforeEach(() => {
  resetChromeMocks();
  resetSyncStoreInit();
  resetDriveSyncInit();
  mockEngine.executeSyncCycle.mockReset();
});

describe('drive-sync pendingConflicts persistence', () => {
  it('persists the conflict set when a cycle returns conflict', async () => {
    await initSyncStore();
    await setSyncConfig({ enabled: true, googleId: 'g', deviceId: 'dev-1' });

    mockEngine.executeSyncCycle.mockResolvedValue({
      status: 'conflict',
      progress: '',
      conflicts: [conflict],
      remoteCache: { manifest: {}, data: {}, payloadVersion: '1' },
    });

    const state = await triggerSync();

    expect(state.status).toBe('conflict');
    expect(getSyncConfig().pendingConflicts).toHaveLength(1);
    expect(getSyncConfig().pendingConflicts[0].origin).toBe('https://example.com');
  });

  it('clears the persisted conflict set when a later cycle resolves to idle', async () => {
    await initSyncStore();
    await setSyncConfig({
      enabled: true,
      googleId: 'g',
      deviceId: 'dev-1',
      pendingConflicts: [conflict],
    });

    mockEngine.executeSyncCycle.mockResolvedValue({
      status: 'idle',
      progress: '',
      conflicts: [],
    });

    const state = await triggerSync();

    expect(state.status).toBe('idle');
    expect(getSyncConfig().pendingConflicts).toHaveLength(0);
  });

  it('leaves the persisted conflict set intact on a transient error', async () => {
    await initSyncStore();
    await setSyncConfig({
      enabled: true,
      googleId: 'g',
      deviceId: 'dev-1',
      pendingConflicts: [conflict],
    });

    mockEngine.executeSyncCycle.mockRejectedValue(new Error('network down'));

    const state = await triggerSync();

    expect(state.status).toBe('error');
    // A transient failure must not erase a real pending conflict.
    expect(getSyncConfig().pendingConflicts).toHaveLength(1);
  });
});
