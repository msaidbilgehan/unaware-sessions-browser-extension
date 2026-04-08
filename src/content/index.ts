import { MessageType } from '@shared/types';
import type { Message, MessageResponse, StorageSnapshot, IndexedDBSnapshot } from '@shared/types';
import {
  saveLocalStorage,
  saveSessionStorage,
  restoreLocalStorage,
  restoreSessionStorage,
} from './storage-swap';
import { saveIndexedDB, restoreIndexedDB } from './idb-swap';

chrome.runtime.onMessage.addListener(
  (message: Message, _sender: chrome.runtime.MessageSender, sendResponse) => {
    switch (message.type) {
      case MessageType.PING:
        sendResponse({ success: true, data: { status: 'ready' } } satisfies MessageResponse);
        return true;

      case MessageType.SAVE_STORAGE:
        handleSaveStorage()
          .then(sendResponse)
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;

      case MessageType.RESTORE_STORAGE:
        handleRestoreStorage(message.data)
          .then(sendResponse)
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;

      default:
        return false;
    }
  },
);

async function handleSaveStorage(): Promise<
  MessageResponse<Pick<StorageSnapshot, 'localStorage' | 'sessionStorage' | 'indexedDB'>>
> {
  const localData = saveLocalStorage();
  const sessionData = saveSessionStorage();
  const idbData = await saveIndexedDB();

  return {
    success: true,
    data: {
      localStorage: localData,
      sessionStorage: sessionData,
      indexedDB: idbData,
    },
  };
}

async function handleRestoreStorage(data: {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: IndexedDBSnapshot[];
}): Promise<MessageResponse> {
  restoreLocalStorage(data.localStorage);
  restoreSessionStorage(data.sessionStorage);

  if (data.indexedDB && data.indexedDB.length > 0) {
    await restoreIndexedDB(data.indexedDB);
  }

  return { success: true };
}

// Notify service worker that content script is ready
chrome.runtime.sendMessage({ type: MessageType.CONTENT_SCRIPT_READY }).catch(() => {
  // Expected to fail if no listener is registered (e.g., service worker not ready)
});
