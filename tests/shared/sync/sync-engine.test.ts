import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../../setup';
import { buildLocalManifest, detectConflicts, mergeData } from '@shared/sync/sync-engine';
import type { FullExportData } from '@shared/types';
import type { SyncManifest, ConflictEntry } from '@shared/sync/sync-types';

beforeEach(() => {
  resetChromeMocks();
});

function makeExportData(overrides?: Partial<FullExportData>): FullExportData {
  return {
    version: 1,
    exportedAt: Date.now(),
    sessions: [
      {
        id: 'sess-1',
        name: 'Work',
        color: '#3B82F6',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        settings: {},
      },
    ],
    cookieSnapshots: [
      {
        sessionId: 'sess-1',
        origin: 'https://example.com',
        timestamp: 1700000000000,
        cookies: [
          {
            name: 'auth',
            value: 'token123',
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
      },
    ],
    storageSnapshots: [
      {
        sessionId: 'sess-1',
        origin: 'https://example.com',
        timestamp: 1700000000000,
        localStorage: { key1: 'val1' },
        sessionStorage: {},
      },
    ],
    ...overrides,
  };
}

describe('sync-engine', () => {
  describe('buildLocalManifest', () => {
    it('produces checksums for each session:origin pair', async () => {
      const data = makeExportData();
      const manifest = await buildLocalManifest(data, 'device-1');

      expect(manifest.version).toBe(1);
      expect(manifest.deviceId).toBe('device-1');
      expect(manifest.checksums['sess-1:https://example.com']).toBeTruthy();
      expect(manifest.sessionChecksums['sess-1']).toBeTruthy();
    });

    it('produces empty checksums for empty data', async () => {
      const data: FullExportData = {
        version: 1,
        exportedAt: Date.now(),
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
      };
      const manifest = await buildLocalManifest(data, 'device-1');

      expect(Object.keys(manifest.checksums)).toHaveLength(0);
      expect(Object.keys(manifest.sessionChecksums)).toHaveLength(0);
    });

    it('different data produces different checksums', async () => {
      const data1 = makeExportData();
      const data2 = makeExportData({
        cookieSnapshots: [
          {
            sessionId: 'sess-1',
            origin: 'https://example.com',
            timestamp: 1700000000000,
            cookies: [
              {
                name: 'auth',
                value: 'different-token',
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
          },
        ],
      });

      const manifest1 = await buildLocalManifest(data1, 'device-1');
      const manifest2 = await buildLocalManifest(data2, 'device-1');

      expect(manifest1.checksums['sess-1:https://example.com']).not.toBe(
        manifest2.checksums['sess-1:https://example.com'],
      );
    });
  });

  describe('detectConflicts', () => {
    it('returns empty for identical manifests', () => {
      const manifest: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-1',
        checksums: { 'sess-1:https://example.com': 'abc123' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const data = makeExportData();

      const conflicts = detectConflicts(manifest, { ...manifest }, data, data);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts for local-only keys', () => {
      const local: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-1',
        checksums: { 'sess-1:https://example.com': 'abc123', 'sess-1:https://other.com': 'xyz' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const remote: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-2',
        checksums: { 'sess-1:https://example.com': 'abc123' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const data = makeExportData();

      const conflicts = detectConflicts(local, remote, data, data);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts for remote-only keys', () => {
      const local: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-1',
        checksums: { 'sess-1:https://example.com': 'abc123' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const remote: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-2',
        checksums: { 'sess-1:https://example.com': 'abc123', 'sess-1:https://extra.com': 'xyz' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const data = makeExportData();

      const conflicts = detectConflicts(local, remote, data, data);
      expect(conflicts).toHaveLength(0);
    });

    it('detects conflict when checksums differ for same key', () => {
      const local: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-1',
        checksums: { 'sess-1:https://example.com': 'local-hash' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const remote: SyncManifest = {
        version: 1,
        updatedAt: Date.now(),
        deviceId: 'device-2',
        checksums: { 'sess-1:https://example.com': 'remote-hash' },
        sessionChecksums: { 'sess-1': 'def456' },
      };
      const data = makeExportData();

      const conflicts = detectConflicts(local, remote, data, data);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].sessionId).toBe('sess-1');
      expect(conflicts[0].origin).toBe('https://example.com');
      expect(conflicts[0].resolution).toBeNull();
    });
  });

  describe('mergeData', () => {
    const localData = makeExportData();
    const remoteData = makeExportData({
      sessions: [
        {
          id: 'sess-2',
          name: 'Personal',
          color: '#EF4444',
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          settings: {},
        },
      ],
      cookieSnapshots: [
        {
          sessionId: 'sess-2',
          origin: 'https://remote.com',
          timestamp: 1700000000000,
          cookies: [],
        },
      ],
      storageSnapshots: [],
    });

    it('trust-cloud returns remote data', () => {
      const merged = mergeData(localData, remoteData, 'trust-cloud');
      expect(merged.sessions).toEqual(remoteData.sessions);
      expect(merged.cookieSnapshots).toEqual(remoteData.cookieSnapshots);
    });

    it('trust-local returns local data', () => {
      const merged = mergeData(localData, remoteData, 'trust-local');
      expect(merged.sessions).toEqual(localData.sessions);
      expect(merged.cookieSnapshots).toEqual(localData.cookieSnapshots);
    });

    it('ask with no conflicts merges union', () => {
      const merged = mergeData(localData, remoteData, 'ask', []);

      // Should have both sessions
      expect(merged.sessions).toHaveLength(2);
      // Should have cookies from both sides
      expect(merged.cookieSnapshots).toHaveLength(2);
    });

    it('ask with resolutions applies choices', () => {
      const conflict: ConflictEntry = {
        sessionId: 'sess-1',
        sessionName: 'Work',
        origin: 'https://example.com',
        localTimestamp: 1700000000000,
        cloudTimestamp: 1700000001000,
        resolution: 'cloud',
      };

      const remoteWithConflict = makeExportData({
        cookieSnapshots: [
          {
            sessionId: 'sess-1',
            origin: 'https://example.com',
            timestamp: 1700000001000,
            cookies: [
              {
                name: 'auth',
                value: 'remote-value',
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
          },
        ],
      });

      const merged = mergeData(localData, remoteWithConflict, 'ask', [conflict]);

      const exampleCookies = merged.cookieSnapshots.find(
        (s) => s.origin === 'https://example.com',
      );
      expect(exampleCookies?.cookies[0].value).toBe('remote-value');
    });

    it('ask with local resolution keeps local data', () => {
      const conflict: ConflictEntry = {
        sessionId: 'sess-1',
        sessionName: 'Work',
        origin: 'https://example.com',
        localTimestamp: 1700000001000,
        cloudTimestamp: 1700000000000,
        resolution: 'local',
      };

      const remoteWithConflict = makeExportData({
        cookieSnapshots: [
          {
            sessionId: 'sess-1',
            origin: 'https://example.com',
            timestamp: 1700000000000,
            cookies: [
              {
                name: 'auth',
                value: 'remote-value',
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
          },
        ],
      });

      const merged = mergeData(localData, remoteWithConflict, 'ask', [conflict]);

      const exampleCookies = merged.cookieSnapshots.find(
        (s) => s.origin === 'https://example.com',
      );
      expect(exampleCookies?.cookies[0].value).toBe('token123');
    });

    it('ask merges storage snapshots alongside cookies', () => {
      const localWithStorage = makeExportData();
      const remoteWithStorage = makeExportData({
        sessions: [
          {
            id: 'sess-2',
            name: 'Remote',
            color: '#EF4444',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
            settings: {},
          },
        ],
        cookieSnapshots: [],
        storageSnapshots: [
          {
            sessionId: 'sess-2',
            origin: 'https://remote.com',
            timestamp: 1700000000000,
            localStorage: { remoteKey: 'remoteVal' },
            sessionStorage: {},
          },
        ],
      });

      const merged = mergeData(localWithStorage, remoteWithStorage, 'ask', []);
      expect(merged.storageSnapshots).toHaveLength(2);
      expect(merged.storageSnapshots.find((s) => s.origin === 'https://remote.com')).toBeTruthy();
    });

    it('ask merges session profiles as union by ID', () => {
      const local = makeExportData();
      const remote = makeExportData({
        sessions: [
          { id: 'sess-1', name: 'WorkRenamed', color: '#000', createdAt: 0, updatedAt: 0, settings: {} },
          { id: 'sess-3', name: 'New', color: '#F00', createdAt: 0, updatedAt: 0, settings: {} },
        ],
        cookieSnapshots: [],
        storageSnapshots: [],
      });

      const merged = mergeData(local, remote, 'ask', []);
      // sess-1 exists in both — local wins; sess-3 is remote-only — added
      expect(merged.sessions.find((s) => s.id === 'sess-1')?.name).toBe('Work');
      expect(merged.sessions.find((s) => s.id === 'sess-3')?.name).toBe('New');
    });
  });
});
