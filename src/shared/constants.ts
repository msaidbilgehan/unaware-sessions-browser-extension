import type { ExtensionSettings, SecurityConfig, GracePeriodMs } from '@shared/types';
import type { SyncConfig, SyncInterval } from '@shared/sync/sync-types';

export const ALARM_PERSIST_STATE = 'persist-state';
export const ALARM_INTERVAL_MINUTES = 1;

export const ALARM_AUTO_REFRESH = 'auto-refresh-sessions';

export const STORAGE_KEYS = {
  SESSIONS: 'sessions',
  TAB_MAP: 'tabMap',
  SESSION_ORDER: 'sessionOrder',
  THEME_PREFERENCE: 'themePreference',
  EXTENSION_SETTINGS: 'extensionSettings',
  AUTO_REFRESH_DOMAINS: 'autoRefreshDomains',
  DOMAIN_ISOLATION_MODES: 'domainIsolationModes',
  SECURITY_CONFIG: 'securityConfig',
  SECURITY_GRACE_UNTIL: 'securityGraceUntil',
  SYNC_CONFIG: 'syncConfig',
  SESSION_TOMBSTONES: 'sessionTombstones',
  LOG_BUFFER: 'logBuffer',
  STORAGE_WRITE_ERRORS: 'storageWriteErrors',
  /**
   * Sessions the popup has hidden behind an "Undo" toast but not yet deleted.
   * Journalled to chrome.storage.session so closing the popup mid-countdown
   * cannot strand a session in a half-deleted state — the next popup finishes
   * the job. DELETE_SESSION is idempotent, so replaying an entry is harmless.
   */
  PENDING_SESSION_DELETES: 'pendingSessionDeletes',
} as const;

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  autoRefreshInterval: 300,
  autoRefreshDefaultEnabled: true,
  isolationModeDefault: 'soft',
  logLevel: 'off',
};

/** Deletion tombstones older than this are pruned from storage and sync payloads. */
export const SESSION_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  passcodeEnabled: false,
  passcodeHash: '',
  passcodeSalt: '',
  biometricEnabled: false,
  biometricCredentialId: '',
  gracePeriodMs: 300000,
};

export const GRACE_PERIOD_OPTIONS: { value: GracePeriodMs; label: string }[] = [
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
  { value: 300000, label: '5 min' },
  { value: 600000, label: '10 min' },
  { value: 1800000, label: '30 min' },
];

export const LOG_BUFFER_MAX_SIZE = 2000;

// The in-memory log buffer dies with the MV3 service worker (~30 s idle), so
// an incident is unreadable minutes after it happened. A bounded tail is
// mirrored to chrome.storage.local and re-hydrated on every SW start; keep it
// small enough that it can never crowd out session data in the 10 MB local
// storage area.
export const LOG_PERSIST_MAX_SIZE = 500;
export const LOG_PERSIST_DEBOUNCE_MS = 2000;

/** Retained snapshot-write failures (quota, aborted transaction, …). */
export const STORAGE_WRITE_ERROR_MAX_SIZE = 50;

export const ALARM_DRIVE_SYNC = 'drive-sync';

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  mergeStrategy: 'ask',
  syncInterval: 0,
  lastSyncAt: 0,
  lastSyncError: '',
  deviceId: '',
  googleId: '',
  lastSyncedChecksums: {},
  pendingConflicts: [],
};

export const SYNC_INTERVAL_OPTIONS: { value: SyncInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
];

export const DNR_RULE_ID_BASE = 1000;
export const DNR_RULE_LIMIT = 5000;
export const DNR_RULE_WARN_THRESHOLD = 4000;

export const DEFAULT_SESSION_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
] as const;

export const COOKIE_STORE_DB_NAME = 'unaware-sessions-cookies';
export const COOKIE_STORE_NAME = 'snapshots';
export const COOKIE_STORE_DB_VERSION = 1;

export const STORAGE_STORE_DB_NAME = 'unaware-sessions-storage';
export const STORAGE_STORE_NAME = 'snapshots';
export const STORAGE_STORE_DB_VERSION = 1;

// One-slot undo buffer for snapshots that went empty. Deliberately a separate
// database, not extra object stores in the two above: it needs no version bump
// on the databases holding the irreplaceable data, every prefix/suffix key scan
// in those stores stays free of foreign keys, and the whole buffer can be
// dropped without touching primary data. Local-only by construction — export
// and sync read the primary stores, so the buffer can never leak into a
// payload or a Drive upload.
export const UNDO_STORE_DB_NAME = 'unaware-sessions-undo';
export const UNDO_COOKIE_STORE_NAME = 'cookies';
export const UNDO_STORAGE_STORE_NAME = 'storage';
export const UNDO_STORE_DB_VERSION = 1;

// These two move together: the timeout bounds how long a single database's
// cursor iteration + JSON encoding may run in the content script, so raising
// the size ceiling without raising the timeout just trades a clear
// "exceeds NMB" skip for a same-effect "operation timed out" failure.
export const IDB_SNAPSHOT_TIMEOUT_MS = 50000;
export const IDB_SNAPSHOT_MAX_SIZE_MB = 500;

export const GITHUB_URL = 'https://github.com/msaidbilgehan/unaware-sessions-browser-extension/';
export const OPENCOLLECTIVE_URL = 'https://opencollective.com/unaware-sessions-browser-ext';
export const PRIVACY_POLICY_URL = `${GITHUB_URL}blob/master/PRIVACY_POLICY.md`;
export const ISSUES_URL = `${GITHUB_URL}issues`;
export const CHANGELOG_URL = `${GITHUB_URL}blob/master/CHANGELOG.md`;

export const DEFAULT_SESSION_EMOJIS = [
  '\u{1F3E0}',
  '\u{1F4BC}',
  '\u{1F3AE}',
  '\u{1F4DA}',
  '\u{1F6D2}',
  '\u{1F52C}',
  '\u{1F3A8}',
  '\u{1F3E6}',
  '\u{1F30D}',
  '\u{1F4AC}',
  '\u{1F4E7}',
  '\u{1F512}',
  '\u{1F3B5}',
  '\u{1F4F1}',
  '\u{1F5A5}\uFE0F',
  '\u{1F4B0}',
  '\u{1F3CB}\uFE0F',
  '\u{2708}\uFE0F',
  '\u{1F354}',
  '\u{1F3AC}',
  '\u{1F431}',
  '\u{1F331}',
  '\u{26A1}',
  '\u{1F527}',
] as const;
