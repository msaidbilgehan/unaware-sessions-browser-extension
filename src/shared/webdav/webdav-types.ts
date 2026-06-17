import type { SyncInterval } from '@shared/sync/sync-types';

export type WebDavSyncInterval = SyncInterval | 1 | 60 | 120 | 360 | 720 | 1440;

export type WebDavMaxBackups = 0 | 1 | 3 | 5 | 10 | 20 | 50;

export interface WebDavConfig {
  enabled: boolean;
  host: string;
  username: string;
  password: string;
  path: string;
  syncInterval: WebDavSyncInterval;
  maxBackups: WebDavMaxBackups;
  lastSyncAt: number;
  lastSyncError: string;
  deviceId: string;
  encryptionPassword?: string;
  backupKey?: string;
}

export interface WebDavConnectionConfig {
  host: string;
  username: string;
  password: string;
  path: string;
}

export type WebDavStatus = 'idle' | 'syncing' | 'error';

export interface WebDavState {
  status: WebDavStatus;
  progress: string;
}

export interface WebDavFile {
  fileName: string;
  href: string;
  lastModified: number;
  size: number;
}
