// ── Session Profile ──────────────────────────────────────────────

export interface SessionProfile {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  lastRefreshedAt?: number;
  settings: SessionSettings;
}

export interface SessionStats {
  tabCount: number;
  origins: string[];
  cookieCount: number;
  cookieBytes: number;
  storageEntries: number;
  storageBytes: number;
  idbDatabases: number;
}

export interface SessionOriginDetail {
  origin: string;
  cookieCount: number;
  cookieBytes: number;
  storageEntries: number;
  storageBytes: number;
  idbDatabases: number;
  cookieTimestamp: number | null;
  storageTimestamp: number | null;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface SessionDetails {
  sessionId: string;
  origins: SessionOriginDetail[];
  totalCookies: number;
  totalStorageBytes: number;
}

export interface SessionSettings {
  userAgent?: string;
  headers?: Record<string, string>;
}

// ── Extension Settings ──────────────────────────────────────────

export type AutoRefreshInterval = 0 | 30 | 60 | 120 | 300;

/**
 * Cookie isolation mode per domain.
 * - **soft**: Skip clearing cookies when the target session has no snapshot
 *   for this origin. Unmanaged domains pass through untouched.
 * - **strict**: Always clear cookies on session switch, even when nothing
 *   will be restored (clean slate). Use for domains that need full isolation.
 */
export type IsolationMode = 'soft' | 'strict';

export interface ExtensionSettings {
  autoRefreshInterval: AutoRefreshInterval;
  autoRefreshDefaultEnabled: boolean;
  isolationModeDefault: IsolationMode;
}

// ── Tab-Session Mapping ──────────────────────────────────────────

export interface TabSessionEntry {
  sessionId: string;
  origin: string;
}

export interface TabSessionMap {
  [tabId: number]: TabSessionEntry;
}

// ── Cookie Snapshot ──────────────────────────────────────────────

export interface CookieSnapshot {
  sessionId: string;
  origin: string;
  timestamp: number;
  cookies: chrome.cookies.Cookie[];
}

// ── Storage Snapshot (Phase 2) ───────────────────────────────────

export interface StorageSnapshot {
  sessionId: string;
  origin: string;
  timestamp: number;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: IndexedDBSnapshot[];
}

export interface IndexedDBSnapshot {
  name: string;
  version: number;
  objectStores: ObjectStoreSnapshot[];
}

export interface ObjectStoreSnapshot {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: IndexSnapshot[];
  records: unknown[];
  /** Explicit keys for out-of-line key stores (keyPath === null, autoIncrement === false). */
  keys?: IDBValidKey[];
  /** Cursor keys for ALL records — used as fallback when inline keyPath values become invalid after structured-clone round-trips. */
  allKeys?: IDBValidKey[];
}

export interface IndexSnapshot {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}

// ── Messaging ────────────────────────────────────────────────────

export enum MessageType {
  // Session management
  CREATE_SESSION = 'CREATE_SESSION',
  DELETE_SESSION = 'DELETE_SESSION',
  LIST_SESSIONS = 'LIST_SESSIONS',
  UPDATE_SESSION = 'UPDATE_SESSION',
  GET_SESSION_FOR_TAB = 'GET_SESSION_FOR_TAB',

  // Session switching
  SWITCH_SESSION = 'SWITCH_SESSION',
  ASSIGN_TAB = 'ASSIGN_TAB',
  UNASSIGN_TAB = 'UNASSIGN_TAB',

  // Storage (Phase 2)
  SAVE_STORAGE = 'SAVE_STORAGE',
  RESTORE_STORAGE = 'RESTORE_STORAGE',

  // Stats & data
  GET_TABS_FOR_SESSION = 'GET_TABS_FOR_SESSION',
  GET_ALL_TAB_COUNTS = 'GET_ALL_TAB_COUNTS',
  GET_SESSION_STATS = 'GET_SESSION_STATS',
  GET_SESSIONS_FOR_ORIGIN = 'GET_SESSIONS_FOR_ORIGIN',

  // Session data capture
  SAVE_SESSION_DATA = 'SAVE_SESSION_DATA',
  DETECT_SESSION = 'DETECT_SESSION',
  CLEAR_ORIGIN_DATA = 'CLEAR_ORIGIN_DATA',

