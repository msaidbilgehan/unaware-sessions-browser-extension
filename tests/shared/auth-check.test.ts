import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import { STORAGE_KEYS } from '@shared/constants';

const { initSecurity, resetSecurityInit, setupPasscode, verifyAndUnlock } =
  await import('@shared/security-store');
const { checkAuth } = await import('@shared/auth-check');

beforeEach(async () => {
  resetChromeMocks();
  resetSecurityInit();
  await initSecurity();
});

describe('checkAuth', () => {
  it('returns "not-needed" when security is disabled', async () => {
    const result = await checkAuth();
    expect(result).toBe('not-needed');
  });

  it('returns "auth-required" when passcode is enabled and no grace period', async () => {
    await setupPasscode('1234');
    const result = await checkAuth();
    expect(result).toBe('auth-required');
  });

  it('returns "grace-active" when passcode is enabled and grace period is active', async () => {
    await setupPasscode('1234');
    await verifyAndUnlock('1234');
    const result = await checkAuth();
    expect(result).toBe('grace-active');
  });

  it('returns "auth-required" when grace period has expired', async () => {
    await setupPasscode('1234');
    // Set an already-expired grace timestamp
    await chrome.storage.session.set({
      [STORAGE_KEYS.SECURITY_GRACE_UNTIL]: Date.now() - 1000,
    });
    const result = await checkAuth();
    expect(result).toBe('auth-required');
  });
});
