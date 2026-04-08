import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a proper localStorage/sessionStorage mock
function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length;
    },
  };
}

const mockLocalStorage = createStorageMock();
const mockSessionStorage = createStorageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
  configurable: true,
});

const {
  saveLocalStorage,
  saveSessionStorage,
  restoreLocalStorage,
  restoreSessionStorage,
} = await import('@content/storage-swap');

beforeEach(() => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  vi.clearAllMocks();
});

describe('saveLocalStorage', () => {
  it('returns all localStorage entries as an object', () => {
    mockLocalStorage.setItem('key1', 'val1');
    mockLocalStorage.setItem('key2', 'val2');

    const data = saveLocalStorage();
    expect(data).toEqual({ key1: 'val1', key2: 'val2' });
  });

  it('returns empty object when localStorage is empty', () => {
    const data = saveLocalStorage();
    expect(data).toEqual({});
  });

  it('handles special characters in keys and values', () => {
    mockLocalStorage.setItem('emoji-key', 'value with spaces');
    mockLocalStorage.setItem('key=with=equals', 'val');

    const data = saveLocalStorage();
    expect(data['emoji-key']).toBe('value with spaces');
    expect(data['key=with=equals']).toBe('val');
  });
});

describe('saveSessionStorage', () => {
  it('returns all sessionStorage entries as an object', () => {
    mockSessionStorage.setItem('sk1', 'sv1');
    mockSessionStorage.setItem('sk2', 'sv2');

    const data = saveSessionStorage();
    expect(data).toEqual({ sk1: 'sv1', sk2: 'sv2' });
  });

  it('returns empty object when sessionStorage is empty', () => {
    const data = saveSessionStorage();
    expect(data).toEqual({});
  });
});

describe('restoreLocalStorage', () => {
  it('replaces localStorage contents with provided data', () => {
    mockLocalStorage.setItem('old', 'data');

    restoreLocalStorage({ new1: 'val1', new2: 'val2' });

    expect(mockLocalStorage.clear).toHaveBeenCalled();
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('new1', 'val1');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('new2', 'val2');
  });

  it('clears localStorage when given empty object', () => {
    mockLocalStorage.setItem('key', 'val');

    restoreLocalStorage({});

    expect(mockLocalStorage.clear).toHaveBeenCalled();
  });
});

describe('restoreSessionStorage', () => {
  it('replaces sessionStorage contents with provided data', () => {
    mockSessionStorage.setItem('old', 'data');

    restoreSessionStorage({ new1: 'val1' });

    expect(mockSessionStorage.clear).toHaveBeenCalled();
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('new1', 'val1');
  });

  it('clears sessionStorage when given empty object', () => {
    mockSessionStorage.setItem('key', 'val');

    restoreSessionStorage({});

    expect(mockSessionStorage.clear).toHaveBeenCalled();
  });
});
