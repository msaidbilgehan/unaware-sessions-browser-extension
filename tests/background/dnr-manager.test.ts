import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from '../setup';
import {
  updateRulesForTab,
  removeRulesForTab,
  getRuleCount,
  checkRuleCapacity,
  cleanupStaleRules,
} from '@background/dnr-manager';
import { cookieStore } from '@background/cookie-store';
import { DNR_RULE_ID_BASE, DNR_RULE_WARN_THRESHOLD } from '@shared/constants';

beforeEach(() => {
  resetChromeMocks();
});

function mockGetDynamicRules(rules: chrome.declarativeNetRequest.Rule[]) {
  (chrome.declarativeNetRequest.getSessionRules as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    rules,
  );
}

function mockQueryTabs(tabs: chrome.tabs.Tab[]) {
  (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(tabs);
}

describe('dnr-manager', () => {
  it('creates a rule for a tab', async () => {
    // Save a snapshot so DNR has cookies to inject (no snapshot = no rule)
    await cookieStore.save({
      sessionId: 'session-1',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'sid', value: '123', domain: 'example.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });
    await updateRulesForTab(42, 'session-1', 'https://example.com');

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith(
      expect.objectContaining({
        removeRuleIds: [DNR_RULE_ID_BASE + 42],
        addRules: expect.arrayContaining([
          expect.objectContaining({
            id: DNR_RULE_ID_BASE + 42,
            condition: expect.objectContaining({
              tabIds: [42],
              urlFilter: '||example.com',
            }),
          }),
        ]),
      }),
    );
  });

  it('removes rules for a tab', async () => {
    await removeRulesForTab(42);

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [DNR_RULE_ID_BASE + 42],
    });
  });

  it('returns rule count', async () => {
    mockGetDynamicRules([
      { id: 1001, priority: 1, action: { type: 'modifyHeaders' }, condition: {} },
      { id: 1002, priority: 1, action: { type: 'modifyHeaders' }, condition: {} },
    ] as chrome.declarativeNetRequest.Rule[]);

    const count = await getRuleCount();
    expect(count).toBe(2);
  });

  it('reports capacity warning when near limit', async () => {
    const rules = Array.from({ length: DNR_RULE_WARN_THRESHOLD }, (_, i) => ({
      id: DNR_RULE_ID_BASE + i,
      priority: 1,
      action: { type: 'modifyHeaders' },
      condition: {},
    })) as chrome.declarativeNetRequest.Rule[];

    mockGetDynamicRules(rules);

    const capacity = await checkRuleCapacity();
    expect(capacity.warning).toBe(true);
    expect(capacity.used).toBe(DNR_RULE_WARN_THRESHOLD);
  });

  it('removes rule instead of creating one when no snapshot exists', async () => {
    // No cookie snapshot saved — updateRulesForTab should remove the rule
    await updateRulesForTab(99, 'no-session', 'https://example.com');

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [DNR_RULE_ID_BASE + 99],
    });
    // Should NOT have addRules
    const call = (chrome.declarativeNetRequest.updateSessionRules as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.addRules).toBeUndefined();
  });

  it('removes rule when snapshot has empty cookies array', async () => {
    await cookieStore.save({
      sessionId: 'empty-session',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [],
    });

    await updateRulesForTab(88, 'empty-session', 'https://example.com');

    const call = (chrome.declarativeNetRequest.updateSessionRules as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.removeRuleIds).toEqual([DNR_RULE_ID_BASE + 88]);
    expect(call.addRules).toBeUndefined();
  });

  it('filters out cross-domain cookies from legacy snapshots in DNR header', async () => {
    // Snapshot contains cookies from both example.com AND google.com (legacy pollution)
    await cookieStore.save({
      sessionId: 'legacy-session',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'sid', value: '123', domain: '.example.com', path: '/' } as chrome.cookies.Cookie,
        { name: 'gid', value: 'leak', domain: '.google.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });

    await updateRulesForTab(50, 'legacy-session', 'https://example.com');

    const call = (chrome.declarativeNetRequest.updateSessionRules as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.addRules).toBeDefined();

    // The Cookie header should ONLY contain example.com cookies, not google.com
    const cookieHeader = call.addRules[0].action.requestHeaders[0].value;
    expect(cookieHeader).toBe('sid=123');
    expect(cookieHeader).not.toContain('gid=leak');
  });

  it('removes rule when all cookies are cross-domain (no origin cookies)', async () => {
    // Snapshot contains ONLY cross-domain cookies — no origin cookies
    await cookieStore.save({
      sessionId: 'all-cross',
      origin: 'https://example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'gid', value: 'leak', domain: '.google.com', path: '/' } as chrome.cookies.Cookie,
        { name: 'fb', value: 'other', domain: '.facebook.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });

    await updateRulesForTab(55, 'all-cross', 'https://example.com');

    const call = (chrome.declarativeNetRequest.updateSessionRules as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // Should remove rule (no origin cookies to inject)
    expect(call.removeRuleIds).toEqual([DNR_RULE_ID_BASE + 55]);
    expect(call.addRules).toBeUndefined();
  });

  it('includes parent-domain cookies in DNR header', async () => {
    // Cookies on parent domain should be included for subdomain origins
    await cookieStore.save({
      sessionId: 'parent-domain',
      origin: 'https://www.example.com',
      timestamp: Date.now(),
      cookies: [
        { name: 'sub', value: 'a', domain: 'www.example.com', path: '/' } as chrome.cookies.Cookie,
        { name: 'parent', value: 'b', domain: '.example.com', path: '/' } as chrome.cookies.Cookie,
      ],
    });

    await updateRulesForTab(60, 'parent-domain', 'https://www.example.com');

    const call = (chrome.declarativeNetRequest.updateSessionRules as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.addRules).toBeDefined();
    const cookieHeader = call.addRules[0].action.requestHeaders[0].value;
    expect(cookieHeader).toContain('sub=a');
    expect(cookieHeader).toContain('parent=b');
  });

  it('cleans up stale rules for closed tabs', async () => {
    const staleRules = [
      {
        id: DNR_RULE_ID_BASE + 100,
        priority: 1,
        action: { type: 'modifyHeaders' },
        condition: { tabIds: [100] },
      },
      {
        id: DNR_RULE_ID_BASE + 200,
        priority: 1,
        action: { type: 'modifyHeaders' },
        condition: { tabIds: [200] },
      },
    ] as chrome.declarativeNetRequest.Rule[];

    mockGetDynamicRules(staleRules);
    mockQueryTabs([{ id: 100 }] as chrome.tabs.Tab[]);

    await cleanupStaleRules();

    expect(chrome.declarativeNetRequest.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [DNR_RULE_ID_BASE + 200],
    });
  });
});
