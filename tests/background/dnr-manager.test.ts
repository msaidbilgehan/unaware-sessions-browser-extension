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
