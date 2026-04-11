import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, sha256Hex, deriveKey } from '@shared/sync/crypto-engine';
import type { FullExportData } from '@shared/types';

const TEST_DATA: FullExportData = {
  version: 1,
  exportedAt: 1700000000000,
  sessions: [
    {
      id: 'sess-1',
      name: 'Test Session',
      color: '#3B82F6',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      settings: {},
    },
  ],
  cookieSnapshots: [
    {
      sessionId: 'sess-1',
      origin: 'https://example.com',
      timestamp: 1700000000000,
      cookies: [],
    },
  ],
  storageSnapshots: [],
};

describe('crypto-engine', () => {
  describe('deriveKey', () => {
    it('returns a CryptoKey', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey('test-passphrase', salt);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips with correct passphrase', async () => {
      const passphrase = 'my-secure-passphrase';
      const encrypted = await encrypt(TEST_DATA, passphrase);

      expect(encrypted.v).toBe(1);
      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.ct).toBeTruthy();

      const decrypted = await decrypt(encrypted, passphrase);
      expect(decrypted).toEqual(TEST_DATA);
    });

    it('throws on wrong passphrase', async () => {
      const encrypted = await encrypt(TEST_DATA, 'correct-passphrase');
      await expect(decrypt(encrypted, 'wrong-passphrase')).rejects.toThrow(
        'Decryption failed',
      );
    });

    it('produces different ciphertext for same data with same passphrase', async () => {
      const passphrase = 'same-passphrase';
      const enc1 = await encrypt(TEST_DATA, passphrase);
      const enc2 = await encrypt(TEST_DATA, passphrase);

      // Different IV/salt each time
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ct).not.toBe(enc2.ct);
    });

    it('encrypted payload has correct structure', async () => {
      const encrypted = await encrypt(TEST_DATA, 'test');

      expect(encrypted).toHaveProperty('v', 1);
      expect(typeof encrypted.salt).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.ct).toBe('string');
      expect(encrypted.salt.length).toBeGreaterThan(0);
      expect(encrypted.iv.length).toBeGreaterThan(0);
      expect(encrypted.ct.length).toBeGreaterThan(0);
    });
  });

  describe('sha256Hex', () => {
    it('produces known hash for "hello"', async () => {
      const hash = await sha256Hex('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await sha256Hex('input1');
      const hash2 = await sha256Hex('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('produces 64-character hex string', async () => {
      const hash = await sha256Hex('test');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
