import { DNR_RULE_ID_BASE, DNR_RULE_LIMIT, DNR_RULE_WARN_THRESHOLD } from '@shared/constants';
import { extractDomain } from '@shared/utils';
import { cookieStore } from './cookie-store';

function buildRuleId(tabId: number): number {
  return DNR_RULE_ID_BASE + tabId;
}

function serializeCookies(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function updateRulesForTab(
  tabId: number,
  sessionId: string,
  origin: string,
): Promise<void> {
  const ruleId = buildRuleId(tabId);
  const domain = extractDomain(origin);
  if (!domain) return;

  const snapshot = await cookieStore.load(sessionId, origin);
  const cookieHeader = snapshot ? serializeCookies(snapshot.cookies) : '';

  const rule: chrome.declarativeNetRequest.Rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: 'Cookie',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: cookieHeader,
        },
      ],
    },
    condition: {
      tabIds: [tabId],
      urlFilter: `||${domain}`,
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'xmlhttprequest',
        'script',
        'stylesheet',
        'image',
        'font',
        'media',
        'websocket',
        'other',
      ] as chrome.declarativeNetRequest.ResourceType[],
    },
  };

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [rule],
  });

  // Check capacity after adding rules
  const capacity = await checkRuleCapacity();
  if (capacity.warning) {
    console.warn(
      `[Unaware Sessions] DNR rule limit warning: ${capacity.used}/${capacity.limit} rules used`,
    );
  }
}

export async function removeRulesForTab(tabId: number): Promise<void> {
  const ruleId = buildRuleId(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
  });
}

export async function removeRulesForSession(_sessionId: string): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();

  const ruleIds = rules
    .filter((r) => {
      const tabId = r.id - DNR_RULE_ID_BASE;
      return tabId > 0 && r.condition?.tabIds?.includes(tabId);
    })
    .map((r) => r.id);

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: ruleIds,
    });
  }
}

export async function getRuleCount(): Promise<number> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  return rules.length;
}

export async function checkRuleCapacity(): Promise<{
  used: number;
  limit: number;
  warning: boolean;
}> {
  const used = await getRuleCount();
  return {
    used,
    limit: DNR_RULE_LIMIT,
    warning: used >= DNR_RULE_WARN_THRESHOLD,
  };
}

export async function cleanupStaleRules(): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const tabs = await chrome.tabs.query({});
  const activeTabIds = new Set(tabs.map((t) => t.id).filter((id): id is number => id != null));

  const staleRuleIds = rules
    .filter((r) => {
      const tabId = r.id - DNR_RULE_ID_BASE;
      return tabId > 0 && !activeTabIds.has(tabId);
    })
    .map((r) => r.id);

  if (staleRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: staleRuleIds,
    });
  }
}
