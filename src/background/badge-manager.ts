import { getTabEntry } from './tab-tracker';
import { getSession } from './session-manager';

export async function updateBadge(tabId: number): Promise<void> {
  const entry = await getTabEntry(tabId);

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
  chrome.tabs.onActivated.addListener((activeInfo) => {
    updateBadge(activeInfo.tabId).catch((err) => {
      console.warn('[Unaware Sessions] Badge update failed:', err);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      updateBadge(tabId).catch((err) => {
        console.warn('[Unaware Sessions] Badge update failed:', err);
      });
    }
  });
}
