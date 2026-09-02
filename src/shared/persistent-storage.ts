/**
 * Persistent-storage requests for the quota-managed bucket that holds the
 * cookie and DOM-storage snapshots.
 *
 * `StorageManager.persist()` is exposed on Window only — not in workers — so
 * these run from the options page rather than the service worker. With the
 * `unlimitedStorage` permission Chrome already exempts the extension from
 * quota and eviction and the request resolves without prompting; the call
 * stays as a second line of defence (and for browsers that treat the
 * permission differently).
 */

export type PersistenceState = 'persisted' | 'not-persisted' | 'unsupported';

export async function getPersistenceState(): Promise<PersistenceState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return 'unsupported';
  }
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}

export async function requestPersistentStorage(): Promise<PersistenceState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return 'unsupported';
  }
  try {
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}
