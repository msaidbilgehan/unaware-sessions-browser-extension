import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
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
    const entry = getTabEntry(1);
    expect(entry).toEqual({ sessionId: 'session-1', origin: 'https://example.com' });
  });

  it('unassigns a tab', async () => {
    await assignTab(1, 'session-1', 'https://example.com');
    await unassignTab(1);
    expect(getTabEntry(1)).toBeUndefined();
  });

  it('returns undefined for untracked tab', () => {
    expect(getTabEntry(999)).toBeUndefined();
  });

  it('finds all tabs for a session', async () => {
    await assignTab(1, 'session-1', 'https://a.com');
    await assignTab(2, 'session-1', 'https://b.com');
    await assignTab(3, 'session-2', 'https://c.com');

    const tabs = getTabsForSession('session-1');
    expect(tabs).toEqual([1, 2]);
  });

  it('persists and hydrates tab map', async () => {
    await assignTab(1, 'session-1', 'https://example.com');
    await persistTabMap();

    // Simulate SW restart
    await hydrateTabMap();

    const entry = getTabEntry(1);
    expect(entry).toEqual({ sessionId: 'session-1', origin: 'https://example.com' });
  });

  it('registers tab event listeners', () => {
    initTabTracker();
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
  });
});
