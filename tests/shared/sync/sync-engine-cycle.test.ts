import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetChromeMocks } from '../../setup';

// Mock the Drive REST layer — the seam between sync orchestration and the
// network. Keeps crypto, session-manager, and the IDB stores real so the
// cycle exercises actual encrypt/merge logic.
vi.mock('@shared/sync/drive-client', () => ({
  getToken: vi.fn(async () => 'test-token'),
  findFile: vi.fn(),
  createFile: vi.fn(),
  updateFile: vi.fn(),
  downloadFile: vi.fn(),
  getFileVersion: vi.fn(),
}));

import * as driveClient from '@shared/sync/drive-client';
import { executeSyncCycle, SyncConcurrencyError } from '@shared/sync/sync-engine';
import { resetSyncStoreInit, setSyncConfig } from '@shared/sync/sync-store';
import { hydrateSessions } from '@background/session-manager';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import type { RemoteDataCache } from '@shared/sync/sync-engine';
import type { SyncManifest } from '@shared/sync/sync-types';
import type { FullExportData } from '@shared/types';

const MANIFEST_FILENAME = 'unaware-sync-manifest.json';
const PAYLOAD_FILENAME = 'unaware-sync-payload.json';

const mockDrive = driveClient as unknown as {
  getToken: ReturnType<typeof vi.fn>;
  findFile: ReturnType<typeof vi.fn>;
  createFile: ReturnType<typeof vi.fn>;
  updateFile: ReturnType<typeof vi.fn>;
  downloadFile: ReturnType<typeof vi.fn>;
  getFileVersion: ReturnType<typeof vi.fn>;
};

/** A syntactically valid remote manifest whose single checksum differs from
 *  the empty local export, so the cycle never takes the no-changes fast path. */
function remoteManifestJson(): string {
  const manifest: SyncManifest = {
    version: 1,
    updatedAt: 1,
    deviceId: 'other-device',
    checksums: { 'sess-remote:https://remote.test': 'remote-hash' },
    sessionChecksums: {},
  };
  return JSON.stringify(manifest);
}

beforeEach(async () => {
  resetChromeMocks();
  resetSyncStoreInit();
  mockDrive.getToken.mockReset().mockResolvedValue('test-token');
  mockDrive.findFile.mockReset();
  mockDrive.createFile.mockReset().mockResolvedValue('new-id');
  mockDrive.updateFile.mockReset().mockResolvedValue(undefined);
  mockDrive.downloadFile.mockReset();
  mockDrive.getFileVersion.mockReset();

  // Empty, deterministic local data for every case.
  await hydrateSessions();
  await cookieStore.deleteAll();
  await storageStore.deleteAll();
});

