import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { STORAGE_KEYS, DEFAULT_SECURITY_CONFIG } from '@shared/constants';
import type { SecurityConfig } from '@shared/types';

const {
  initSecurity,
  resetSecurityInit,
  getSecurityConfig,
  isPasscodeEnabled,
  isBiometricEnabled,
  isSecurityEnabled,
  getGracePeriodMs,
  isGracePeriodActive,
  setupPasscode,
  removePasscode,
  changePasscode,
  verifyAndUnlock,
  grantGracePeriod,
  setGracePeriodDuration,
  resetSecurity,
  onSecurityChange,
} = await import('@shared/security-store');

let unsubs: Array<() => void> = [];

beforeEach(async () => {
  for (const unsub of unsubs) unsub();
  unsubs = [];
  resetChromeMocks();
  resetSecurityInit();
  await initSecurity();
});

describe('initSecurity', () => {
  it('defaults to DEFAULT_SECURITY_CONFIG when storage is empty', () => {
    expect(getSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
  });

  it('loads stored config from chrome.storage.local', async () => {
    const stored: SecurityConfig = {
      ...DEFAULT_SECURITY_CONFIG,
      passcodeEnabled: true,
      passcodeHash: 'abc',
      passcodeSalt: 'def',
      gracePeriodMs: 600000,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_CONFIG]: stored });
    resetSecurityInit();
    await initSecurity();

    expect(isPasscodeEnabled()).toBe(true);
    expect(getGracePeriodMs()).toBe(600000);
  });

  it('merges stored config with defaults for missing fields', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SECURITY_CONFIG]: { passcodeEnabled: true },
    });
    resetSecurityInit();
    await initSecurity();

    expect(isPasscodeEnabled()).toBe(true);
    expect(getSecurityConfig().biometricEnabled).toBe(false);
    expect(getSecurityConfig().gracePeriodMs).toBe(300000);
  });
});

describe('getters', () => {
  it('isSecurityEnabled returns false when nothing is enabled', () => {
    expect(isSecurityEnabled()).toBe(false);
  });

  it('isSecurityEnabled returns true when passcode is enabled', async () => {
    await setupPasscode('1234');
    expect(isSecurityEnabled()).toBe(true);
  });
});

describe('setupPasscode', () => {
  it('enables passcode and stores hash + salt', async () => {
    await setupPasscode('4321');
    expect(isPasscodeEnabled()).toBe(true);
    const config = getSecurityConfig();
    expect(config.passcodeHash).toBeTruthy();
    expect(config.passcodeSalt).toBeTruthy();
    expect(config.passcodeHash.length).toBe(64); // 256-bit hex
  });

  it('persists to chrome.storage.local', async () => {
    await setupPasscode('1111');
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});

describe('verifyAndUnlock', () => {
  it('returns true for correct passcode', async () => {
    await setupPasscode('5678');
    const result = await verifyAndUnlock('5678');
    expect(result).toBe(true);
  });

  it('returns false for incorrect passcode', async () => {
    await setupPasscode('5678');
    const result = await verifyAndUnlock('0000');
    expect(result).toBe(false);
  });

  it('returns false when passcode is not enabled', async () => {
    const result = await verifyAndUnlock('1234');
    expect(result).toBe(false);
  });

  it('grants grace period on success', async () => {
    await setupPasscode('1234');
    await verifyAndUnlock('1234');
    expect(chrome.storage.session.set).toHaveBeenCalled();
    const active = await isGracePeriodActive();
    expect(active).toBe(true);
  });

  it('does not grant grace period on failure', async () => {
    await setupPasscode('1234');
    await verifyAndUnlock('0000');
    const active = await isGracePeriodActive();
    expect(active).toBe(false);
  });
});

describe('removePasscode', () => {
  it('disables passcode and clears hash/salt', async () => {
    await setupPasscode('1234');
    await removePasscode();
    expect(isPasscodeEnabled()).toBe(false);
    expect(getSecurityConfig().passcodeHash).toBe('');
    expect(getSecurityConfig().passcodeSalt).toBe('');
  });
});

describe('changePasscode', () => {
  it('updates the hash and salt', async () => {
    await setupPasscode('1234');
    const oldHash = getSecurityConfig().passcodeHash;
    await changePasscode('5678');
    expect(getSecurityConfig().passcodeHash).not.toBe(oldHash);

    const valid = await verifyAndUnlock('5678');
    expect(valid).toBe(true);
    const invalid = await verifyAndUnlock('1234');
    expect(invalid).toBe(false);
  });
});

describe('grace period', () => {
  it('isGracePeriodActive returns false when no grace is set', async () => {
    const active = await isGracePeriodActive();
    expect(active).toBe(false);
  });

  it('isGracePeriodActive returns true within grace window', async () => {
    await grantGracePeriod();
    const active = await isGracePeriodActive();
    expect(active).toBe(true);
  });

  it('isGracePeriodActive returns false after grace expires', async () => {
    // Set a grace period that already expired
    await chrome.storage.session.set({
      [STORAGE_KEYS.SECURITY_GRACE_UNTIL]: Date.now() - 1000,
    });
    const active = await isGracePeriodActive();
    expect(active).toBe(false);
  });
});

describe('setGracePeriodDuration', () => {
  it('updates the grace period and persists', async () => {
    await setGracePeriodDuration(60000);
    expect(getGracePeriodMs()).toBe(60000);
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });
});

describe('resetSecurity', () => {
  it('clears all security config', async () => {
    await setupPasscode('1234');
    await resetSecurity();
    expect(isPasscodeEnabled()).toBe(false);
    expect(isBiometricEnabled()).toBe(false);
    expect(getSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
  });

  it('clears grace period from session storage', async () => {
    await grantGracePeriod();
    await resetSecurity();
    expect(chrome.storage.session.remove).toHaveBeenCalledWith(
      STORAGE_KEYS.SECURITY_GRACE_UNTIL,
    );
  });
});

describe('listeners', () => {
  it('notifies listeners on setupPasscode', async () => {
    const listener = vi.fn();
    unsubs.push(onSecurityChange(listener));
    await setupPasscode('1234');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].passcodeEnabled).toBe(true);
  });

  it('unsubscribe stops notifications', async () => {
    const listener = vi.fn();
    const unsub = onSecurityChange(listener);
    unsub();
    await setupPasscode('1234');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('cross-context sync', () => {
  it('updates in-memory config when storage changes externally', () => {
    const updated: SecurityConfig = {
      ...DEFAULT_SECURITY_CONFIG,
      passcodeEnabled: true,
      passcodeHash: 'external-hash',
      passcodeSalt: 'external-salt',
    };

    // Simulate external storage change
    mockChrome.storage.onChanged._fire(
      { [STORAGE_KEYS.SECURITY_CONFIG]: { newValue: updated } },
      'local',
    );

    expect(isPasscodeEnabled()).toBe(true);
    expect(getSecurityConfig().passcodeHash).toBe('external-hash');
  });

  it('ignores changes from non-local area', () => {
    mockChrome.storage.onChanged._fire(
      { [STORAGE_KEYS.SECURITY_CONFIG]: { newValue: { ...DEFAULT_SECURITY_CONFIG, passcodeEnabled: true } } },
      'session',
    );

    expect(isPasscodeEnabled()).toBe(false);
  });
});
