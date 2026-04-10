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

describe('out-of-line key stores (keyPath === null)', () => {
  it('snapshots explicit keys for out-of-line key stores', async () => {
    // Create a store with no keyPath — requires explicit keys on put()
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('outofline-db', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('data');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('data', 'readwrite');
        const store = tx.objectStore('data');
        store.put({ value: 'alpha' }, 'key-a');
        store.put({ value: 'beta' }, 'key-b');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(new Error('Failed'));
        };
      };
      req.onerror = () => reject(new Error('Failed to open'));
    });

    const snapshots = await saveIndexedDB();

    expect(snapshots).toHaveLength(1);
    const store = snapshots[0].objectStores[0];
    expect(store.keyPath).toBeNull();
    expect(store.keys).toBeDefined();
    expect(store.keys).toHaveLength(2);
    expect(store.records).toHaveLength(2);
    expect(store.allKeys).toHaveLength(2);
  });

  it('restores out-of-line key stores with explicit keys', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'outofline-restore',
      version: 1,
      objectStores: [
        {
          name: 'data',
          keyPath: null,
          autoIncrement: false,
          indexes: [],
          records: [{ value: 'alpha' }, { value: 'beta' }],
          keys: ['key-a', 'key-b'],
        },
      ],
    };

    await restoreIndexedDB([snapshot]);

    // Verify records were restored with correct keys
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('outofline-restore');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Failed'));
    });

    const tx = db.transaction('data', 'readonly');
    const store = tx.objectStore('data');

    const valA = await new Promise<unknown>((resolve) => {
      const r = store.get('key-a');
      r.onsuccess = () => resolve(r.result);
    });
    const valB = await new Promise<unknown>((resolve) => {
      const r = store.get('key-b');
      r.onsuccess = () => resolve(r.result);
    });

    expect(valA).toEqual({ value: 'alpha' });
    expect(valB).toEqual({ value: 'beta' });
    db.close();
  });

  it('round-trips out-of-line key stores through save-restore', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('outofline-rt', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('items');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put({ x: 10 }, 'mykey');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(new Error('Failed'));
        };
      };
      req.onerror = () => reject(new Error('Failed'));
    });

    const snapshots = await saveIndexedDB();
    await deleteDB('outofline-rt');
    await restoreIndexedDB(snapshots);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('outofline-rt');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Failed'));
    });

    const tx = db.transaction('items', 'readonly');
    const val = await new Promise<unknown>((resolve) => {
      const r = tx.objectStore('items').get('mykey');
      r.onsuccess = () => resolve(r.result);
    });

    expect(val).toEqual({ x: 10 });
    db.close();
  });
});

describe('encode/decode binary values (JSON round-trip safety)', () => {
  it('encodes and decodes records with Date values through save-restore', async () => {
    const timestamp = Date.now();
    await createTestDB('date-db', [
      {
        name: 'events',
        keyPath: 'id',
        records: [{ id: 1, createdAt: new Date(timestamp) }],
      },
    ]);

    const snapshots = await saveIndexedDB();

    // Simulate JSON round-trip (what chrome.runtime.sendMessage does)
    const jsonRoundTripped = JSON.parse(JSON.stringify(snapshots)) as IndexedDBSnapshot[];

    await deleteDB('date-db');
    await restoreIndexedDB(jsonRoundTripped);

    const records = await readAllRecords('date-db', 'events');
    expect(records).toHaveLength(1);
    const record = records[0] as { id: number; createdAt: Date };
    expect(record.id).toBe(1);
    // After encode → JSON → decode, the Date should be restored
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.createdAt.getTime()).toBe(timestamp);
  });

  it('preserves records with allKeys field after JSON round-trip', async () => {
    await createTestDB('allkeys-db', [
      {
        name: 'items',
        keyPath: 'id',
        records: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }],
      },
    ]);

    const snapshots = await saveIndexedDB();
    const store = snapshots[0].objectStores[0];

    // allKeys should be populated for all records
    expect(store.allKeys).toBeDefined();
    expect(store.allKeys).toHaveLength(2);

    // JSON round-trip should preserve encoded keys
    const jsonRoundTripped = JSON.parse(JSON.stringify(snapshots)) as IndexedDBSnapshot[];
    await deleteDB('allkeys-db');
    await restoreIndexedDB(jsonRoundTripped);

    const records = await readAllRecords('allkeys-db', 'items');
    expect(records).toHaveLength(2);
  });

  it('preserves nested objects with mixed types through JSON round-trip', async () => {
    await createTestDB('nested-db', [
      {
        name: 'data',
        keyPath: 'id',
        records: [
          {
            id: 1,
            meta: {
              count: 42,
              label: 'test',
              nested: { deep: true },
            },
            tags: ['a', 'b', 'c'],
          },
        ],
      },
    ]);

    const snapshots = await saveIndexedDB();
    const jsonRoundTripped = JSON.parse(JSON.stringify(snapshots)) as IndexedDBSnapshot[];
    await deleteDB('nested-db');
    await restoreIndexedDB(jsonRoundTripped);

    const records = await readAllRecords('nested-db', 'data');
    expect(records).toHaveLength(1);
    const rec = records[0] as Record<string, unknown>;
    expect(rec.id).toBe(1);
    expect((rec.meta as Record<string, unknown>).count).toBe(42);
    expect((rec.meta as Record<string, unknown>).label).toBe('test');
    expect(rec.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('restoreIndexedDB error handling', () => {
  it('skips records with invalid key path values gracefully', async () => {
    const snapshot: IndexedDBSnapshot = {
      name: 'invalid-key-db',
      version: 1,
      objectStores: [
        {
          name: 'store',
          keyPath: 'id',
          autoIncrement: false,
          indexes: [],
          // First record has valid key, second has undefined key path value
          records: [
            { id: 1, value: 'valid' },
            { notId: 'missing-key-field', value: 'invalid' },
          ],
        },
      ],
    };

    // Should not throw — skips the invalid record
    await restoreIndexedDB([snapshot]);

    const records = await readAllRecords('invalid-key-db', 'store');
    // Only the valid record should be restored
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ id: 1, value: 'valid' });
  });

  it('continues restoring other databases when one fails', async () => {
    const snapshots: IndexedDBSnapshot[] = [
      {
        name: 'good-db',
        version: 1,
        objectStores: [
          {
            name: 'data',
            keyPath: 'id',
            autoIncrement: false,
            indexes: [],
            records: [{ id: 1, v: 'ok' }],
          },
        ],
      },
      {
        name: 'bad-db',
        version: 1,
        objectStores: [
          {
            name: 'data',
            keyPath: 'id',
            autoIncrement: false,
            indexes: [],
            // All invalid records
            records: [{ noKey: true }, { noKey: true }],
          },
        ],
      },
    ];

    await restoreIndexedDB(snapshots);

    // Good DB should be fully restored
    const goodRecords = await readAllRecords('good-db', 'data');
    expect(goodRecords).toHaveLength(1);
    expect(goodRecords[0]).toEqual({ id: 1, v: 'ok' });

    // Bad DB should exist but have no records (all skipped)
    const badRecords = await readAllRecords('bad-db', 'data');
    expect(badRecords).toHaveLength(0);
  });
});
