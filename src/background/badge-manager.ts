import { getTabEntry } from './tab-tracker';
import { getSession } from './session-manager';

export async function updateBadge(tabId: number): Promise<void> {
  const entry = getTabEntry(tabId);

  if (!entry) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const session = await getSession(entry.sessionId);
  if (!session) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  const abbreviation = session.name.slice(0, 2).toUpperCase();

  await chrome.action.setBadgeText({ text: abbreviation, tabId });
  await chrome.action.setBadgeBackgroundColor({ color: session.color, tabId });
}

export function initBadgeManager(): void {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await updateBadge(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      await updateBadge(tabId);
    }
  });
}
