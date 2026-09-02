/**
 * Shared IndexedDB plumbing for the two snapshot stores.
 *
 * These databases hold data that exists nowhere else — a snapshot write that
 * fails, or a read that never settles, is indistinguishable from data loss.
 * Every failure mode here must therefore surface as a rejected promise with a
 * message that names the operation and the underlying DOMException.
 */

function describeError(error: DOMException | null): string {
  if (!error) return 'unknown error';
  return error.name ? `${error.name}: ${error.message}` : error.message;
}

/**
 * Reject the surrounding promise on both `error` and `abort`.
 *
 * A transaction can end without ever firing `error`: an exception thrown in a
 * cursor callback, an explicit abort, or Chrome tearing down the connection
 * all fire `abort` only. With just an `onerror` handler the promise never
 * settles, so the message handler never responds and the caller hangs until
 * the service worker is torn down — which surfaces to the user as "the
 * extension stopped working", with nothing in the logs to say why.
 */
export function rejectOnTxFailure(
  tx: IDBTransaction,
  reject: (reason: Error) => void,
  operation: string,
): void {
  tx.onerror = () => reject(new Error(`${operation} failed: ${describeError(tx.error)}`));
  tx.onabort = () => reject(new Error(`${operation} aborted: ${describeError(tx.error)}`));
}

/** True when a rejection was Chrome refusing the write for lack of quota. */
export function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('QuotaExceeded');
}

/**
 * Open (and upgrade) a snapshot database.
 *
 * `onInvalidate` fires when the returned connection stops being usable. A
 * cached `IDBDatabase` outlives the connection it points at: Chrome closes it
 * on eviction, on profile-level storage clearing, and on a version change
 * from another extension context, after which every `transaction()` call
 * throws `InvalidStateError` for the rest of the service worker's life.
 * Dropping the cached handle lets the next call reopen instead.
 */
export function openSnapshotDb(
  dbName: string,
  storeNames: readonly string[],
  version: number,
  onInvalidate: () => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of storeNames) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => onInvalidate();
      db.onversionchange = () => {
        db.close();
        onInvalidate();
      };
      resolve(db);
    };

    request.onerror = () =>
      reject(new Error(`Failed to open ${dbName}: ${describeError(request.error)}`));
    request.onblocked = () =>
      reject(new Error(`Failed to open ${dbName}: blocked by another open connection`));
  });
}
