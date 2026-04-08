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
