import type { IndexedDBSnapshot, ObjectStoreSnapshot, IndexSnapshot } from '@shared/types';
import { IDB_SNAPSHOT_TIMEOUT_MS, IDB_SNAPSHOT_MAX_SIZE_MB } from '@shared/constants';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IDB operation timed out')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function snapshotDatabase(name: string): Promise<IndexedDBSnapshot | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);

    request.onerror = () => reject(new Error(`Failed to open IDB: ${name}`));

    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      const storeNames = Array.from(db.objectStoreNames);

      if (storeNames.length === 0) {
        db.close();
        resolve({ name, version, objectStores: [] });
        return;
      }

      const tx = db.transaction(storeNames, 'readonly');
      const objectStores: ObjectStoreSnapshot[] = [];
      let estimatedSize = 0;

      let completed = 0;
      const total = storeNames.length;

      for (const storeName of storeNames) {
        const store = tx.objectStore(storeName);

        const indexes: IndexSnapshot[] = [];
        for (let i = 0; i < store.indexNames.length; i++) {
          const idx = store.index(store.indexNames[i]);
          indexes.push({
            name: idx.name,
            keyPath: idx.keyPath as string | string[],
            unique: idx.unique,
            multiEntry: idx.multiEntry,
          });
        }

        const records: unknown[] = [];
        const cursorRequest = store.openCursor();

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            const serialized = JSON.stringify(cursor.value);
            estimatedSize += serialized.length;

            if (estimatedSize > IDB_SNAPSHOT_MAX_SIZE_MB * 1024 * 1024) {
              console.warn(
                `[Unaware Sessions] IDB "${name}" exceeds ${IDB_SNAPSHOT_MAX_SIZE_MB}MB — skipping`,
              );
              db.close();
              resolve(null);
              return;
            }

            records.push(cursor.value);
            cursor.continue();
          } else {
            objectStores.push({
              name: storeName,
              keyPath: store.keyPath as string | string[] | null,
              autoIncrement: store.autoIncrement,
              indexes,
              records,
            });

            completed++;
            if (completed === total) {
              db.close();
              resolve({ name, version, objectStores });
            }
          }
        };

        cursorRequest.onerror = () => {
          db.close();
          reject(new Error(`Failed to read IDB store: ${storeName}`));
        };
      }
    };
  });
}

export async function saveIndexedDB(): Promise<IndexedDBSnapshot[]> {
  if (typeof indexedDB.databases !== 'function') {
    console.warn('[Unaware Sessions] indexedDB.databases() not supported — skipping IDB snapshot');
    return [];
  }

  const databases = await indexedDB.databases();
  const snapshots: IndexedDBSnapshot[] = [];

  for (const dbInfo of databases) {
    if (!dbInfo.name) continue;
    // Skip extension's own databases
    if (dbInfo.name.startsWith('unaware-sessions-')) continue;

    try {
      const snapshot = await withTimeout(snapshotDatabase(dbInfo.name), IDB_SNAPSHOT_TIMEOUT_MS);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    } catch (err) {
      console.warn(`[Unaware Sessions] Failed to snapshot IDB "${dbInfo.name}":`, err);
    }
  }

  return snapshots;
}

export async function restoreIndexedDB(snapshots: IndexedDBSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    try {
      // Delete existing database first
      await new Promise<void>((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase(snapshot.name);
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => reject(new Error(`Failed to delete IDB: ${snapshot.name}`));
        deleteReq.onblocked = () => {
          console.warn(`[Unaware Sessions] IDB "${snapshot.name}" blocked during delete`);
          resolve();
        };
      });

      // Recreate with saved schema and data
      await new Promise<void>((resolve, reject) => {
        const openReq = indexedDB.open(snapshot.name, snapshot.version);

        openReq.onupgradeneeded = () => {
          const db = openReq.result;
          for (const storeSnapshot of snapshot.objectStores) {
            const store = db.createObjectStore(storeSnapshot.name, {
              keyPath: storeSnapshot.keyPath ?? undefined,
              autoIncrement: storeSnapshot.autoIncrement,
            });

            for (const idx of storeSnapshot.indexes) {
              store.createIndex(idx.name, idx.keyPath, {
                unique: idx.unique,
                multiEntry: idx.multiEntry,
              });
            }
          }
        };

        openReq.onsuccess = () => {
          const db = openReq.result;
          const storeNames = snapshot.objectStores.map((s) => s.name);

          if (storeNames.length === 0) {
            db.close();
            resolve();
            return;
          }

          const tx = db.transaction(storeNames, 'readwrite');

          for (const storeSnapshot of snapshot.objectStores) {
            const store = tx.objectStore(storeSnapshot.name);
            for (const record of storeSnapshot.records) {
              store.put(record);
            }
          }

          tx.oncomplete = () => {
            db.close();
            resolve();
          };

          tx.onerror = () => {
            db.close();
            reject(new Error(`Failed to restore IDB store data: ${snapshot.name}`));
          };
        };

        openReq.onerror = () => {
          reject(new Error(`Failed to open IDB for restore: ${snapshot.name}`));
        };
      });
    } catch (err) {
      console.warn(`[Unaware Sessions] Failed to restore IDB "${snapshot.name}":`, err);
    }
  }
}
