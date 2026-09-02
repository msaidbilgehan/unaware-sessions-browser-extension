import type { CookieSnapshot, StorageSnapshot } from '@shared/types';
import {
  UNDO_STORE_DB_NAME,
  UNDO_COOKIE_STORE_NAME,
  UNDO_STORAGE_STORE_NAME,
  UNDO_STORE_DB_VERSION,
} from '@shared/constants';
import { openSnapshotDb, rejectOnTxFailure } from './idb-support';

/**
 * One-slot undo buffer for snapshots that went empty.
 *
 * A capture that reads zero cookies is indistinguishable from a real logout:
 * the site clearing its cookie, Chrome's "Clear browsing data", another
 * extension, or a server-side "sign out everywhere" all look identical from
 * `chrome.cookies.getAll`, and `chrome.cookies.onChanged`'s `cause` does not
 * separate them either (both report `explicit`). Rather than guess — and be
 * wrong in one direction or the other — the previous non-empty snapshot is
 * kept here, recoverable from the options page, while the live snapshot stays
 * a faithful mirror of the browser.
 *
 * Deliberately local-only: export and sync read the primary stores, so a
 * retained pre-logout credential can never reach a Drive payload. The slot is
 * dropped as soon as the primary snapshot has real data again.
 */

export type SnapshotKind = 'cookies' | 'storage';

const STORE_NAMES: Record<SnapshotKind, string> = {
  cookies: UNDO_COOKIE_STORE_NAME,
  storage: UNDO_STORAGE_STORE_NAME,
};

const ALL_STORE_NAMES = [UNDO_COOKIE_STORE_NAME, UNDO_STORAGE_STORE_NAME];

function buildKey(sessionId: string, origin: string): string {
  return `${sessionId}:${origin}`;
}

export function isEmptyCookieSnapshot(snapshot: CookieSnapshot): boolean {
  return snapshot.cookies.length === 0;
}

export function isEmptyStorageSnapshot(snapshot: StorageSnapshot): boolean {
  return (
    Object.keys(snapshot.localStorage).length === 0 &&
    Object.keys(snapshot.sessionStorage).length === 0 &&
    (snapshot.indexedDB?.length ?? 0) === 0
  );
}

class SnapshotUndoStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.opening) return this.opening;

    this.opening = openSnapshotDb(
      UNDO_STORE_DB_NAME,
      ALL_STORE_NAMES,
      UNDO_STORE_DB_VERSION,
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

  async put(kind: SnapshotKind, snapshot: CookieSnapshot | StorageSnapshot): Promise<void> {
    const db = await this.open();
    const storeName = STORE_NAMES[kind];
    const key = buildKey(snapshot.sessionId, snapshot.origin);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(snapshot, key);
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, `Failed to save ${kind} undo snapshot`);
    });
  }

  async getCookies(sessionId: string, origin: string): Promise<CookieSnapshot | undefined> {
    return this.get<CookieSnapshot>('cookies', sessionId, origin);
  }

  async getStorage(sessionId: string, origin: string): Promise<StorageSnapshot | undefined> {
    return this.get<StorageSnapshot>('storage', sessionId, origin);
  }

  private async get<T>(
    kind: SnapshotKind,
    sessionId: string,
    origin: string,
  ): Promise<T | undefined> {
    const db = await this.open();
    const storeName = STORE_NAMES[kind];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(buildKey(sessionId, origin));
      request.onsuccess = () => resolve(request.result as T | undefined);
      rejectOnTxFailure(tx, reject, `Failed to load ${kind} undo snapshot`);
    });
  }

  async delete(kind: SnapshotKind, sessionId: string, origin: string): Promise<void> {
    const db = await this.open();
    const storeName = STORE_NAMES[kind];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(buildKey(sessionId, origin));
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, `Failed to delete ${kind} undo snapshot`);
    });
  }

  /** Drop both kinds for one origin — used when the origin's data is deleted outright. */
  async deleteForOrigin(sessionId: string, origin: string): Promise<void> {
    await Promise.all([
      this.delete('cookies', sessionId, origin),
      this.delete('storage', sessionId, origin),
    ]);
  }

  async deleteForSession(sessionId: string): Promise<void> {
    const db = await this.open();
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
      for (const storeName of ALL_STORE_NAMES) {
        const cursorRequest = tx.objectStore(storeName).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            if ((cursor.key as string).startsWith(prefix)) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to delete session undo snapshots');
    });
  }

  /** All undo snapshots of one kind belonging to a session. */
  async getAllForSession<T>(kind: SnapshotKind, sessionId: string): Promise<T[]> {
    const db = await this.open();
    const storeName = STORE_NAMES[kind];
    const prefix = `${sessionId}:`;

    return new Promise((resolve, reject) => {
      const snapshots: T[] = [];
      const tx = db.transaction(storeName, 'readonly');
      const cursorRequest = tx.objectStore(storeName).openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          if ((cursor.key as string).startsWith(prefix)) {
            snapshots.push(cursor.value as T);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(snapshots);
      rejectOnTxFailure(tx, reject, `Failed to get ${kind} undo snapshots`);
    });
  }

  async countAll(): Promise<number> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      let total = 0;
      const tx = db.transaction(ALL_STORE_NAMES, 'readonly');
      for (const storeName of ALL_STORE_NAMES) {
        const request = tx.objectStore(storeName).count();
        request.onsuccess = () => {
          total += request.result;
        };
      }
      tx.oncomplete = () => resolve(total);
      rejectOnTxFailure(tx, reject, 'Failed to count undo snapshots');
    });
  }

  async deleteAll(): Promise<void> {
    const db = await this.open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(ALL_STORE_NAMES, 'readwrite');
      for (const storeName of ALL_STORE_NAMES) {
        tx.objectStore(storeName).clear();
      }
      tx.oncomplete = () => resolve();
      rejectOnTxFailure(tx, reject, 'Failed to clear undo snapshots');
    });
  }
}

export const snapshotUndo = new SnapshotUndoStore();
