import { init, register, getLocaleFromNavigator, locale, waitLocale } from 'svelte-i18n';

const STORAGE_KEY = 'languagePreference';

register('en', () => import('./en.json'));
register('zh', () => import('./zh.json'));
register('de', () => import('./de.json'));
register('ja', () => import('./ja.json'));

function getInitialLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['en', 'zh', 'de', 'ja'].includes(stored)) return stored;
  } catch {
    // localStorage may not be available in service worker
  }

  const nav = getLocaleFromNavigator();
  if (nav?.startsWith('zh')) return 'zh';
  if (nav?.startsWith('de')) return 'de';
  if (nav?.startsWith('ja')) return 'ja';
  return 'en';
}

init({
  fallbackLocale: 'en',
  initialLocale: getInitialLocale(),
});

export async function setLocale(lang: string): Promise<void> {
  locale.set(lang);
  await waitLocale();
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors in service worker
  }
}

export function getCurrentLocale(): string {
  let current = 'en';
  const unsub = locale.subscribe((v) => {
    current = v ?? 'en';
  });
  unsub();
  return current;
}

export { locale, waitLocale } from 'svelte-i18n';

/**
 * In Svelte 5 runes mode, `$_()` from svelte-i18n doesn't automatically
 * trigger re-renders. Import `locale` in each component and reference it
 * in the template to force reactivity:
 *
 *   import { locale } from '@shared/i18n';
 *   {$locale} <!-- invisible, but forces re-render on locale change -->
 *
 * Or subscribe via `$effect`:
 *   $effect(() => { void $locale; });
 */
