import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { IndexedDBSnapshot } from '@shared/types';

// Dynamic import so fake-indexeddb is active
const { saveIndexedDB, restoreIndexedDB } = await import('@content/idb-swap');

/** Create a real IDB database with the given name, stores, and records. */
async function createTestDB(
  name: string,
  stores: Array<{
    name: string;
    keyPath?: string | null;
    autoIncrement?: boolean;
    records?: unknown[];
    indexes?: Array<{ name: string; keyPath: string; unique?: boolean }>;
  }>,
  version = 1,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of stores) {
        const store = db.createObjectStore(s.name, {
          keyPath: s.keyPath ?? undefined,
          autoIncrement: s.autoIncrement ?? false,
        });
        for (const idx of s.indexes ?? []) {
          store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
        }
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      if (stores.some((s) => (s.records?.length ?? 0) > 0)) {
        const storeNames = stores.filter((s) => (s.records?.length ?? 0) > 0).map((s) => s.name);
        const tx = db.transaction(storeNames, 'readwrite');
        for (const s of stores) {
          if (!s.records?.length) continue;
          const store = tx.objectStore(s.name);
          for (const rec of s.records) {
            store.put(rec);
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(new Error('Failed to insert test records'));
        };
      } else {
        db.close();
        resolve();
      }
    };

    req.onerror = () => reject(new Error('Failed to create test DB'));
  });
}

/** Delete a database by name. */
async function deleteDB(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

/** Read all records from a store in a database. */
async function readAllRecords(dbName: string, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        db.close();
        resolve(getAll.result);
      };
      getAll.onerror = () => {
        db.close();
        reject(new Error('Failed to read records'));
      };
    };
    req.onerror = () => reject(new Error('Failed to open DB for reading'));
  });
}

beforeEach(async () => {
  // Clean up all databases between tests
  if (typeof indexedDB.databases === 'function') {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) await deleteDB(db.name);
    }
  }
  vi.restoreAllMocks();
});

describe('saveIndexedDB', () => {
  it('returns empty array when no databases exist', async () => {
    const result = await saveIndexedDB();
    expect(result).toEqual([]);
  });

  it('snapshots a database with records', async () => {
    await createTestDB('testdb', [
      {
        name: 'users',
        keyPath: 'id',
        records: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      },
    ]);

    const result = await saveIndexedDB();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('testdb');
    expect(result[0].version).toBe(1);
    expect(result[0].objectStores).toHaveLength(1);
    expect(result[0].objectStores[0].name).toBe('users');
    expect(result[0].objectStores[0].keyPath).toBe('id');
    expect(result[0].objectStores[0].records).toHaveLength(2);
    expect(result[0].objectStores[0].records).toContainEqual({ id: 1, name: 'Alice' });
  });

  it('snapshots indexes on object stores', async () => {
    await createTestDB('indexed-db', [
      {
        name: 'items',
        keyPath: 'id',
        indexes: [{ name: 'by_name', keyPath: 'name', unique: true }],
      },
    ]);

    const result = await saveIndexedDB();

    expect(result[0].objectStores[0].indexes).toHaveLength(1);
    expect(result[0].objectStores[0].indexes[0]).toEqual({
      name: 'by_name',
      keyPath: 'name',
      unique: true,
      multiEntry: false,
    });
  });

  it('skips databases with names starting with "unaware-sessions-"', async () => {
    await createTestDB('unaware-sessions-cookies', [{ name: 'store', keyPath: 'id' }]);
    await createTestDB('myapp', [{ name: 'data', keyPath: 'id' }]);

    const result = await saveIndexedDB();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('myapp');
  });

  it('snapshots a database with empty object stores', async () => {
    await createTestDB('emptydb', [{ name: 'emptystore', keyPath: 'id' }]);

    const result = await saveIndexedDB();

    expect(result).toHaveLength(1);
    expect(result[0].objectStores[0].records).toEqual([]);
  });

  it('snapshots multiple databases', async () => {
    await createTestDB('db1', [
      { name: 'store1', keyPath: 'id', records: [{ id: 1 }] },
    ]);
    await createTestDB('db2', [
      { name: 'store2', keyPath: 'id', records: [{ id: 2 }] },
    ]);

    const result = await saveIndexedDB();

    expect(result).toHaveLength(2);
    const names = result.map((s) => s.name).sort();
    expect(names).toEqual(['db1', 'db2']);
  });

  it('returns empty array when indexedDB.databases is not supported', async () => {
    const origDatabases = indexedDB.databases;
    // Temporarily remove databases function
    Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true });

    const result = await saveIndexedDB();

    expect(result).toEqual([]);

    // Restore
    Object.defineProperty(indexedDB, 'databases', { value: origDatabases, configurable: true });
  });
});

