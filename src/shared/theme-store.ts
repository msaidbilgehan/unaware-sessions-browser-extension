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

export async function toggleTheme(): Promise<void> {
  const cycle: ThemePreference[] = ['light', 'dark', 'system'];
  const nextIndex = (cycle.indexOf(currentTheme) + 1) % cycle.length;
  currentTheme = cycle[nextIndex];
  applyTheme(currentTheme);
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME_PREFERENCE]: currentTheme });
  for (const listener of listeners) {
    listener(currentTheme);
  }
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
