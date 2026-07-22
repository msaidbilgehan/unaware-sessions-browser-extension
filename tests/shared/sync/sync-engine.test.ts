import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../../setup';
import {
  buildLocalManifest,
  detectConflicts,
  autoResolveOneSidedChanges,
  mergeData,
} from '@shared/sync/sync-engine';
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

function makeManifest(
  checksums: Record<string, string>,
  sessionChecksums: Record<string, string> = { 'sess-1': 'sess-hash' },
): SyncManifest {
  return {
    version: 1,
    updatedAt: 1700000000000,
    deviceId: 'device-1',
    checksums,
    sessionChecksums,
  };
}

const KEY = 'sess-1:https://example.com';

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

      const conflicts = detectConflicts(manifest, { ...manifest }, data, data, {});
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

      const conflicts = detectConflicts(local, remote, data, data, {});
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

      const conflicts = detectConflicts(local, remote, data, data, {});
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

      const conflicts = detectConflicts(local, remote, data, data, {});
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].sessionId).toBe('sess-1');
      expect(conflicts[0].origin).toBe('https://example.com');
      expect(conflicts[0].resolution).toBeNull();
    });

    // ── Three-way baseline comparison ──────────────────────────────
    // The core fix: a checksum mismatch is only a real conflict when BOTH
    // sides diverged from the last successfully synced baseline. One-sided
    // drift (ordinary browsing between syncs) must not be flagged.

    it('does not flag a one-sided local change (remote still matches baseline)', () => {
      const data = makeExportData();
      const local = makeManifest({ [KEY]: 'local-changed' });
      const remote = makeManifest({ [KEY]: 'base' });
      const conflicts = detectConflicts(local, remote, data, data, { [KEY]: 'base' });
      expect(conflicts).toHaveLength(0);
    });

    it('does not flag a one-sided remote change (local still matches baseline)', () => {
      const data = makeExportData();
      const local = makeManifest({ [KEY]: 'base' });
      const remote = makeManifest({ [KEY]: 'remote-changed' });
      const conflicts = detectConflicts(local, remote, data, data, { [KEY]: 'base' });
      expect(conflicts).toHaveLength(0);
    });

    it('flags a genuine two-sided conflict (both diverged from baseline)', () => {
      const data = makeExportData();
      const local = makeManifest({ [KEY]: 'local-changed' });
      const remote = makeManifest({ [KEY]: 'remote-changed' });
      const conflicts = detectConflicts(local, remote, data, data, { [KEY]: 'base' });
      expect(conflicts).toHaveLength(1);
    });

    it('falls back to flagging a conflict when no baseline exists for the key', () => {
      const data = makeExportData();
      const local = makeManifest({ [KEY]: 'local-changed' });
      const remote = makeManifest({ [KEY]: 'remote-changed' });
      // Pre-upgrade install: nothing recorded — safe default is to ask.
      const conflicts = detectConflicts(local, remote, data, data, {});
      expect(conflicts).toHaveLength(1);
    });
  });

  describe('autoResolveOneSidedChanges', () => {
    it('returns no resolutions when local and remote agree', () => {
      const m = makeManifest({ [KEY]: 'same' });
      expect(autoResolveOneSidedChanges(m, m, {})).toHaveLength(0);
    });

    it('resolves a one-sided local change to local', () => {
      const local = makeManifest({ [KEY]: 'local-new' });
      const remote = makeManifest({ [KEY]: 'base' });
      const res = autoResolveOneSidedChanges(local, remote, { [KEY]: 'base' });
      expect(res).toHaveLength(1);
      expect(res[0].resolution).toBe('local');
      expect(res[0].sessionId).toBe('sess-1');
      expect(res[0].origin).toBe('https://example.com');
    });

    it('resolves a one-sided remote change to cloud', () => {
      const local = makeManifest({ [KEY]: 'base' });
      const remote = makeManifest({ [KEY]: 'remote-new' });
      const res = autoResolveOneSidedChanges(local, remote, { [KEY]: 'base' });
      expect(res).toHaveLength(1);
      expect(res[0].resolution).toBe('cloud');
    });

    it('does not auto-resolve a genuine two-sided conflict', () => {
      const local = makeManifest({ [KEY]: 'local-new' });
      const remote = makeManifest({ [KEY]: 'remote-new' });
      expect(autoResolveOneSidedChanges(local, remote, { [KEY]: 'base' })).toHaveLength(0);
    });

    it('does not auto-resolve when no baseline exists (left to the conflict path)', () => {
      const local = makeManifest({ [KEY]: 'local-new' });
      const remote = makeManifest({ [KEY]: 'remote-new' });
      expect(autoResolveOneSidedChanges(local, remote, {})).toHaveLength(0);
    });

    it('adopts a one-sided remote change through mergeData (no silent local-wins)', () => {
      // Regression guard for the companion fix: once a remote-only change is
      // no longer (mis)flagged as a conflict, mergeData must still adopt it
      // instead of falling through to its "both present, no resolution" =
      // keep-local default, which would silently discard the remote update.
      const localManifest = makeManifest({ [KEY]: 'base' });
      const remoteManifest = makeManifest({ [KEY]: 'remote-new' });

      const localData = makeExportData(); // cookie value 'token123'
      const remoteData = makeExportData({
        cookieSnapshots: [
          {
            sessionId: 'sess-1',
            origin: 'https://example.com',
            timestamp: 1700000002000,
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

      const autoRes = autoResolveOneSidedChanges(localManifest, remoteManifest, { [KEY]: 'base' });
      const merged = mergeData(localData, remoteData, 'ask', autoRes);
      const snap = merged.cookieSnapshots.find((s) => s.origin === 'https://example.com');
      expect(snap?.cookies[0].value).toBe('remote-value');
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

    it('ask prefers the profile with the newer updatedAt', () => {
      const local = makeExportData();
      const remote = makeExportData({
        sessions: [
          {
            id: 'sess-1',
            name: 'Renamed on other device',
            color: '#000',
            createdAt: 1700000000000,
            updatedAt: 1700000005000, // newer than local's 1700000000000
            settings: {},
          },
        ],
        cookieSnapshots: [],
        storageSnapshots: [],
      });

      const merged = mergeData(local, remote, 'ask', []);
      expect(merged.sessions.find((s) => s.id === 'sess-1')?.name).toBe(
        'Renamed on other device',
      );
    });
  });

  describe('mergeData deletion tombstones', () => {
    it('does not resurrect a session deleted locally', () => {
      const deletedAt = Date.now();
      const local = makeExportData({
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
        deletedSessions: { 'sess-1': deletedAt },
      });
      const remote = makeExportData(); // remote still has sess-1 + its snapshots

      const merged = mergeData(local, remote, 'ask', []);

      expect(merged.sessions.find((s) => s.id === 'sess-1')).toBeUndefined();
      expect(merged.cookieSnapshots.filter((s) => s.sessionId === 'sess-1')).toHaveLength(0);
      expect(merged.storageSnapshots.filter((s) => s.sessionId === 'sess-1')).toHaveLength(0);
      expect(merged.deletedSessions?.['sess-1']).toBe(deletedAt);
    });

    it('does not resurrect a session deleted remotely', () => {
      const deletedAt = Date.now();
      const local = makeExportData();
      const remote = makeExportData({
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
        deletedSessions: { 'sess-1': deletedAt },
      });

      const merged = mergeData(local, remote, 'ask', []);
      expect(merged.sessions.find((s) => s.id === 'sess-1')).toBeUndefined();
    });

    it('keeps a session that was updated after its deletion (edit wins) and drops the tombstone', () => {
      const deletedAt = Date.now() - 60_000;
      const local = makeExportData({
        sessions: [
          {
            id: 'sess-1',
            name: 'Recreated',
            color: '#3B82F6',
            createdAt: 1700000000000,
            updatedAt: deletedAt + 30_000, // edited after the deletion happened
            settings: {},
          },
        ],
      });
      const remote = makeExportData({
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
        deletedSessions: { 'sess-1': deletedAt },
      });

      const merged = mergeData(local, remote, 'ask', []);
      expect(merged.sessions.find((s) => s.id === 'sess-1')?.name).toBe('Recreated');
      expect(merged.deletedSessions?.['sess-1']).toBeUndefined();
    });

    it('unions tombstones from both sides with the latest deletion winning', () => {
      const older = Date.now() - 10_000;
      const newer = Date.now();
      const local = makeExportData({
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
        deletedSessions: { 'sess-1': older, 'sess-9': newer },
      });
      const remote = makeExportData({
        sessions: [],
        cookieSnapshots: [],
        storageSnapshots: [],
        deletedSessions: { 'sess-1': newer },
      });

      const merged = mergeData(local, remote, 'ask', []);
      expect(merged.deletedSessions?.['sess-1']).toBe(newer);
      expect(merged.deletedSessions?.['sess-9']).toBe(newer);
    });

    it('handles payloads without deletedSessions (backward compatibility)', () => {
      const local = makeExportData();
      const remote = makeExportData();
      delete local.deletedSessions;
      delete remote.deletedSessions;

      const merged = mergeData(local, remote, 'ask', []);
      expect(merged.sessions.find((s) => s.id === 'sess-1')).toBeTruthy();
      expect(merged.deletedSessions).toEqual({});
    });
  });
});
