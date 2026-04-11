// ── Sync Configuration ─────────────────────────────────────

export type MergeStrategy = 'trust-cloud' | 'trust-local' | 'ask';

export type SyncInterval = 0 | 5 | 15 | 30;

export interface SyncConfig {
  enabled: boolean;
  mergeStrategy: MergeStrategy;
  syncInterval: SyncInterval;
  lastSyncAt: number;
  lastSyncError: string;
  deviceId: string;
  googleId: string;
}

// ── Sync State (transient, in-memory) ──────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  progress: string;
  conflicts: ConflictEntry[];
}

// ── Conflict Resolution ────────────────────────────────────

export interface ConflictEntry {
  sessionId: string;
  sessionName: string;
  origin: string;
  localTimestamp: number;
  cloudTimestamp: number;
  resolution: 'local' | 'cloud' | null;
}

// ── Sync Manifest (unencrypted, stored on Drive) ───────────

export interface SyncManifest {
  version: 1;
  updatedAt: number;
  deviceId: string;
  checksums: Record<string, string>;
  sessionChecksums: Record<string, string>;
}

// ── Encrypted Payload (stored on Drive) ────────────────────

export interface EncryptedPayload {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}
