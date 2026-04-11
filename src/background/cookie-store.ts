import type { CookieSnapshot } from '@shared/types';
import {
  COOKIE_STORE_DB_NAME,
  COOKIE_STORE_NAME,
  COOKIE_STORE_DB_VERSION,
} from '@shared/constants';
import { estimateCookieBytes } from '@shared/utils';

function buildKey(sessionId: string, origin: string): string {
  return `${sessionId}:${origin}`;
}

class CookieStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(COOKIE_STORE_DB_NAME, COOKIE_STORE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(COOKIE_STORE_NAME)) {
          db.createObjectStore(COOKIE_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open CookieStore DB: ${request.error?.message}`));
      };
    });
  }

  async save(snapshot: CookieSnapshot): Promise<void> {
    const db = await this.open();
    const key = buildKey(snapshot.sessionId, snapshot.origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(COOKIE_STORE_NAME, 'readwrite');
      tx.objectStore(COOKIE_STORE_NAME).put(snapshot, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to save cookie snapshot: ${tx.error?.message}`));
    });
  }

  async load(sessionId: string, origin: string): Promise<CookieSnapshot | undefined> {
    const db = await this.open();
    const key = buildKey(sessionId, origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(COOKIE_STORE_NAME, 'readonly');
      const request = tx.objectStore(COOKIE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as CookieSnapshot | undefined);
      request.onerror = () =>
        reject(new Error(`Failed to load cookie snapshot: ${request.error?.message}`));
    });
  }

  async deleteForSession(sessionId: string): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(COOKIE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(COOKIE_STORE_NAME);
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
        reject(new Error(`Failed to delete session cookies: ${tx.error?.message}`));
    });
  }

  async getStatsForSession(
    sessionId: string,
  ): Promise<{ cookieCount: number; cookieBytes: number; origins: string[] }> {
    const db = await this.open();
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      let cookieCount = 0;
      let cookieBytes = 0;
      const originSet = new Set<string>();

      const tx = db.transaction(COOKIE_STORE_NAME, 'readonly');
      const store = tx.objectStore(COOKIE_STORE_NAME);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(prefix)) {
            const snapshot = cursor.value as CookieSnapshot;
            cookieCount += snapshot.cookies.length;
            cookieBytes += estimateCookieBytes(snapshot.cookies);
            originSet.add(key.slice(prefix.length));
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve({ cookieCount, cookieBytes, origins: [...originSet] });
      tx.onerror = () => reject(new Error(`Failed to get cookie stats: ${tx.error?.message}`));
    });
  }

  async getSessionIdsForOrigin(origin: string): Promise<string[]> {
    const db = await this.open();
    const suffix = `:${origin}`;

    return new Promise((resolve, reject) => {
      const sessionIdSet = new Set<string>();
      const tx = db.transaction(COOKIE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(COOKIE_STORE_NAME).openKeyCursor();

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
      tx.onerror = () =>
        reject(new Error(`Failed to get sessions for origin: ${tx.error?.message}`));
    });
  }

  async getAllSessionOrigins(): Promise<Record<string, string[]>> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const map = new Map<string, Set<string>>();
      const tx = db.transaction(COOKIE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(COOKIE_STORE_NAME).openKeyCursor();

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
      tx.onerror = () =>
        reject(new Error(`Failed to get all session origins: ${tx.error?.message}`));
    });
  }

  async getAllSnapshotsForSession(sessionId: string): Promise<CookieSnapshot[]> {
    const db = await this.open();
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      const snapshots: CookieSnapshot[] = [];
      const tx = db.transaction(COOKIE_STORE_NAME, 'readonly');
      const cursorRequest = tx.objectStore(COOKIE_STORE_NAME).openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const key = cursor.key as string;
          if (key.startsWith(prefix)) {
            snapshots.push(cursor.value as CookieSnapshot);
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
      const tx = db.transaction(COOKIE_STORE_NAME, 'readwrite');
      tx.objectStore(COOKIE_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to delete origin data: ${tx.error?.message}`));
    });
  }

  async deleteAll(): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(COOKIE_STORE_NAME, 'readwrite');
      tx.objectStore(COOKIE_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to clear cookie store: ${tx.error?.message}`));
    });
  }
}

export const cookieStore = new CookieStore();
