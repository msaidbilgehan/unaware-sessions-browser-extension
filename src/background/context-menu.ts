import { listSessions } from './session-manager';
import { switchSession } from './cookie-engine';
import { extractOrigin, isValidUrl } from '@shared/utils';
import { assignTab } from './tab-tracker';

const MENU_PARENT_ID = 'unaware-sessions-open-in';
const MENU_NEW_SESSION_ID = 'unaware-sessions-new';

export function initContextMenu(): void {
  chrome.runtime.onInstalled.addListener(() => {
    rebuildContextMenu().catch((err) => {
      console.error('[Unaware Sessions] Failed to build context menu:', err);
    });
  });

  chrome.contextMenus.onClicked.addListener((...args) => {
    handleMenuClick(...args).catch((err) => {
      console.error('[Unaware Sessions] Context menu click handler failed:', err);
    });
  });
}

export async function rebuildContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_PARENT_ID,
    title: 'Open in Session',
    contexts: ['link'],
  });

  const sessions = await listSessions();

  for (const session of sessions) {
    chrome.contextMenus.create({
      id: `session-${session.id}`,
      parentId: MENU_PARENT_ID,
      title: session.name,
      contexts: ['link'],
    });
  }

  chrome.contextMenus.create({
    id: MENU_NEW_SESSION_ID,
    parentId: MENU_PARENT_ID,
    title: '+ New Session...',
    contexts: ['link'],
  });
}

async function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  const menuItemId = String(info.menuItemId);

  if (menuItemId === MENU_NEW_SESSION_ID) {
    // Open popup — can't programmatically open popup from context menu,
    // so we open the options page as a fallback
    chrome.runtime.openOptionsPage();
    return;
  }

  if (!menuItemId.startsWith('session-')) return;

  const sessionId = menuItemId.replace('session-', '');
  const linkUrl = info.linkUrl;

  if (!linkUrl || !isValidUrl(linkUrl)) return;

  // Create a new tab with the link
  const newTab = await chrome.tabs.create({
    url: linkUrl,
    openerTabId: tab?.id,
  });

  if (!newTab.id) return;

  const origin = extractOrigin(linkUrl);
  if (!origin) return;

  // Assign the new tab to the selected session
  await assignTab(newTab.id, sessionId, origin);

  // Switch session on the new tab (sets cookies, DNR rules)
  await switchSession(newTab.id, sessionId);
}
