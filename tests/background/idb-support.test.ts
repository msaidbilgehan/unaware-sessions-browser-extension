import { describe, it, expect } from 'vitest';
import { rejectOnTxFailure, isQuotaError, openSnapshotDb } from '@background/idb-support';

/** Minimal stand-in for the two event hooks the helper binds. */
function makeFakeTx(error: { name: string; message: string } | null) {
  return {
    error,
    onerror: null as null | (() => void),
    onabort: null as null | (() => void),
  };
}

describe('rejectOnTxFailure', () => {
  it('rejects when the transaction errors', async () => {
    const tx = makeFakeTx({ name: 'QuotaExceededError', message: 'no space' });
    const promise = new Promise<void>((_resolve, reject) => {
      rejectOnTxFailure(tx as unknown as IDBTransaction, reject, 'Failed to save');
    });

    tx.onerror?.();

    await expect(promise).rejects.toThrow(/Failed to save failed: QuotaExceededError: no space/);
  });

  // An exception thrown inside a cursor callback, an explicit abort, or Chrome
  // tearing down the connection fires 'abort' only. Without this the promise
  // never settled and the caller hung until the service worker died.
  it('rejects when the transaction aborts without an error event', async () => {
    const tx = makeFakeTx(null);
    const promise = new Promise<void>((_resolve, reject) => {
      rejectOnTxFailure(tx as unknown as IDBTransaction, reject, 'Failed to load');
    });

    tx.onabort?.();

    await expect(promise).rejects.toThrow(/Failed to load aborted: unknown error/);
  });
});

describe('isQuotaError', () => {
  it('identifies quota rejections', () => {
    expect(isQuotaError(new Error('Failed to save failed: QuotaExceededError: over quota'))).toBe(
      true,
    );
  });

  it('does not flag unrelated failures', () => {
    expect(isQuotaError(new Error('Failed to save aborted: unknown error'))).toBe(false);
    expect(isQuotaError('some string')).toBe(false);
  });
});

describe('openSnapshotDb', () => {
  it('creates the object store and resolves a usable connection', async () => {
    const db = await openSnapshotDb('idb-support-test', ['snapshots'], 1, () => {});
    expect(db.objectStoreNames.contains('snapshots')).toBe(true);
    db.close();
  });

  it('creates every requested object store', async () => {
    const db = await openSnapshotDb('idb-support-multi-test', ['cookies', 'storage'], 1, () => {});
    expect(db.objectStoreNames.contains('cookies')).toBe(true);
    expect(db.objectStoreNames.contains('storage')).toBe(true);
    db.close();
  });
});
