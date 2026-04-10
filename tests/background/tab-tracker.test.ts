import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import {
  assignTab,
  unassignTab,
  getTabEntry,
  getTabsForSession,
  hydrateTabMap,
  persistTabMap,
  initTabTracker,
} from '@background/tab-tracker';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateTabMap();
});

describe('tab-tracker', () => {
  it('assigns a tab to a session', async () => {
    await assignTab(1, 'session-1', 'https://example.com');
    const entry = await getTabEntry(1);
    expect(entry).toEqual({ sessionId: 'session-1', origin: 'https://example.com' });
  });

  it('unassigns a tab', async () => {
    await assignTab(1, 'session-1', 'https://example.com');
    await unassignTab(1);
    expect(await getTabEntry(1)).toBeUndefined();
  });

  it('returns undefined for untracked tab', async () => {
    expect(await getTabEntry(999)).toBeUndefined();
  });

  it('finds all tabs for a session', async () => {
    await assignTab(1, 'session-1', 'https://a.com');
    await assignTab(2, 'session-1', 'https://b.com');
    await assignTab(3, 'session-2', 'https://c.com');

    const tabs = await getTabsForSession('session-1');
    expect(tabs).toEqual([1, 2]);
  });

  it('persists and hydrates tab map', async () => {
    await assignTab(1, 'session-1', 'https://example.com');
    await persistTabMap();

    // Simulate SW restart
    await hydrateTabMap();

    const entry = await getTabEntry(1);
    expect(entry).toEqual({ sessionId: 'session-1', origin: 'https://example.com' });
  });

  it('registers tab event listeners', () => {
    initTabTracker();
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
  });
});

describe('tab-tracker event handlers', () => {
  beforeEach(() => {
    initTabTracker();
  });

  it('removes tab entry when tab is closed', async () => {
    await assignTab(1, 'session-1', 'https://example.com');

    // Fire onRemoved event
    mockChrome.tabs.onRemoved._fire(1, { windowId: 1, isWindowClosing: false });

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(await getTabEntry(1)).toBeUndefined();
  });

  it('ignores onRemoved for untracked tabs', async () => {
    await assignTab(1, 'session-1', 'https://example.com');

    mockChrome.tabs.onRemoved._fire(999, { windowId: 1, isWindowClosing: false });
    await new Promise((r) => setTimeout(r, 10));

    // Tab 1 should be unaffected
    expect(await getTabEntry(1)).toBeDefined();
  });

  it('updates origin when tab navigates to new origin', async () => {
    await assignTab(1, 'session-1', 'https://example.com');

    mockChrome.tabs.onUpdated._fire(
      1,
      { url: 'https://other.com/page' },
      { id: 1, url: 'https://other.com/page' },
    );
    await new Promise((r) => setTimeout(r, 10));

    const entry = await getTabEntry(1);
    expect(entry?.origin).toBe('https://other.com');
    expect(entry?.sessionId).toBe('session-1');
  });

  it('does not update origin for same-origin navigation', async () => {
    await assignTab(1, 'session-1', 'https://example.com');

    mockChrome.tabs.onUpdated._fire(
      1,
      { url: 'https://example.com/other-page' },
      { id: 1, url: 'https://example.com/other-page' },
    );
    await new Promise((r) => setTimeout(r, 10));

    const entry = await getTabEntry(1);
    expect(entry?.origin).toBe('https://example.com');
  });

  it('ignores tab updates for untracked tabs', async () => {
    mockChrome.tabs.onUpdated._fire(
      999,
      { url: 'https://example.com' },
      { id: 999, url: 'https://example.com' },
    );
    await new Promise((r) => setTimeout(r, 10));

    expect(await getTabEntry(999)).toBeUndefined();
  });

  it('ignores tab updates without URL change', async () => {
    await assignTab(1, 'session-1', 'https://example.com');

    mockChrome.tabs.onUpdated._fire(1, { status: 'complete' }, { id: 1, url: 'https://example.com' });
    await new Promise((r) => setTimeout(r, 10));

    // Origin unchanged
    const entry = await getTabEntry(1);
    expect(entry?.origin).toBe('https://example.com');
  });

  it('returns a copy of all tab entries', async () => {
    const { getAllTabEntries } = await import('@background/tab-tracker');
    await assignTab(1, 's1', 'https://a.com');
    await assignTab(2, 's2', 'https://b.com');

    const entries = await getAllTabEntries();
    expect(entries.size).toBe(2);
    expect(entries.get(1)?.sessionId).toBe('s1');
    expect(entries.get(2)?.sessionId).toBe('s2');
  });
});
