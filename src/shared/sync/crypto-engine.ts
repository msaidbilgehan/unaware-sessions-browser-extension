import type { FullExportData } from '@shared/types';
import type { EncryptedPayload } from './sync-types';
import { saltToBase64, base64ToSalt } from '@shared/crypto-utils';

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(data: FullExportData, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    v: 1,
    salt: saltToBase64(salt),
    iv: saltToBase64(iv),
    ct: saltToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decrypt(
  payload: EncryptedPayload,
  passphrase: string,
): Promise<FullExportData> {
  const salt = base64ToSalt(payload.salt);
  const iv = base64ToSalt(payload.iv);
  const ciphertext = base64ToSalt(payload.ct);
  const key = await deriveKey(passphrase, salt);

  let decrypted: ArrayBuffer;
  try {
    const ivBuffer = new Uint8Array(iv).buffer as ArrayBuffer;
    const ctBuffer = new Uint8Array(ciphertext).buffer as ArrayBuffer;
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      ctBuffer,
    );
  } catch {
    throw new Error('Decryption failed — encryption key mismatch or corrupted data');
  }

  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as FullExportData;
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
