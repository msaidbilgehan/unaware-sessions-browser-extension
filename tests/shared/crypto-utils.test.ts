import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  hashPasscode,
  verifyPasscode,
  saltToBase64,
  base64ToSalt,
} from '@shared/crypto-utils';

describe('generateSalt', () => {
  it('produces a 16-byte Uint8Array', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('produces different output on each call', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toEqual(b);
  });
});

describe('hashPasscode', () => {
  it('returns a 64-character hex string', async () => {
    const salt = generateSalt();
    const hash = await hashPasscode('1234', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same passcode and salt', async () => {
    const salt = generateSalt();
    const hash1 = await hashPasscode('5678', salt);
    const hash2 = await hashPasscode('5678', salt);
    expect(hash1).toBe(hash2);
  });

  it('differs for different passcodes with the same salt', async () => {
    const salt = generateSalt();
    const hash1 = await hashPasscode('1234', salt);
    const hash2 = await hashPasscode('5678', salt);
    expect(hash1).not.toBe(hash2);
  });

  it('differs for the same passcode with different salts', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const hash1 = await hashPasscode('1234', salt1);
    const hash2 = await hashPasscode('1234', salt2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPasscode', () => {
  it('returns true for a correct passcode', async () => {
    const salt = generateSalt();
    const hash = await hashPasscode('9999', salt);
    const result = await verifyPasscode('9999', salt, hash);
    expect(result).toBe(true);
  });

  it('returns false for an incorrect passcode', async () => {
    const salt = generateSalt();
    const hash = await hashPasscode('9999', salt);
    const result = await verifyPasscode('0000', salt, hash);
    expect(result).toBe(false);
  });

  it('returns false when hash length differs', async () => {
    const salt = generateSalt();
    const result = await verifyPasscode('1234', salt, 'short');
    expect(result).toBe(false);
  });
});

describe('saltToBase64 / base64ToSalt', () => {
  it('round-trips correctly', () => {
    const original = generateSalt();
    const encoded = saltToBase64(original);
    const decoded = base64ToSalt(encoded);
    expect(decoded).toEqual(original);
  });

  it('produces a non-empty base64 string', () => {
    const salt = generateSalt();
    const b64 = saltToBase64(salt);
    expect(b64.length).toBeGreaterThan(0);
    // base64 alphabet check
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
