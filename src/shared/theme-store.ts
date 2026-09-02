import { STORAGE_KEYS } from '@shared/constants';

export type ThemePreference = 'light' | 'dark' | 'system';

let currentTheme: ThemePreference = 'system';
const listeners: Array<(theme: ThemePreference) => void> = [];

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
}

export function getTheme(): ThemePreference {
  return currentTheme;
}

export function onThemeChange(listener: (theme: ThemePreference) => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/**
 * Apply a theme directly.
 *
 * Callers that know the target preference must use this rather than cycling
 * with {@link toggleTheme}: every intermediate step of a cycle repaints the
 * document and writes storage, so picking "system" from "light" would flash
 * dark on the way through.
 */
export async function setTheme(preference: ThemePreference): Promise<void> {
  if (currentTheme === preference) return;
  currentTheme = preference;
  applyTheme(currentTheme);
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME_PREFERENCE]: currentTheme });
  for (const listener of listeners) {
    listener(currentTheme);
  }
}

export async function toggleTheme(): Promise<void> {
  const cycle: ThemePreference[] = ['light', 'dark', 'system'];
  const nextIndex = (cycle.indexOf(currentTheme) + 1) % cycle.length;
  await setTheme(cycle[nextIndex]);
}

export async function initTheme(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.THEME_PREFERENCE);
  const stored = result[STORAGE_KEYS.THEME_PREFERENCE] as ThemePreference | undefined;
  currentTheme = stored ?? 'system';
  applyTheme(currentTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}
