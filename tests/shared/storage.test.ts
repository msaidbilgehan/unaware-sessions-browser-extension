import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks } from '../setup';
import { getLocal, setLocal, removeLocal, getSession, setSession, removeSession } from '@shared/storage';

beforeEach(() => {
  resetChromeMocks();
});

describe('local storage helpers', () => {
  it('sets and gets a value', async () => {
    await setLocal('key', { foo: 'bar' });
    const result = await getLocal<{ foo: string }>('key');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns undefined for missing key', async () => {
    const result = await getLocal('missing');
    expect(result).toBeUndefined();
  });

  it('removes a value', async () => {
    await setLocal('key', 'value');
    await removeLocal('key');
    const result = await getLocal('key');
    expect(result).toBeUndefined();
  });
});

describe('session storage helpers', () => {
  it('sets and gets a value', async () => {
    await setSession('key', [1, 2, 3]);
    const result = await getSession<number[]>('key');
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns undefined for missing key', async () => {
    const result = await getSession('missing');
    expect(result).toBeUndefined();
  });

  it('removes a value', async () => {
    await setSession('key', 'value');
    await removeSession('key');
    const result = await getSession('key');
    expect(result).toBeUndefined();
  });
});
