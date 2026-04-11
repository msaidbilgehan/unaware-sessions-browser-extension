import { STORAGE_KEYS, DEFAULT_SECURITY_CONFIG } from '@shared/constants';
import type { SecurityConfig, GracePeriodMs } from '@shared/types';
import {
  generateSalt,
  hashPasscode,
  verifyPasscode,
  saltToBase64,
  base64ToSalt,
} from '@shared/crypto-utils';

let securityConfig: SecurityConfig = { ...DEFAULT_SECURITY_CONFIG };
const listeners: Array<(config: SecurityConfig) => void> = [];

// ── Getters ─────────────────────────────────────────────────────

export function getSecurityConfig(): SecurityConfig {
  return securityConfig;
}

export function isPasscodeEnabled(): boolean {
  return securityConfig.passcodeEnabled;
}

export function isBiometricEnabled(): boolean {
  return securityConfig.biometricEnabled;
}

export function isSecurityEnabled(): boolean {
  return securityConfig.passcodeEnabled || securityConfig.biometricEnabled;
}

export function getGracePeriodMs(): GracePeriodMs {
  return securityConfig.gracePeriodMs;
}

export async function isGracePeriodActive(): Promise<boolean> {
  const result = await chrome.storage.session.get(STORAGE_KEYS.SECURITY_GRACE_UNTIL);
  const graceUntil = result[STORAGE_KEYS.SECURITY_GRACE_UNTIL] as number | undefined;
  return typeof graceUntil === 'number' && graceUntil > Date.now();
}

// ── Listeners ───────────────────────────────────────────────────

export function onSecurityChange(listener: (config: SecurityConfig) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(securityConfig);
  }
}

// ── Persistence Helper ──────────────────────────────────────────

async function persistConfig(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SECURITY_CONFIG]: securityConfig,
  });
}

// ── Passcode ────────────────────────────────────────────────────

export async function setupPasscode(passcode: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPasscode(passcode, salt);
  securityConfig = {
    ...securityConfig,
    passcodeEnabled: true,
    passcodeHash: hash,
    passcodeSalt: saltToBase64(salt),
  };
  await persistConfig();
  notifyListeners();
}

export async function removePasscode(): Promise<void> {
  securityConfig = {
    ...securityConfig,
    passcodeEnabled: false,
    passcodeHash: '',
    passcodeSalt: '',
  };
  await persistConfig();
  if (!securityConfig.biometricEnabled) {
    await chrome.storage.session.remove(STORAGE_KEYS.SECURITY_GRACE_UNTIL);
  }
  notifyListeners();
}

export async function changePasscode(newPasscode: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPasscode(newPasscode, salt);
  securityConfig = {
    ...securityConfig,
    passcodeHash: hash,
    passcodeSalt: saltToBase64(salt),
  };
  await persistConfig();
  notifyListeners();
}

export async function verifyAndUnlock(passcode: string): Promise<boolean> {
  if (!securityConfig.passcodeEnabled) return false;
  const salt = base64ToSalt(securityConfig.passcodeSalt);
  const valid = await verifyPasscode(passcode, salt, securityConfig.passcodeHash);
  if (valid) {
    await grantGracePeriod();
  }
  return valid;
}

// ── Biometric ───────────────────────────────────────────────────

export async function isBiometricAvailable(): Promise<boolean> {
  if (
    typeof PublicKeyCredential === 'undefined' ||
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export async function setupBiometric(): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Unaware Sessions', id: chrome.runtime.id },
        user: {
          id: new TextEncoder().encode('unaware-sessions-user'),
          name: 'Extension User',
          displayName: 'Extension User',
        },
        challenge,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;

    const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    securityConfig = {
      ...securityConfig,
      biometricEnabled: true,
      biometricCredentialId: credentialId,
    };
    await persistConfig();
    notifyListeners();
    return true;
  } catch {
    return false;
  }
}

export async function removeBiometric(): Promise<void> {
  securityConfig = {
    ...securityConfig,
    biometricEnabled: false,
    biometricCredentialId: '',
  };
  await persistConfig();
  if (!securityConfig.passcodeEnabled) {
    await chrome.storage.session.remove(STORAGE_KEYS.SECURITY_GRACE_UNTIL);
  }
  notifyListeners();
}

export async function verifyBiometric(): Promise<boolean> {
  if (!securityConfig.biometricEnabled || !securityConfig.biometricCredentialId) return false;
  try {
    const rawId = Uint8Array.from(atob(securityConfig.biometricCredentialId), (c) =>
      c.charCodeAt(0),
    );
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: rawId, type: 'public-key', transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
        rpId: chrome.runtime.id,
      },
    });

    if (!assertion) return false;

    await grantGracePeriod();
    return true;
  } catch {
    return false;
  }
}

// ── Grace Period ────────────────────────────────────────────────

export async function grantGracePeriod(): Promise<void> {
  const graceUntil = Date.now() + securityConfig.gracePeriodMs;
  await chrome.storage.session.set({
    [STORAGE_KEYS.SECURITY_GRACE_UNTIL]: graceUntil,
  });
}

export async function setGracePeriodDuration(ms: GracePeriodMs): Promise<void> {
  securityConfig = { ...securityConfig, gracePeriodMs: ms };
  await persistConfig();
  notifyListeners();
}

// ── Reset ───────────────────────────────────────────────────────

export async function resetSecurity(): Promise<void> {
  securityConfig = { ...DEFAULT_SECURITY_CONFIG };
  await persistConfig();
  await chrome.storage.session.remove(STORAGE_KEYS.SECURITY_GRACE_UNTIL);
  notifyListeners();
}

// ── Initialization ──────────────────────────────────────────────

let initialized = false;

/** Reset init guard — for tests only. */
export function resetSecurityInit(): void {
  initialized = false;
  securityConfig = { ...DEFAULT_SECURITY_CONFIG };
}

export async function initSecurity(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_CONFIG);
  const stored = result[STORAGE_KEYS.SECURITY_CONFIG] as SecurityConfig | undefined;
  securityConfig = stored ? { ...DEFAULT_SECURITY_CONFIG, ...stored } : { ...DEFAULT_SECURITY_CONFIG };

  notifyListeners();

  if (initialized) return;
  initialized = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (STORAGE_KEYS.SECURITY_CONFIG in changes) {
      const updated = changes[STORAGE_KEYS.SECURITY_CONFIG].newValue as
        | SecurityConfig
        | undefined;
      securityConfig = updated
        ? { ...DEFAULT_SECURITY_CONFIG, ...updated }
        : { ...DEFAULT_SECURITY_CONFIG };
      notifyListeners();
    }
  });
}