describe('executeSyncCycle', () => {
  describe('first sync — upload ordering (finding 4)', () => {
    it('writes the payload before the manifest and stamps the payload checksum', async () => {
      mockDrive.findFile.mockResolvedValue(null); // no remote files yet

      await setSyncConfig({ enabled: true, googleId: 'g', deviceId: 'dev-1' });

      const state = await executeSyncCycle('passphrase');
      expect(state.status).toBe('idle');

      // Two creates, payload first (the manifest is the commit marker).
      expect(mockDrive.createFile).toHaveBeenCalledTimes(2);
      const firstFilename = mockDrive.createFile.mock.calls[0][1];
      const secondFilename = mockDrive.createFile.mock.calls[1][1];
      expect(firstFilename).toBe(PAYLOAD_FILENAME);
      expect(secondFilename).toBe(MANIFEST_FILENAME);

      // The committed manifest references the payload it was written after.
      const payloadContent = mockDrive.createFile.mock.calls[0][2] as string;
      const manifestContent = mockDrive.createFile.mock.calls[1][2] as string;
      const manifest = JSON.parse(manifestContent) as SyncManifest;
      expect(manifest.payloadChecksum).toBeTruthy();
      // Same length as a hex SHA-256 (64 chars) — a real checksum, not a stub.
      expect(manifest.payloadChecksum).toHaveLength(64);
      expect(payloadContent.length).toBeGreaterThan(0);
    });
  });

  describe('corrupt remote data recovery (finding 3)', () => {
    it('treats an unparseable manifest as absent and re-uploads local data', async () => {
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '1' },
      );
      mockDrive.downloadFile.mockResolvedValue('this is not json {{{');
      mockDrive.getFileVersion.mockResolvedValue('1'); // unchanged during write

      await setSyncConfig({ enabled: true, googleId: 'g', deviceId: 'dev-1' });

      const state = await executeSyncCycle('passphrase');

      // Recovered rather than throwing a parse error forever.
      expect(state.status).toBe('idle');
      // Existing files → update, payload before manifest.
      expect(mockDrive.updateFile).toHaveBeenCalledTimes(2);
      expect(mockDrive.updateFile.mock.calls[0][1]).toBe('payload-id');
      expect(mockDrive.updateFile.mock.calls[1][1]).toBe('manifest-id');
    });

    it('self-heals an unparseable payload instead of bricking sync', async () => {
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '1' },
      );
      mockDrive.downloadFile.mockImplementation(async (_t: string, id: string) =>
        id === 'manifest-id' ? remoteManifestJson() : 'corrupt-payload{{{',
      );
      mockDrive.getFileVersion.mockResolvedValue('1');

      // trust-cloud reaches the payload download/parse in step 7.
      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'trust-cloud',
      });

      const state = await executeSyncCycle('passphrase');

      expect(state.status).toBe('idle');
      // Recovery overwrote remote with local (update both files).
      expect(mockDrive.updateFile).toHaveBeenCalledTimes(2);
      expect(mockDrive.updateFile.mock.calls[0][1]).toBe('payload-id');
      expect(mockDrive.updateFile.mock.calls[1][1]).toBe('manifest-id');
    });
  });

  describe('cached remote reuse (finding 6)', () => {
    const cachedData: FullExportData = {
      version: 1,
      exportedAt: 1,
      sessions: [],
      cookieSnapshots: [],
      storageSnapshots: [],
      deletedSessions: {},
    };

    function makeCache(payloadVersion: string): RemoteDataCache {
      return {
        manifest: JSON.parse(remoteManifestJson()) as SyncManifest,
        data: cachedData,
        payloadVersion,
      };
    }

    it('reuses the cached payload when the remote version is unchanged', async () => {
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '5' },
      );
      // Only the manifest is fetched; the payload must come from the cache.
      mockDrive.downloadFile.mockResolvedValue(remoteManifestJson());
      mockDrive.getFileVersion.mockResolvedValue('1');

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'trust-cloud',
      });

      const state = await executeSyncCycle('passphrase', undefined, makeCache('5'));
      expect(state.status).toBe('idle');

      // Manifest downloaded once; payload NOT downloaded — served from cache.
      const downloadedIds = mockDrive.downloadFile.mock.calls.map((c) => c[1]);
      expect(downloadedIds).not.toContain('payload-id');
    });

    it('re-downloads when the cached version is stale (another device wrote)', async () => {
      // Actual remote payload is version '1'; the cache below is for '5'.
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '1' },
      );
      mockDrive.downloadFile.mockImplementation(async (_t: string, id: string) =>
        id === 'manifest-id' ? remoteManifestJson() : 'unreadable{{{',
      );
      mockDrive.getFileVersion.mockResolvedValue('1');

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'trust-cloud',
      });

      // Cache is for version '5' but remote is now '9' → must re-fetch, hit the
      // unreadable payload, and self-heal rather than apply stale cached data.
      const state = await executeSyncCycle('passphrase', undefined, makeCache('5'));
      expect(state.status).toBe('idle');
      const downloadedIds = mockDrive.downloadFile.mock.calls.map((c) => c[1]);
      expect(downloadedIds).toContain('payload-id');
    });
  });

  describe('optimistic concurrency (finding 8)', () => {
    it('aborts with SyncConcurrencyError when a file changes mid-cycle', async () => {
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '1' },
      );
      mockDrive.downloadFile.mockResolvedValue(remoteManifestJson());
      // Another device bumped the payload version between read and write.
      mockDrive.getFileVersion.mockResolvedValue('2');

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'trust-local',
      });

      await expect(executeSyncCycle('passphrase')).rejects.toBeInstanceOf(SyncConcurrencyError);
      // Aborted before clobbering the changed remote file.
      expect(mockDrive.updateFile).not.toHaveBeenCalled();
    });
  });
});
