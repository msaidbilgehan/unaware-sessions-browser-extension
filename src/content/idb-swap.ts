import type { IndexedDBSnapshot, ObjectStoreSnapshot, IndexSnapshot } from '@shared/types';
import { IDB_SNAPSHOT_TIMEOUT_MS, IDB_SNAPSHOT_MAX_SIZE_MB } from '@shared/constants';

// ── JSON-safe encoding for binary/Date values ──────────────────────
// chrome.runtime.sendMessage uses JSON serialization (not structured clone),
// so ArrayBuffer, TypedArray, and Date are lost during the round-trip between
// the content script and the background service worker.  We encode them into
// JSON-safe marker objects before sending, then decode on restore.

const MARKER = '__ua_t';

function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (value instanceof ArrayBuffer) {
    return { [MARKER]: 'AB', d: Array.from(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      (value as ArrayBufferView).buffer,
      (value as ArrayBufferView).byteOffset,
      (value as ArrayBufferView).byteLength,
    );
    return { [MARKER]: 'TV', d: Array.from(bytes) };
  }
  if (value instanceof Date) {
    return { [MARKER]: 'D', d: value.getTime() };
  }
  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = encodeValue(obj[key]);
  }
  return result;
}

function decodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }

  const obj = value as Record<string, unknown>;
  const marker = obj[MARKER];

  if (typeof marker === 'string') {
    if ((marker === 'AB' || marker === 'TV') && Array.isArray(obj.d)) {
      return new Uint8Array(obj.d as number[]).buffer;
    }
    if (marker === 'D' && typeof obj.d === 'number') {
      return new Date(obj.d);
    }
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = decodeValue(obj[key]);
  }
  return result;
}

// ── Helpers ────────────────────────────────────────────────────────

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

// ── Snapshot ───────────────────────────────────────────────────────

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
        const needsExplicitKeys = store.keyPath === null;
        const keys: IDBValidKey[] = [];
        const allKeys: IDBValidKey[] = [];
        const cursorRequest = store.openCursor();

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            // Encode BEFORE size estimation — the encoded form is what
            // actually gets serialized through chrome.runtime.sendMessage.
            const encoded = encodeValue(cursor.value);
            const serialized = JSON.stringify(encoded);
            estimatedSize += serialized.length;

            if (estimatedSize > IDB_SNAPSHOT_MAX_SIZE_MB * 1024 * 1024) {
              console.warn(
                `[Unaware Sessions] IDB "${name}" exceeds ${IDB_SNAPSHOT_MAX_SIZE_MB}MB — skipping`,
              );
              db.close();
              resolve(null);
              return;
            }

            records.push(encoded);
            const encodedKey = encodeValue(cursor.key) as IDBValidKey;
            allKeys.push(encodedKey);
            if (needsExplicitKeys) {
              keys.push(encodedKey);
            }
            cursor.continue();
          } else {
            objectStores.push({
              name: storeName,
              keyPath: store.keyPath as string | string[] | null,
              autoIncrement: store.autoIncrement,
              indexes,
              records,
              ...(needsExplicitKeys ? { keys } : {}),
              allKeys,
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

// ── Restore ───────────────────────────────────────────────────────

export async function restoreIndexedDB(snapshots: IndexedDBSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    try {
      // Delete existing database first (best-effort: incognito or restricted
      // contexts may reject deleteDatabase even on a clean session)
      await new Promise<void>((resolve) => {
        const deleteReq = indexedDB.deleteDatabase(snapshot.name);
        deleteReq.onsuccess = () => resolve();
        deleteReq.onerror = () => {
          console.warn(
            `[Unaware Sessions] deleteDatabase("${snapshot.name}") failed — proceeding with restore`
          );
          resolve();
        };
        deleteReq.onblocked = () => {
          console.warn(
            `[Unaware Sessions] deleteDatabase("${snapshot.name}") blocked — proceeding with restore`
          );
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
            const hasExplicitKeys =
              storeSnapshot.keyPath === null && Array.isArray(storeSnapshot.keys);

            for (let i = 0; i < storeSnapshot.records.length; i++) {
              try {
                // Decode marker objects back to their original binary/Date types
                const record = decodeValue(storeSnapshot.records[i]);

                if (hasExplicitKeys && storeSnapshot.keys![i] !== undefined) {
                  const key = decodeValue(storeSnapshot.keys![i]) as IDBValidKey;
                  store.put(record, key);
                } else {
                  store.put(record);
                }
              } catch (err) {
                // Skip individual records that fail rather than aborting
                // the entire store restore.
                console.warn(
                  `[Unaware Sessions] Skipping IDB record in "${storeSnapshot.name}":`,
                  err,
                );
              }
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
