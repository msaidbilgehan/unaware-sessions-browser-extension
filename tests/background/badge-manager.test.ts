import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import { updateBadge, initBadgeManager } from '@background/badge-manager';
import { assignTab, hydrateTabMap } from '@background/tab-tracker';
import { createSession, hydrateSessions } from '@background/session-manager';
import { initSyncStore, setSyncConfig, resetSyncStoreInit } from '@shared/sync/sync-store';
import type { ConflictEntry } from '@shared/sync/sync-types';

beforeEach(async () => {
  resetChromeMocks();
  resetSyncStoreInit();
  await hydrateSessions();
  await hydrateTabMap();
});

describe('updateBadge', () => {
  it('sets badge text and color for assigned tab', async () => {
    const session = await createSession('WorkTab', '#3B82F6');
    await assignTab(1, session.id, 'https://example.com');

    await updateBadge(1);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
      text: 'WO',
      tabId: 1,
    });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#3B82F6',
      tabId: 1,
    });
  });

  it('clears badge for unassigned tab', async () => {
    await updateBadge(999);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
      text: '',
      tabId: 999,
    });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('clears badge when session no longer exists', async () => {
    // Assign tab to a session that doesn't exist in the map
    await assignTab(5, 'deleted-session-id', 'https://example.com');

    await updateBadge(5);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
      text: '',
      tabId: 5,
    });
  });

  it('abbreviates session name to 2 uppercase chars', async () => {
    const session = await createSession('mySession', '#EF4444');
    await assignTab(10, session.id, 'https://example.com');

    await updateBadge(10);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
      text: 'MY',
      tabId: 10,
    });
  });

  it('handles single-character session name', async () => {
    const session = await createSession('X', '#10B981');
    await assignTab(11, session.id, 'https://example.com');

    await updateBadge(11);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({
      text: 'X',
      tabId: 11,
    });
  });
});

describe('initBadgeManager', () => {
  it('registers tab event listeners', () => {
    initBadgeManager();

    expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
  });

  it('updates badge on tab activation', async () => {
    const { mockChrome } = await import('../setup');
    const session = await createSession('Active', '#10B981');
    await assignTab(7, session.id, 'https://example.com');

    initBadgeManager();

    mockChrome.tabs.onActivated._fire({ tabId: 7, windowId: 1 });
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'AC', tabId: 7 });
  });

  it('updates badge when tab finishes loading', async () => {
    const { mockChrome } = await import('../setup');
    const session = await createSession('Loaded', '#F59E0B');
    await assignTab(8, session.id, 'https://example.com');

    initBadgeManager();

    mockChrome.tabs.onUpdated._fire(8, { status: 'complete' }, { id: 8 });
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'LO', tabId: 8 });
  });

  it('ignores tab updates that are not status=complete', async () => {
    const { mockChrome } = await import('../setup');
    initBadgeManager();

    mockChrome.tabs.onUpdated._fire(9, { status: 'loading' }, { id: 9 });
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('sync conflict badge', () => {
  const conflict: ConflictEntry = {
    sessionId: 'sess-1',
    sessionName: 'Work',
    origin: 'https://example.com',
    localTimestamp: 0,
    cloudTimestamp: 0,
    resolution: null,
  };

  // Reset the module-level conflict flag so a pending conflict from one test
  // cannot bleed into unrelated badge tests (module state persists in-file).
  afterEach(async () => {
    await setSyncConfig({ pendingConflicts: [] });
    await new Promise((r) => setTimeout(r, 5));
  });

  it('overrides all tab badges with a warning when a conflict becomes pending', async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await initSyncStore();
    initBadgeManager();
    await new Promise((r) => setTimeout(r, 5));

    await setSyncConfig({ enabled: true, googleId: 'g', pendingConflicts: [conflict] });
    await new Promise((r) => setTimeout(r, 5));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 1 });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 2 });
  });

  it('renders the conflict badge instead of the session abbreviation', async () => {
    const session = await createSession('WorkTab', '#3B82F6');
    await assignTab(1, session.id, 'https://example.com');

    await initSyncStore();
    initBadgeManager();
    await new Promise((r) => setTimeout(r, 5));
    await setSyncConfig({ enabled: true, googleId: 'g', pendingConflicts: [conflict] });
    await new Promise((r) => setTimeout(r, 5));

    await updateBadge(1);

    // While a conflict is pending, the warning wins over the session badge.
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '!', tabId: 1 });
    expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: 'WO', tabId: 1 });
  });

  it('restores normal session badges once the conflict clears', async () => {
    const session = await createSession('WorkTab', '#3B82F6');
    await assignTab(1, session.id, 'https://example.com');

    await initSyncStore();
    initBadgeManager();
    await new Promise((r) => setTimeout(r, 5));

    await setSyncConfig({ enabled: true, googleId: 'g', pendingConflicts: [conflict] });
    await new Promise((r) => setTimeout(r, 5));
    await setSyncConfig({ pendingConflicts: [] });
    await new Promise((r) => setTimeout(r, 5));

    await updateBadge(1);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: 'WO', tabId: 1 });
  });
});