describe('restoreIndexedDB', () => {
  it('restores a database with records from snapshot', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'restored-db',
      version: 1,
      objectStores: [
        {
          name: 'items',
          keyPath: 'id',
          autoIncrement: false,
          indexes: [],
          records: [
            { id: 1, value: 'one' },
            { id: 2, value: 'two' },
          ],
        },
      ],
    };

    await restoreIndexedDB([snapshot]);

    const records = await readAllRecords('restored-db', 'items');
    expect(records).toHaveLength(2);
    expect(records).toContainEqual({ id: 1, value: 'one' });
    expect(records).toContainEqual({ id: 2, value: 'two' });
  });

  it('restores object store indexes', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'idx-db',
      version: 1,
      objectStores: [
        {
          name: 'items',
          keyPath: 'id',
          autoIncrement: false,
          indexes: [{ name: 'by_name', keyPath: 'name', unique: true, multiEntry: false }],
          records: [{ id: 1, name: 'Alice' }],
        },
      ],
    };

    await restoreIndexedDB([snapshot]);

    // Verify indexes by opening and inspecting
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('idx-db');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Failed to open'));
    });

    const store = db.transaction('items', 'readonly').objectStore('items');
    expect(store.indexNames.contains('by_name')).toBe(true);
    const idx = store.index('by_name');
    expect(idx.unique).toBe(true);
    db.close();
  });

  it('deletes existing database before restoring', async () => {
    // Create a pre-existing DB with different data
    await createTestDB('overwrite-db', [
      { name: 'data', keyPath: 'id', records: [{ id: 99, old: true }] },
    ]);

    const snapshot: IndexedDBSnapshot = {
      name: 'overwrite-db',
      version: 1,
      objectStores: [
        {
          name: 'data',
          keyPath: 'id',
          autoIncrement: false,
          indexes: [],
          records: [{ id: 1, fresh: true }],
        },
      ],
    };

    await restoreIndexedDB([snapshot]);

    const records = await readAllRecords('overwrite-db', 'data');
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ id: 1, fresh: true });
  });

  it('restores a database with empty stores (no records)', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'empty-restore',
      version: 1,
      objectStores: [
        {
          name: 'things',
          keyPath: 'id',
          autoIncrement: false,
          indexes: [],
          records: [],
        },
      ],
    };

    await restoreIndexedDB([snapshot]);

    const records = await readAllRecords('empty-restore', 'things');
    expect(records).toEqual([]);
  });

  it('restores multiple databases from array', async () => {
    const snapshots: IndexedDBSnapshot[] = [
      {
        name: 'multi-a',
        version: 1,
        objectStores: [
          { name: 'store', keyPath: 'id', autoIncrement: false, indexes: [], records: [{ id: 1 }] },
        ],
      },
      {
        name: 'multi-b',
        version: 1,
        objectStores: [
          { name: 'store', keyPath: 'id', autoIncrement: false, indexes: [], records: [{ id: 2 }] },
        ],
      },
    ];

    await restoreIndexedDB(snapshots);

    const recordsA = await readAllRecords('multi-a', 'store');
    const recordsB = await readAllRecords('multi-b', 'store');
    expect(recordsA).toEqual([{ id: 1 }]);
    expect(recordsB).toEqual([{ id: 2 }]);
  });

  it('handles empty snapshot array gracefully', async () => {
    await restoreIndexedDB([]);
    // No error thrown
  });

  it('restores database with no object stores', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'no-stores',
      version: 1,
      objectStores: [],
    };

    await restoreIndexedDB([snapshot]);

    // DB should exist but have no stores
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('no-stores');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Failed to open'));
    });
    expect(db.objectStoreNames.length).toBe(0);
    db.close();
  });
});

describe('save then restore round-trip', () => {
  it('preserves data through a save-restore cycle', async () => {
    await createTestDB('roundtrip', [
      {
        name: 'users',
        keyPath: 'id',
        records: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
        ],
        indexes: [{ name: 'by_name', keyPath: 'name' }],
      },
    ]);

    const snapshots = await saveIndexedDB();
    expect(snapshots).toHaveLength(1);

    // Delete the original
    await deleteDB('roundtrip');

    // Restore from snapshot
    await restoreIndexedDB(snapshots);

    const records = await readAllRecords('roundtrip', 'users');
    expect(records).toHaveLength(2);
    expect(records).toContainEqual({ id: 1, name: 'Alice', active: true });
    expect(records).toContainEqual({ id: 2, name: 'Bob', active: false });
  });
});
