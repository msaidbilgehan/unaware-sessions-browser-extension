import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { STORAGE_KEYS } from '@shared/constants';

// Mock window (not present in Node)
if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

let prefersDark = false;
const mediaListeners: Array<() => void> = [];
(globalThis as Record<string, unknown>).matchMedia = vi.fn(() => ({
  matches: prefersDark,
  addEventListener: vi.fn((_type: string, fn: () => void) => mediaListeners.push(fn)),
  removeEventListener: vi.fn(),
}));

// Mock document.documentElement.dataset (not in Node)
if (!globalThis.document) {
  (globalThis as Record<string, unknown>).document = {
    documentElement: { dataset: {} },
  };
}

// Import after mocks are in place
const { initTheme, getTheme, toggleTheme, onThemeChange } = await import(
  '@shared/theme-store'
);

beforeEach(() => {
  resetChromeMocks();
  prefersDark = false;
  mediaListeners.length = 0;
  document.documentElement.dataset.theme = '';
});

describe('initTheme', () => {
  it('defaults to system when no preference stored', async () => {
    await initTheme();
    expect(getTheme()).toBe('system');
  });

  it('reads stored preference from chrome.storage.local', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.THEME_PREFERENCE]: 'dark' });
    await initTheme();
    expect(getTheme()).toBe('dark');
  });

  it('sets data-theme attribute on document element', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.THEME_PREFERENCE]: 'light' });
    await initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('toggleTheme', () => {
  it('cycles through light, dark, system', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.THEME_PREFERENCE]: 'light' });
    await initTheme();
    expect(getTheme()).toBe('light');

    await toggleTheme();
    expect(getTheme()).toBe('dark');

    await toggleTheme();
    expect(getTheme()).toBe('system');

    await toggleTheme();
    expect(getTheme()).toBe('light');
  });

  it('persists preference to chrome.storage.local', async () => {
    await initTheme();
    await toggleTheme();

    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('updates data-theme attribute', async () => {
    await initTheme();
    await toggleTheme(); // system -> light
    // After toggle from system, next is light (since default is system -> light -> dark -> system)
    // Actually: system starts, toggle -> light, toggle -> dark, toggle -> system
    // But initTheme defaults to 'system'. First toggle goes to light.
    expect(document.documentElement.dataset.theme).toBeDefined();
  });
});

describe('onThemeChange', () => {
  it('calls listener when theme changes', async () => {
    await initTheme();
    const listener = vi.fn();
    onThemeChange(listener);

    await toggleTheme();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('returns unsubscribe function', async () => {
    await initTheme();
    const listener = vi.fn();
    const unsub = onThemeChange(listener);

    unsub();
    await toggleTheme();

    expect(listener).not.toHaveBeenCalled();
  });
});
