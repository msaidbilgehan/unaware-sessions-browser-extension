import type { ExtensionSettings } from '@shared/types';

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
} as const;

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  autoRefreshInterval: 0,
  autoRefreshDefaultEnabled: false,
  isolationModeDefault: 'soft',
  logLevel: 'off',
};

export const LOG_BUFFER_MAX_SIZE = 2000;

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

export const IDB_SNAPSHOT_TIMEOUT_MS = 5000;
export const IDB_SNAPSHOT_MAX_SIZE_MB = 50;

export const GITHUB_URL =
  'https://github.com/msaidbilgehan/unaware-sessions-browser-extension/tree/master';
export const OPENCOLLECTIVE_URL = 'https://opencollective.com/unaware-sessions-browser-ext';

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
