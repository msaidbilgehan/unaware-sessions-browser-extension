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
import {
  executeSyncCycle,
  SyncConcurrencyError,
  buildLocalManifest,
} from '@shared/sync/sync-engine';
import { encrypt } from '@shared/sync/crypto-engine';
import { resetSyncStoreInit, setSyncConfig, getSyncConfig } from '@shared/sync/sync-store';
import { hydrateSessions, createSession } from '@background/session-manager';
import { cookieStore } from '@background/cookie-store';
import { storageStore } from '@background/storage-store';
import type { RemoteDataCache } from '@shared/sync/sync-engine';
import type { SyncManifest } from '@shared/sync/sync-types';
import type { FullExportData, CookieSnapshot } from '@shared/types';

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

  // The auto-sync false-conflict fix: ordinary one-sided drift between two
  // syncs must fast-forward instead of parking in 'conflict' (which silently
  // halts auto-sync until a human resolves a non-conflict).
  describe('three-way baseline conflict detection', () => {
    const KEY = 'sess-1:https://example.com';

    function cookieSnap(value: string, ts: number): CookieSnapshot {
      return {
        sessionId: 'sess-1',
        origin: 'https://example.com',
        timestamp: ts,
        cookies: [
          {
            name: 'auth',
            value,
            domain: 'example.com',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax' as chrome.cookies.SameSiteStatus,
            storeId: '0',
            hostOnly: false,
            session: false,
          },
        ],
      };
    }

    function mockRemote(manifest: SyncManifest, payload: string): void {
      mockDrive.findFile.mockImplementation(async (_t: string, name: string) =>
        name === MANIFEST_FILENAME
          ? { id: 'manifest-id', version: '1' }
          : { id: 'payload-id', version: '1' },
      );
      mockDrive.downloadFile.mockImplementation(async (_t: string, id: string) =>
        id === 'manifest-id' ? JSON.stringify(manifest) : payload,
      );
      mockDrive.getFileVersion.mockResolvedValue('1');
    }

    it('fast-forwards (idle, uploads) when only local changed since last sync', async () => {
      const session = await createSession('Work', '#3B82F6', undefined, 'sess-1');

      // Base = the state at the last successful sync; remote still holds it.
      const baseData: FullExportData = {
        version: 1,
        exportedAt: 0,
        sessions: [session],
        cookieSnapshots: [cookieSnap('base-value', 1)],
        storageSnapshots: [],
        deletedSessions: {},
      };
      const baseManifest = await buildLocalManifest(baseData, 'other-device');

      // Local moved on; remote unchanged (equals the baseline).
      await cookieStore.save(cookieSnap('local-value-v2', 2));
      mockRemote(baseManifest, JSON.stringify(await encrypt(baseData, 'passphrase')));

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'ask',
        lastSyncedChecksums: baseManifest.checksums,
      });

      const state = await executeSyncCycle('passphrase');

      // The fix: not a conflict — it synced.
      expect(state.status).toBe('idle');
      expect(mockDrive.updateFile).toHaveBeenCalledTimes(2);
    });

    it('fast-forwards (idle) when only remote changed since last sync', async () => {
      const session = await createSession('Work', '#3B82F6', undefined, 'sess-1');

      const baseData: FullExportData = {
        version: 1,
        exportedAt: 0,
        sessions: [session],
        cookieSnapshots: [cookieSnap('base-value', 1)],
        storageSnapshots: [],
        deletedSessions: {},
      };
      const baseManifest = await buildLocalManifest(baseData, 'other-device');

      // Local unchanged (equals baseline); remote moved on to a new value.
      await cookieStore.save(cookieSnap('base-value', 1));
      const remoteData: FullExportData = {
        version: 1,
        exportedAt: 0,
        sessions: [session],
        cookieSnapshots: [cookieSnap('remote-value-v2', 3)],
        storageSnapshots: [],
        deletedSessions: {},
      };
      const remoteManifest = await buildLocalManifest(remoteData, 'other-device');
      mockRemote(remoteManifest, JSON.stringify(await encrypt(remoteData, 'passphrase')));

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'ask',
        lastSyncedChecksums: baseManifest.checksums,
      });

      const state = await executeSyncCycle('passphrase');

      // Not a conflict, and the remote update is adopted locally.
      expect(state.status).toBe('idle');
      const snaps = await cookieStore.getAllSnapshotsForSession('sess-1');
      const restored = snaps.find((s) => s.origin === 'https://example.com');
      expect(restored?.cookies[0].value).toBe('remote-value-v2');
    });

    it('parks in conflict when BOTH sides changed since last sync', async () => {
      const session = await createSession('Work', '#3B82F6', undefined, 'sess-1');

      const baseData: FullExportData = {
        version: 1,
        exportedAt: 0,
        sessions: [session],
        cookieSnapshots: [cookieSnap('base-value', 1)],
        storageSnapshots: [],
        deletedSessions: {},
      };
      const baseManifest = await buildLocalManifest(baseData, 'other-device');

      // Local → v2, remote → a different v3. Genuine concurrent edit.
      await cookieStore.save(cookieSnap('local-value-v2', 2));
      const remoteData: FullExportData = {
        version: 1,
        exportedAt: 0,
        sessions: [session],
        cookieSnapshots: [cookieSnap('remote-value-v3', 3)],
        storageSnapshots: [],
        deletedSessions: {},
      };
      const remoteManifest = await buildLocalManifest(remoteData, 'other-device');
      mockRemote(remoteManifest, JSON.stringify(await encrypt(remoteData, 'passphrase')));

      await setSyncConfig({
        enabled: true,
        googleId: 'g',
        deviceId: 'dev-1',
        mergeStrategy: 'ask',
        lastSyncedChecksums: baseManifest.checksums,
      });

      const state = await executeSyncCycle('passphrase');

      expect(state.status).toBe('conflict');
      expect(state.conflicts).toHaveLength(1);
      expect(state.conflicts[0].origin).toBe('https://example.com');
      // Parked without overwriting remote.
      expect(mockDrive.updateFile).not.toHaveBeenCalled();
    });

    it('records lastSyncedChecksums after a first sync so later syncs have a baseline', async () => {
      await createSession('Work', '#3B82F6', undefined, 'sess-1');
      await cookieStore.save(cookieSnap('v1', 1));
      mockDrive.findFile.mockResolvedValue(null); // first sync — no remote yet

      await setSyncConfig({ enabled: true, googleId: 'g', deviceId: 'dev-1', mergeStrategy: 'ask' });

      const state = await executeSyncCycle('passphrase');
      expect(state.status).toBe('idle');
      expect(getSyncConfig().lastSyncedChecksums[KEY]).toBeTruthy();
    });
  });
});
