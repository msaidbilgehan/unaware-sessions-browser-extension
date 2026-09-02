import type { StorageSnapshot } from '@shared/types';
import {
  STORAGE_STORE_DB_NAME,
  STORAGE_STORE_NAME,
  STORAGE_STORE_DB_VERSION,
} from '@shared/constants';
import { estimateRecordBytes } from '@shared/utils';
import { openSnapshotDb, rejectOnTxFailure } from './idb-support';

function buildKey(sessionId: string, origin: string): string {
  return `${sessionId}:${origin}`;
}

class StorageStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    // Share one in-flight open: concurrent callers (a switch and an
    // auto-save, say) would otherwise each open a connection.
    if (this.opening) return this.opening;

    this.opening = openSnapshotDb(
      STORAGE_STORE_DB_NAME,
      [STORAGE_STORE_NAME],
      STORAGE_STORE_DB_VERSION,
      () => {
        this.db = null;
      },
    )
      .then((db) => {
        this.db = db;
        return db;
      })
      .finally(() => {
        this.opening = null;
      });

    return this.opening;
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    const db = await this.open();
    const key = buildKey(snapshot.sessionId, snapshot.origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      tx.objectStore(STORAGE_STORE_NAME).put(snapshot, key);
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to save storage snapshot');
    });
  }

  async load(sessionId: string, origin: string): Promise<StorageSnapshot | undefined> {
    const db = await this.open();
    const key = buildKey(sessionId, origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const request = tx.objectStore(STORAGE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as StorageSnapshot | undefined);
      rejectOnTxFailure(tx, reject, 'Failed to load storage snapshot');
    });
  }

  async getStatsForSession(
    sessionId: string,
  ): Promise<{ entryCount: number; storageBytes: number; idbCount: number; origins: string[] }> {
    const db = await this.open();
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      let entryCount = 0;
      let storageBytes = 0;
      let idbCount = 0;
      const originSet = new Set<string>();

      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const store = tx.objectStore(STORAGE_STORE_NAME);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(prefix)) {
            const snapshot = cursor.value as StorageSnapshot;
            entryCount +=
              Object.keys(snapshot.localStorage).length +
              Object.keys(snapshot.sessionStorage).length;
            storageBytes +=
              estimateRecordBytes(snapshot.localStorage) +
              estimateRecordBytes(snapshot.sessionStorage);
            idbCount += snapshot.indexedDB?.length ?? 0;
            originSet.add(key.slice(prefix.length));
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () =>
        resolve({ entryCount, storageBytes, idbCount, origins: [...originSet] });
      rejectOnTxFailure(tx, reject, 'Failed to get storage stats');
    });
  }

  async getSessionIdsForOrigin(origin: string): Promise<string[]> {
    const db = await this.open();
    const suffix = `:${origin}`;

    return new Promise((resolve, reject) => {
      const sessionIdSet = new Set<string>();
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(STORAGE_STORE_NAME).openKeyCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.endsWith(suffix)) {
            sessionIdSet.add(key.slice(0, -suffix.length));
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve([...sessionIdSet]);
      rejectOnTxFailure(tx, reject, 'Failed to get sessions for origin');
    });
  }

  async getAllSessionOrigins(): Promise<Record<string, string[]>> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const map = new Map<string, Set<string>>();
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(STORAGE_STORE_NAME).openKeyCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          const sep = key.indexOf(':');
          if (sep > 0) {
            const sessionId = key.slice(0, sep);
            const origin = key.slice(sep + 1);
            let set = map.get(sessionId);
            if (!set) {
              set = new Set();
              map.set(sessionId, set);
            }
            set.add(origin);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        const result: Record<string, string[]> = {};
        for (const [sid, origins] of map) {
          result[sid] = [...origins];
        }
        resolve(result);
      };
      rejectOnTxFailure(tx, reject, 'Failed to get all session origins');
    });
  }

  async getAllSnapshotsForSession(sessionId: string): Promise<StorageSnapshot[]> {
    const db = await this.open();
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      const snapshots: StorageSnapshot[] = [];
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(STORAGE_STORE_NAME).openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(prefix)) {
            snapshots.push(cursor.value as StorageSnapshot);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(snapshots);
      rejectOnTxFailure(tx, reject, 'Failed to get snapshots');
    });
  }

  async deleteForOrigin(sessionId: string, origin: string): Promise<void> {
    const db = await this.open();
    const key = `${sessionId}:${origin}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      tx.objectStore(STORAGE_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to delete origin data');
    });
  }

  async deleteForSession(sessionId: string): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORAGE_STORE_NAME);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(`${sessionId}:`)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to delete session storage');
    });
  }

  async getAllSnapshots(): Promise<StorageSnapshot[]> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const snapshots: StorageSnapshot[] = [];
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(STORAGE_STORE_NAME).openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          snapshots.push(cursor.value as StorageSnapshot);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(snapshots);
      rejectOnTxFailure(tx, reject, 'Failed to get all snapshots');
    });
  }

  /** Every `sessionId:origin` key currently stored. */
  async getAllKeys(): Promise<string[]> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const request = tx.objectStore(STORAGE_STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      rejectOnTxFailure(tx, reject, 'Failed to get all keys');
    });
  }

  async deleteKeys(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORAGE_STORE_NAME);
      for (const key of keys) {
        store.delete(key);
      }
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to delete keys');
    });
  }

  /** Record count — reported by the Debug tab to distinguish "no data" from "unreadable data". */
  async countAll(): Promise<number> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const request = tx.objectStore(STORAGE_STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      rejectOnTxFailure(tx, reject, 'Failed to count storage snapshots');
    });
  }

  async deleteAll(): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      tx.objectStore(STORAGE_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to clear storage store');
    });
  }
}

export const storageStore = new StorageStore();
