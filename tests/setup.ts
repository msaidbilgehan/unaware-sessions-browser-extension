import { vi } from 'vitest';
import 'fake-indexeddb/auto';

function createMockStorage() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of keyList) {
        if (store.has(key)) {
          result[key] = store.get(key);
        }
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        store.delete(key);
      }
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      store.clear();
      return Promise.resolve();
    }),
    _store: store,
  };
}

function createMockEvent() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return {
    addListener: vi.fn((fn: (...args: unknown[]) => void) => listeners.push(fn)),
    removeListener: vi.fn(),
    hasListeners: vi.fn(() => listeners.length > 0),
    _fire: (...args: unknown[]) => {
      for (const fn of listeners) fn(...args);
    },
    _listeners: listeners,
  };
}

const mockChrome = {
  storage: {
    local: createMockStorage(),
    session: createMockStorage(),
  },
  cookies: {
    getAll: vi.fn(() => Promise.resolve([])),
    set: vi.fn(() => Promise.resolve(null)),
    remove: vi.fn(() => Promise.resolve(null)),
  },
  tabs: {
    get: vi.fn(() => Promise.resolve({ id: 1, url: 'https://example.com' })),
    query: vi.fn(() => Promise.resolve([])),
    reload: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve({ id: 1 })),
    sendMessage: vi.fn(() => Promise.resolve({ success: true })),
    create: vi.fn(() => Promise.resolve({ id: 2 })),
    onCreated: createMockEvent(),
    onRemoved: createMockEvent(),
    onUpdated: createMockEvent(),
    onActivated: createMockEvent(),
  },
  runtime: {
    onMessage: createMockEvent(),
    onInstalled: createMockEvent(),
    onStartup: createMockEvent(),
    sendMessage: vi.fn(),
    lastError: null as { message?: string } | null,
    openOptionsPage: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    onAlarm: createMockEvent(),
  },
  declarativeNetRequest: {
    updateDynamicRules: vi.fn(() => Promise.resolve()),
    getDynamicRules: vi.fn(() => Promise.resolve([])),
    updateSessionRules: vi.fn(() => Promise.resolve()),
    getSessionRules: vi.fn(() => Promise.resolve([])),
  },
  action: {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn(() => Promise.resolve()),
    onClicked: createMockEvent(),
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: mockChrome,
  writable: true,
});

export function resetChromeMocks(): void {
  mockChrome.storage.local._store.clear();
  mockChrome.storage.session._store.clear();
  vi.clearAllMocks();
}

export { mockChrome };
