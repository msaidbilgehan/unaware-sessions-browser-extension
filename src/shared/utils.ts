import type { CookieSnapshot, StorageSnapshot } from '@shared/types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return '';
  }
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '';
  }
}

export function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function now(): number {
  return Date.now();
}

export function estimateCookieBytes(cookies: chrome.cookies.Cookie[]): number {
  let bytes = 0;
  for (const c of cookies) {
    bytes += c.name.length + c.value.length + c.domain.length + c.path.length + 40;
  }
  return bytes;
}

export function estimateRecordBytes(record: Record<string, string>): number {
  let bytes = 0;
  for (const key in record) {
    bytes += key.length + record[key].length + 6;
  }
  return bytes;
}

/** Rough serialized size of a cookie snapshot — used to size export/import chunks. */
export function estimateCookieSnapshotBytes(snapshot: CookieSnapshot): number {
  return estimateCookieBytes(snapshot.cookies) + snapshot.origin.length + 64;
}

/**
 * Rough serialized size of a storage snapshot. IndexedDB records dominate and
 * have no cheap length estimate, so stringify only that portion.
 */
export function estimateStorageSnapshotBytes(snapshot: StorageSnapshot): number {
  let bytes =
    estimateRecordBytes(snapshot.localStorage) +
    estimateRecordBytes(snapshot.sessionStorage) +
    snapshot.origin.length +
    64;
  if (snapshot.indexedDB && snapshot.indexedDB.length > 0) {
    bytes += JSON.stringify(snapshot.indexedDB).length;
  }
  return bytes;
}

/**
 * Greedily pack items into batches whose estimated byte size stays under
 * `budget`. Each batch holds at least one item, so a single oversized item
 * still makes progress (its transfer may then fail loudly rather than hang).
 */
export function batchByBytes<T>(
  items: readonly T[],
  sizeOf: (item: T) => number,
  budget: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && bytes + size > budget) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function buildCookieUrl(cookie: chrome.cookies.Cookie): string {
  const protocol = cookie.secure ? 'https' : 'http';
  const domain = cookie.domain.replace(/^\./, '');
  return `${protocol}://${domain}${cookie.path}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
