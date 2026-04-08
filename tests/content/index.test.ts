import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { MessageType } from '@shared/types';
import type { IndexedDBSnapshot } from '@shared/types';

// Mock storage-swap and idb-swap to isolate content/index.ts
vi.mock('@content/storage-swap', () => ({
  saveLocalStorage: vi.fn(() => ({ key1: 'val1' })),
  saveSessionStorage: vi.fn(() => ({ skey: 'sval' })),
  restoreLocalStorage: vi.fn(),
  restoreSessionStorage: vi.fn(),
}));

vi.mock('@content/idb-swap', () => ({
  saveIndexedDB: vi.fn(() => Promise.resolve([])),
  restoreIndexedDB: vi.fn(() => Promise.resolve()),
}));

// Import mocked modules for assertion access
const { saveLocalStorage, saveSessionStorage, restoreLocalStorage, restoreSessionStorage } =
  await import('@content/storage-swap');
const { saveIndexedDB, restoreIndexedDB } = await import('@content/idb-swap');

// Ensure sendMessage returns a promise (content script calls .catch() on it)
vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined);

// Import the module under test — registers the onMessage listener
await import('@content/index');

type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

function getListener(): MessageListener {
  const listeners = mockChrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1] as MessageListener;
}

function callListener(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const listener = getListener();
    listener(message, {} as chrome.runtime.MessageSender, resolve);
  });
}

beforeEach(() => {
  resetChromeMocks();
  vi.mocked(saveLocalStorage).mockReturnValue({ key1: 'val1' });
  vi.mocked(saveSessionStorage).mockReturnValue({ skey: 'sval' });
  vi.mocked(saveIndexedDB).mockResolvedValue([]);
  vi.mocked(restoreLocalStorage).mockReturnValue(undefined);
  vi.mocked(restoreSessionStorage).mockReturnValue(undefined);
  vi.mocked(restoreIndexedDB).mockResolvedValue(undefined);
});

describe('content script message listener', () => {
  it('registers a message listener on import', () => {
    // Listener was registered at module import time; verify it exists in the array
    expect(mockChrome.runtime.onMessage._listeners.length).toBeGreaterThan(0);
    expect(getListener()).toBeTypeOf('function');
  });

  describe('PING', () => {
    it('responds with success and ready status', async () => {
      const response = await callListener({ type: MessageType.PING });

      expect(response).toEqual({
        success: true,
        data: { status: 'ready' },
      });
    });
  });

  describe('SAVE_STORAGE', () => {
    it('saves localStorage, sessionStorage, and IndexedDB', async () => {
      const response = await callListener({
        type: MessageType.SAVE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
      });

      expect(saveLocalStorage).toHaveBeenCalled();
      expect(saveSessionStorage).toHaveBeenCalled();
      expect(saveIndexedDB).toHaveBeenCalled();
      expect(response).toEqual({
        success: true,
        data: {
          localStorage: { key1: 'val1' },
          sessionStorage: { skey: 'sval' },
          indexedDB: [],
        },
      });
    });

    it('includes IndexedDB snapshots when available', async () => {
      const idbSnapshot: IndexedDBSnapshot[] = [
        { name: 'testdb', version: 1, objectStores: [] },
      ];
      vi.mocked(saveIndexedDB).mockResolvedValue(idbSnapshot);

      const response = (await callListener({
        type: MessageType.SAVE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
      })) as { success: boolean; data: { indexedDB: IndexedDBSnapshot[] } };

      expect(response.data.indexedDB).toEqual(idbSnapshot);
    });

    it('returns error response when saveIndexedDB throws', async () => {
      vi.mocked(saveIndexedDB).mockRejectedValue(new Error('IDB failed'));

      const response = await callListener({
        type: MessageType.SAVE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
      });

      expect(response).toEqual({ success: false, error: 'IDB failed' });
    });
  });

  describe('RESTORE_STORAGE', () => {
    it('restores localStorage and sessionStorage from data', async () => {
      const data = {
        localStorage: { restored: 'true' },
        sessionStorage: { temp: 'data' },
      };

      const response = await callListener({
        type: MessageType.RESTORE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
        data,
      });

      expect(restoreLocalStorage).toHaveBeenCalledWith({ restored: 'true' });
      expect(restoreSessionStorage).toHaveBeenCalledWith({ temp: 'data' });
      expect(response).toEqual({ success: true });
    });

    it('restores IndexedDB when provided', async () => {
      const idbData: IndexedDBSnapshot[] = [
        { name: 'mydb', version: 1, objectStores: [] },
      ];

      await callListener({
        type: MessageType.RESTORE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
        data: {
          localStorage: {},
          sessionStorage: {},
          indexedDB: idbData,
        },
      });

      expect(restoreIndexedDB).toHaveBeenCalledWith(idbData);
    });

    it('skips IndexedDB restore when indexedDB is undefined', async () => {
      await callListener({
        type: MessageType.RESTORE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
        data: {
          localStorage: {},
          sessionStorage: {},
        },
      });

      expect(restoreIndexedDB).not.toHaveBeenCalled();
    });

    it('skips IndexedDB restore when indexedDB is empty', async () => {
      await callListener({
        type: MessageType.RESTORE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
        data: {
          localStorage: {},
          sessionStorage: {},
          indexedDB: [],
        },
      });

      expect(restoreIndexedDB).not.toHaveBeenCalled();
    });

    it('returns error response when restore fails', async () => {
      vi.mocked(restoreLocalStorage).mockImplementation(() => {
        throw new Error('localStorage blocked');
      });

      const response = await callListener({
        type: MessageType.RESTORE_STORAGE,
        sessionId: 's1',
        origin: 'https://example.com',
        data: { localStorage: {}, sessionStorage: {} },
      });

      expect(response).toEqual({ success: false, error: 'localStorage blocked' });
    });
  });

  describe('unknown message type', () => {
    it('returns false for unhandled message types', () => {
      const listener = getListener();
      const sendResponse = vi.fn();

      const result = listener(
        { type: 'UNKNOWN_TYPE' },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});

describe('content script ready notification', () => {
  it('listener handles PING which confirms content script is loaded and responding', async () => {
    // CONTENT_SCRIPT_READY was sent at import time (before beforeEach resets spies).
    // Instead, verify the script is functional by testing its PING response.
    const response = await callListener({ type: MessageType.PING });
    expect(response).toEqual({ success: true, data: { status: 'ready' } });
  });
});
