import type { StorageSnapshot } from '@shared/types';
import {
  STORAGE_STORE_DB_NAME,
  STORAGE_STORE_NAME,
  STORAGE_STORE_DB_VERSION,
} from '@shared/constants';

function buildKey(sessionId: string, origin: string): string {
  return `${sessionId}:${origin}`;
}

class StorageStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(STORAGE_STORE_DB_NAME, STORAGE_STORE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
          db.createObjectStore(STORAGE_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open StorageStore DB: ${request.error?.message}`));
      };
    });
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    const db = await this.open();
    const key = buildKey(snapshot.sessionId, snapshot.origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      tx.objectStore(STORAGE_STORE_NAME).put(snapshot, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to save storage snapshot: ${tx.error?.message}`));
    });
  }

  async load(sessionId: string, origin: string): Promise<StorageSnapshot | undefined> {
    const db = await this.open();
    const key = buildKey(sessionId, origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const request = tx.objectStore(STORAGE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as StorageSnapshot | undefined);
      request.onerror = () =>
        reject(new Error(`Failed to load storage snapshot: ${request.error?.message}`));
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
      const origins: string[] = [];

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
              JSON.stringify(snapshot.localStorage).length +
              JSON.stringify(snapshot.sessionStorage).length;
            idbCount += snapshot.indexedDB?.length ?? 0;
            const origin = key.slice(prefix.length);
            if (!origins.includes(origin)) {
              origins.push(origin);
            }
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve({ entryCount, storageBytes, idbCount, origins });
      tx.onerror = () => reject(new Error(`Failed to get storage stats: ${tx.error?.message}`));
    });
  }

  async getSessionIdsForOrigin(origin: string): Promise<string[]> {
    const db = await this.open();
    const suffix = `:${origin}`;

    return new Promise((resolve, reject) => {
      const sessionIds: string[] = [];
      const tx = db.transaction(STORAGE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(STORAGE_STORE_NAME).openKeyCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.endsWith(suffix)) {
            const sessionId = key.slice(0, -suffix.length);
            if (!sessionIds.includes(sessionId)) {
              sessionIds.push(sessionId);
            }
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(sessionIds);
      tx.onerror = () =>
        reject(new Error(`Failed to get sessions for origin: ${tx.error?.message}`));
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
      tx.onerror = () => reject(new Error(`Failed to get snapshots: ${tx.error?.message}`));
    });
  }

  async deleteForOrigin(sessionId: string, origin: string): Promise<void> {
    const db = await this.open();
    const key = `${sessionId}:${origin}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE_NAME, 'readwrite');
      tx.objectStore(STORAGE_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to delete origin data: ${tx.error?.message}`));
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
      tx.onerror = () =>
        reject(new Error(`Failed to delete session storage: ${tx.error?.message}`));
    });
  }
}

export const storageStore = new StorageStore();
