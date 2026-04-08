import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import { updateBadge, initBadgeManager } from '@background/badge-manager';
import { assignTab, hydrateTabMap } from '@background/tab-tracker';
import { createSession, hydrateSessions } from '@background/session-manager';

beforeEach(async () => {
  resetChromeMocks();
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
});
