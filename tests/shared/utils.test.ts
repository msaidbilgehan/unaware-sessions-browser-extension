import { describe, it, expect } from 'vitest';
import { generateId, extractOrigin, extractDomain, isValidUrl, buildCookieUrl } from '@shared/utils';

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
