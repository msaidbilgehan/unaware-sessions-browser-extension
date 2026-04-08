// ── Session Profile ──────────────────────────────────────────────

export interface SessionProfile {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
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

export interface SessionSettings {
  userAgent?: string;
  headers?: Record<string, string>;
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

  // Session operations
  DUPLICATE_SESSION = 'DUPLICATE_SESSION',
  REORDER_SESSIONS = 'REORDER_SESSIONS',

  // Content script lifecycle
  CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY',
  PING = 'PING',
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
  | SaveSessionDataMessage;

// ── Response Wrapper ─────────────────────────────────────────────

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
