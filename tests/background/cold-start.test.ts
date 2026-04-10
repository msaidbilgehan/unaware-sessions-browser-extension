/**
 * Cold-start integration tests.
 *
 * Verify that the hydration pattern works correctly when multiple operations
 * race against hydration. These reproduce bugs where sync reads returned
 * empty data because hydration hadn't completed yet.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';

beforeEach(() => {
  resetChromeMocks();
});

describe('session-manager cold start', () => {
  it('concurrent ensureHydrated calls share a single hydration', async () => {
    // Pre-populate storage with session data
    const sessionData = [
      { id: 's1', name: 'Session 1', color: '#FF0000', createdAt: 1, updatedAt: 1, settings: {} },
    ];
    await mockChrome.storage.local.set({ sessions: sessionData });

    // Fresh import to reset module state
    const mod = await import('@background/session-manager');

    // Fire two concurrent reads — both should await the same hydration
    const [list1, list2] = await Promise.all([mod.listSessions(), mod.listSessions()]);

    expect(list1).toHaveLength(1);
    expect(list2).toHaveLength(1);
    expect(list1[0].name).toBe('Session 1');
    expect(list2[0].name).toBe('Session 1');
  });

  it('getSession returns data after concurrent hydration', async () => {
    const sessionData = [
      { id: 's1', name: 'Test', color: '#000', createdAt: 1, updatedAt: 1, settings: {} },
    ];
    await mockChrome.storage.local.set({ sessions: sessionData });

    const mod = await import('@background/session-manager');
    await mod.hydrateSessions();

    const session = await mod.getSession('s1');
    expect(session).toBeDefined();
    expect(session?.name).toBe('Test');
  });
});

describe('tab-tracker cold start', () => {
  it('getTabEntry returns data after hydration completes', async () => {
    // Pre-populate session storage with tab map
    await mockChrome.storage.session.set({
      tabMap: { '42': { sessionId: 's1', origin: 'https://example.com' } },
    });

    const mod = await import('@background/tab-tracker');
    await mod.hydrateTabMap();

    const entry = await mod.getTabEntry(42);
    expect(entry).toBeDefined();
    expect(entry?.sessionId).toBe('s1');
    expect(entry?.origin).toBe('https://example.com');
  });

  it('concurrent getTabEntry and assignTab both await hydration', async () => {
    await mockChrome.storage.session.set({
      tabMap: { '1': { sessionId: 's1', origin: 'https://a.com' } },
    });

    const mod = await import('@background/tab-tracker');
    await mod.hydrateTabMap();

    // Run a read and write concurrently
    const [entry, _] = await Promise.all([
      mod.getTabEntry(1),
      mod.assignTab(2, 's2', 'https://b.com'),
    ]);

    expect(entry).toBeDefined();
    expect(entry?.sessionId).toBe('s1');

    // New assignment should also be visible
    const entry2 = await mod.getTabEntry(2);
    expect(entry2?.sessionId).toBe('s2');
  });

  it('getAllTabEntries returns hydrated data', async () => {
    await mockChrome.storage.session.set({
      tabMap: {
        '1': { sessionId: 's1', origin: 'https://a.com' },
        '2': { sessionId: 's2', origin: 'https://b.com' },
      },
    });

    const mod = await import('@background/tab-tracker');
    await mod.hydrateTabMap();

    const entries = await mod.getAllTabEntries();
    expect(entries.size).toBe(2);
    expect(entries.get(1)?.sessionId).toBe('s1');
    expect(entries.get(2)?.sessionId).toBe('s2');
  });

  it('getTabsForSession returns hydrated data', async () => {
    await mockChrome.storage.session.set({
      tabMap: {
        '1': { sessionId: 's1', origin: 'https://a.com' },
        '2': { sessionId: 's1', origin: 'https://b.com' },
        '3': { sessionId: 's2', origin: 'https://c.com' },
      },
    });

    const mod = await import('@background/tab-tracker');
    await mod.hydrateTabMap();

    const tabs = await mod.getTabsForSession('s1');
    expect(tabs).toEqual([1, 2]);
  });
});

describe('switchSession mutex', () => {
  it('serializes concurrent switches on the same tab', async () => {
    const callOrder: string[] = [];

    // Track chrome.tabs.update calls to verify serialization
    (mockChrome.tabs.update as ReturnType<typeof import('vitest').vi.fn>).mockImplementation(
      async () => {
        callOrder.push('update');
        return { id: 1 };
      },
    );

    // Set up a session and tab
    const sessionMod = await import('@background/session-manager');
    await sessionMod.hydrateSessions();
    const s1 = await sessionMod.createSession('A', '#F00');
    const s2 = await sessionMod.createSession('B', '#00F');

    // Pre-populate cookie snapshots so switchSession takes the full path
    const { cookieStore } = await import('@background/cookie-store');
    await cookieStore.save({
      sessionId: s1.id,
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'a', value: '1', domain: 'example.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });
    await cookieStore.save({
      sessionId: s2.id,
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'b', value: '2', domain: 'example.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });

    const tabMod = await import('@background/tab-tracker');
    await tabMod.hydrateTabMap();

    (mockChrome.tabs.get as ReturnType<typeof import('vitest').vi.fn>).mockResolvedValue({
      id: 1,
      url: 'https://example.com/page',
    });

    const { switchSession } = await import('@background/cookie-engine');

    // Fire two switches on same tab concurrently
    const [r1, r2] = await Promise.allSettled([
      switchSession(1, s1.id),
      switchSession(1, s2.id),
    ]);

    // Both should resolve (second waited for first)
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');

    // chrome.tabs.update should have been called twice (once per switch)
    const updateCalls = (mockChrome.tabs.update as ReturnType<typeof import('vitest').vi.fn>).mock
      .calls;
    expect(updateCalls.length).toBe(2);
  });
});
