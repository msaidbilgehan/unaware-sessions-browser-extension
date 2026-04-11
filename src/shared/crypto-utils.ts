const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const HASH_BIT_LENGTH = 256;

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export async function hashPasscode(passcode: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BIT_LENGTH,
  );
  return bufferToHex(new Uint8Array(derived));
}

export async function verifyPasscode(
  passcode: string,
  salt: Uint8Array,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await hashPasscode(passcode, salt);
  return constantTimeEqual(actualHash, expectedHash);
}

export function saltToBase64(salt: Uint8Array): string {
  let binary = '';
  for (const byte of salt) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToSalt(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToHex(buffer: Uint8Array): string {
  let hex = '';
  for (const byte of buffer) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
