import { isSecurityEnabled, isGracePeriodActive } from '@shared/security-store';

export type AuthCheckResult = 'not-needed' | 'grace-active' | 'auth-required';

export async function checkAuth(): Promise<AuthCheckResult> {
  if (!isSecurityEnabled()) return 'not-needed';
  if (await isGracePeriodActive()) return 'grace-active';
  return 'auth-required';
}
