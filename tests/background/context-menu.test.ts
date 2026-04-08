import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { initContextMenu, rebuildContextMenu } from '@background/context-menu';
import { createSession, hydrateSessions } from '@background/session-manager';
import { hydrateTabMap } from '@background/tab-tracker';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateSessions();
  await hydrateTabMap();
});

describe('rebuildContextMenu', () => {
  it('creates parent menu and new-session item', async () => {
    await rebuildContextMenu();

    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'unaware-sessions-open-in',
        title: 'Open in Session',
        contexts: ['link'],
      }),
    );
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'unaware-sessions-new',
        title: '+ New Session...',
      }),
    );
  });

  it('creates menu items for each session', async () => {
    const s1 = await createSession('Work', '#3B82F6');
    const s2 = await createSession('Personal', '#EF4444');

    await rebuildContextMenu();

    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `session-${s1.id}`,
        title: 'Work',
      }),
    );
    expect(chrome.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `session-${s2.id}`,
        title: 'Personal',
      }),
    );
  });
});

describe('initContextMenu', () => {
  it('registers onInstalled and onClicked listeners', () => {
    initContextMenu();

    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalled();
  });
});

describe('handleMenuClick', () => {
  it('opens options page for new-session menu item', async () => {
    initContextMenu();

    // Fire the onClicked event with the new-session menu ID
    const clickHandler = mockChrome.contextMenus.onClicked._listeners[
      mockChrome.contextMenus.onClicked._listeners.length - 1
    ];

    await clickHandler(
      { menuItemId: 'unaware-sessions-new' } as chrome.contextMenus.OnClickData,
      undefined,
    );

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('creates tab and assigns session for session menu item', async () => {
    const session = await createSession('Work', '#3B82F6');
    initContextMenu();

    const clickHandler = mockChrome.contextMenus.onClicked._listeners[
      mockChrome.contextMenus.onClicked._listeners.length - 1
    ];

    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 99,
    });
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 99,
      url: 'https://work.example.com/page',
    });

    await clickHandler(
      {
        menuItemId: `session-${session.id}`,
        linkUrl: 'https://work.example.com/page',
      } as chrome.contextMenus.OnClickData,
      { id: 1 } as chrome.tabs.Tab,
    );

    expect(chrome.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://work.example.com/page',
      }),
    );
  });

  it('ignores non-session menu items', async () => {
    initContextMenu();

    const clickHandler = mockChrome.contextMenus.onClicked._listeners[
      mockChrome.contextMenus.onClicked._listeners.length - 1
    ];

    await clickHandler(
      { menuItemId: 'random-id' } as chrome.contextMenus.OnClickData,
      undefined,
    );

    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it('ignores invalid link URLs', async () => {
    initContextMenu();

    const clickHandler = mockChrome.contextMenus.onClicked._listeners[
      mockChrome.contextMenus.onClicked._listeners.length - 1
    ];

    await clickHandler(
      {
        menuItemId: 'session-some-id',
        linkUrl: 'chrome://extensions',
      } as chrome.contextMenus.OnClickData,
      undefined,
    );

    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