  // Session data management (options page)
  GET_SESSION_DETAILS = 'GET_SESSION_DETAILS',
  DELETE_SESSION_ORIGIN_DATA = 'DELETE_SESSION_ORIGIN_DATA',
  UPDATE_SESSION_COOKIE = 'UPDATE_SESSION_COOKIE',
  DELETE_SESSION_COOKIE = 'DELETE_SESSION_COOKIE',
  UPDATE_SESSION_STORAGE_ENTRY = 'UPDATE_SESSION_STORAGE_ENTRY',
  DELETE_SESSION_STORAGE_ENTRY = 'DELETE_SESSION_STORAGE_ENTRY',

  // Session operations
  DUPLICATE_SESSION = 'DUPLICATE_SESSION',
  REORDER_SESSIONS = 'REORDER_SESSIONS',

  // Auto-refresh (saves fresh data for all tracked tabs)
  REFRESH_ACTIVE_SESSIONS = 'REFRESH_ACTIVE_SESSIONS',

  // Content script lifecycle
  CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY',
  PING = 'PING',

  // Import / Export (full)
  EXPORT_FULL = 'EXPORT_FULL',
  IMPORT_FULL = 'IMPORT_FULL',

  // Debug
  GET_LIVE_COOKIES = 'GET_LIVE_COOKIES',
  GET_COOKIE_DIFF = 'GET_COOKIE_DIFF',
  GET_RESTORE_FAILURES = 'GET_RESTORE_FAILURES',
}

export interface CreateSessionMessage {
  type: MessageType.CREATE_SESSION;
  name: string;
  color: string;
  emoji?: string;
}

export interface DeleteSessionMessage {
  type: MessageType.DELETE_SESSION;
  sessionId: string;
}

export interface ListSessionsMessage {
  type: MessageType.LIST_SESSIONS;
}

export interface UpdateSessionMessage {
  type: MessageType.UPDATE_SESSION;
  sessionId: string;
  updates: Partial<Pick<SessionProfile, 'name' | 'color' | 'emoji' | 'pinned' | 'settings'>>;
}

export interface GetSessionForTabMessage {
  type: MessageType.GET_SESSION_FOR_TAB;
  tabId: number;
}

export interface SwitchSessionMessage {
  type: MessageType.SWITCH_SESSION;
  tabId: number;
  targetSessionId: string;
}

export interface AssignTabMessage {
  type: MessageType.ASSIGN_TAB;
  tabId: number;
  sessionId: string;
  origin: string;
}

export interface UnassignTabMessage {
  type: MessageType.UNASSIGN_TAB;
  tabId: number;
}

export interface SaveStorageMessage {
  type: MessageType.SAVE_STORAGE;
  sessionId: string;
  origin: string;
}

export interface RestoreStorageMessage {
  type: MessageType.RESTORE_STORAGE;
  sessionId: string;
  origin: string;
  data: {
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    indexedDB?: IndexedDBSnapshot[];
  };
}

export interface ContentScriptReadyMessage {
  type: MessageType.CONTENT_SCRIPT_READY;
}

export interface PingMessage {
  type: MessageType.PING;
}

export interface GetTabsForSessionMessage {
  type: MessageType.GET_TABS_FOR_SESSION;
  sessionId: string;
}

export interface GetAllTabCountsMessage {
  type: MessageType.GET_ALL_TAB_COUNTS;
}

export interface GetSessionStatsMessage {
  type: MessageType.GET_SESSION_STATS;
  sessionId: string;
}

export interface DuplicateSessionMessage {
  type: MessageType.DUPLICATE_SESSION;
  sessionId: string;
}

export interface ReorderSessionsMessage {
  type: MessageType.REORDER_SESSIONS;
  orderedIds: string[];
}

export interface GetSessionsForOriginMessage {
  type: MessageType.GET_SESSIONS_FOR_ORIGIN;
  origin: string;
}

export interface SaveSessionDataMessage {
  type: MessageType.SAVE_SESSION_DATA;
  tabId: number;
}

export interface DetectSessionMessage {
  type: MessageType.DETECT_SESSION;
  origin: string;
}

export interface ClearOriginDataMessage {
  type: MessageType.CLEAR_ORIGIN_DATA;
  tabId: number;
}

export interface GetSessionDetailsMessage {
  type: MessageType.GET_SESSION_DETAILS;
  sessionId: string;
}

export interface DeleteSessionOriginDataMessage {
  type: MessageType.DELETE_SESSION_ORIGIN_DATA;
  sessionId: string;
  origin: string;
}

export interface UpdateSessionCookieMessage {
  type: MessageType.UPDATE_SESSION_COOKIE;
  sessionId: string;
  origin: string;
  cookieName: string;
  cookieDomain: string;
  newValue: string;
}

export interface DeleteSessionCookieMessage {
  type: MessageType.DELETE_SESSION_COOKIE;
  sessionId: string;
  origin: string;
  cookieName: string;
  cookieDomain: string;
}

export interface UpdateSessionStorageEntryMessage {
  type: MessageType.UPDATE_SESSION_STORAGE_ENTRY;
  sessionId: string;
  origin: string;
  storageType: 'localStorage' | 'sessionStorage';
  key: string;
  value: string;
}

export interface DeleteSessionStorageEntryMessage {
  type: MessageType.DELETE_SESSION_STORAGE_ENTRY;
  sessionId: string;
  origin: string;
  storageType: 'localStorage' | 'sessionStorage';
  key: string;
}

export interface RefreshActiveSessionsMessage {
  type: MessageType.REFRESH_ACTIVE_SESSIONS;
}

// ── Full Export / Import ────────────────────────────────────────

export interface FullExportData {
  version: 1;
  exportedAt: number;
  sessions: SessionProfile[];
  cookieSnapshots: CookieSnapshot[];
  storageSnapshots: StorageSnapshot[];
}

export interface ExportFullMessage {
  type: MessageType.EXPORT_FULL;
}

export interface ImportFullMessage {
  type: MessageType.IMPORT_FULL;
  data: FullExportData;
}

// ── Debug Messages ──────────────────────────────────────────────

export interface GetLiveCookiesMessage {
  type: MessageType.GET_LIVE_COOKIES;
  origin: string;
}

export interface GetCookieDiffMessage {
  type: MessageType.GET_COOKIE_DIFF;
  sessionId: string;
  origin: string;
}

export interface GetRestoreFailuresMessage {
  type: MessageType.GET_RESTORE_FAILURES;
}

export type CookieDiffStatus = 'match' | 'value_changed' | 'flags_changed' | 'missing_in_browser' | 'extra_in_browser' | 'expired';

export interface CookieDiffEntry {
  name: string;
  domain: string;
  path: string;
  status: CookieDiffStatus;
  snapshotValue?: string;
  liveValue?: string;
  flagDiffs?: string[];
}

export interface CookieDiffResult {
  origin: string;
  sessionId: string;
  snapshotTimestamp: number | null;
  totalSnapshot: number;
  totalLive: number;
  entries: CookieDiffEntry[];
  summary: {
    matched: number;
    valueChanged: number;
    flagsChanged: number;
    missingInBrowser: number;
    extraInBrowser: number;
    expired: number;
  };
}

export interface RestoreFailureEntry {
  timestamp: number;
  sessionId: string;
  origin: string;
  cookieName: string;
  cookieDomain: string;
  reason: string;
}

export interface LiveCookieInfo {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expirationDate?: number;
}

export type Message =
  | CreateSessionMessage
  | DeleteSessionMessage
  | ListSessionsMessage
  | UpdateSessionMessage
  | GetSessionForTabMessage
  | SwitchSessionMessage
  | AssignTabMessage
  | UnassignTabMessage
  | SaveStorageMessage
  | RestoreStorageMessage
  | ContentScriptReadyMessage
  | PingMessage
  | GetTabsForSessionMessage
  | GetAllTabCountsMessage
  | GetSessionStatsMessage
  | DuplicateSessionMessage
  | ReorderSessionsMessage
  | GetSessionsForOriginMessage
  | SaveSessionDataMessage
  | DetectSessionMessage
  | ClearOriginDataMessage
  | GetSessionDetailsMessage
  | DeleteSessionOriginDataMessage
  | UpdateSessionCookieMessage
  | DeleteSessionCookieMessage
  | UpdateSessionStorageEntryMessage
  | DeleteSessionStorageEntryMessage
  | RefreshActiveSessionsMessage
  | ExportFullMessage
  | ImportFullMessage
  | GetLiveCookiesMessage
  | GetCookieDiffMessage
  | GetRestoreFailuresMessage;

// ── Response Wrapper ─────────────────────────────────────────────

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
