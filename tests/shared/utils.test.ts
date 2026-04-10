import { describe, it, expect } from 'vitest';
import {
  generateId,
  extractOrigin,
  extractDomain,
  isValidUrl,
  buildCookieUrl,
  formatRelativeTime,
  estimateCookieBytes,
  estimateRecordBytes,
} from '@shared/utils';

describe('generateId', () => {
  it('returns a valid UUID v4 string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('extractOrigin', () => {
  it('extracts origin from a full URL', () => {
    expect(extractOrigin('https://mail.google.com/mail/u/0')).toBe('https://mail.google.com');
  });

  it('includes port when non-standard', () => {
    expect(extractOrigin('http://localhost:3000/path')).toBe('http://localhost:3000');
  });

  it('returns empty string for invalid URLs', () => {
    expect(extractOrigin('')).toBe('');
    expect(extractOrigin('not-a-url')).toBe('');
  });
});

describe('extractDomain', () => {
  it('extracts hostname from URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('www.example.com');
  });

  it('extracts hostname with port', () => {
    expect(extractDomain('http://localhost:8080')).toBe('localhost');
  });

  it('returns empty string for invalid URLs', () => {
    expect(extractDomain('')).toBe('');
  });
});

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects chrome:// URLs', () => {
    expect(isValidUrl('chrome://extensions')).toBe(false);
  });

  it('rejects about: URLs', () => {
    expect(isValidUrl('about:blank')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects non-URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('buildCookieUrl', () => {
  it('builds https URL for secure cookie', () => {
    const url = buildCookieUrl({
      domain: '.example.com',
      path: '/',
      secure: true,
    } as chrome.cookies.Cookie);
    expect(url).toBe('https://example.com/');
  });

  it('builds http URL for non-secure cookie', () => {
    const url = buildCookieUrl({
      domain: 'example.com',
      path: '/path',
      secure: false,
    } as chrome.cookies.Cookie);
    expect(url).toBe('http://example.com/path');
  });

  it('strips leading dot from domain', () => {
    const url = buildCookieUrl({
      domain: '.sub.example.com',
      path: '/',
      secure: true,
    } as chrome.cookies.Cookie);
    expect(url).toBe('https://sub.example.com/');
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps less than 5 seconds ago', () => {
    expect(formatRelativeTime(Date.now() - 2000)).toBe('just now');
  });

  it('returns seconds for timestamps less than 60 seconds ago', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('30s ago');
  });

  it('returns minutes for timestamps less than 60 minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('returns hours for timestamps less than 24 hours ago', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3600_000)).toBe('3h ago');
  });

  it('returns days for timestamps less than 7 days ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86400_000)).toBe('2d ago');
  });

  it('returns formatted date for timestamps older than 7 days', () => {
    const old = Date.now() - 10 * 86400_000;
    const result = formatRelativeTime(old);
    // Should be a locale date string, not relative
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });

  it('handles exactly 0 seconds difference', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });
});

describe('estimateCookieBytes', () => {
  it('estimates bytes for a cookie array', () => {
    const cookies = [
      { name: 'a', value: 'b', domain: 'c', path: '/' },
    ] as chrome.cookies.Cookie[];
    // 1 + 1 + 1 + 1 + 40 = 44
    expect(estimateCookieBytes(cookies)).toBe(44);
  });

  it('returns 0 for empty array', () => {
    expect(estimateCookieBytes([])).toBe(0);
  });
});

describe('estimateRecordBytes', () => {
  it('estimates bytes for a record', () => {
    const record = { key: 'val' };
    // 3 + 3 + 6 = 12
    expect(estimateRecordBytes(record)).toBe(12);
  });

  it('returns 0 for empty record', () => {
    expect(estimateRecordBytes({})).toBe(0);
  });
});
