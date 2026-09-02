import type { SessionProfile } from '@shared/types';
import { extractDomain } from '@shared/utils';

/**
 * Sort key for sessions that have no saved origin other than the current one.
 * The leading space keeps it out of the way of any real domain and lets the
 * group sort last without a special case at every call site.
 */
export const UNGROUPED_KEY = ' ungrouped';

export interface SessionGrouping {
  /** Sessions matching the search query, in stored order. */
  filtered: SessionProfile[];
  /** Sessions with saved data for the current origin, or active on this tab. */
  thisSite: SessionProfile[];
  /** Everything else that matched the query. */
  other: SessionProfile[];
  /** `other`, bucketed by primary non-current domain and sorted for display. */
  domainGroups: [domain: string, sessions: SessionProfile[]][];
  /**
   * `thisSite` followed by `other` in the order they are rendered. This is what
   * the 1–9 quick-switch keys index into, so it has to be derived from the same
   * computation that produces the visible list rather than re-guessed.
   */
  visibleOrder: SessionProfile[];
}

export interface GroupSessionsInput {
  sessions: SessionProfile[];
  /** Session ids that hold saved data for `currentOrigin`. */
  sessionsWithOriginData: ReadonlySet<string>;
  /** sessionId -> origins that session has data for. */
  sessionOriginMap: Record<string, string[]>;
  currentOrigin: string;
  activeSessionId: string | undefined;
  searchQuery: string;
}

/**
 * Split the session list into the groups the popup renders.
 *
 * Matching is case-insensitive across both the session name and every origin
 * the session has saved data for, so searching "claude" finds a session named
 * "work" that holds claude.ai cookies.
 */
export function groupSessions(input: GroupSessionsInput): SessionGrouping {
  const { sessions, sessionsWithOriginData, sessionOriginMap, currentOrigin, activeSessionId } =
    input;

  const query = input.searchQuery.trim().toLowerCase();
  const filtered = query
    ? sessions.filter((s) => {
        if (s.name.toLowerCase().includes(query)) return true;
        return (sessionOriginMap[s.id] ?? []).some((o) => o.toLowerCase().includes(query));
      })
    : sessions;

  const thisSite: SessionProfile[] = [];
  const other: SessionProfile[] = [];
  for (const session of filtered) {
    if (sessionsWithOriginData.has(session.id) || session.id === activeSessionId) {
      thisSite.push(session);
    } else {
      other.push(session);
    }
  }

  const currentDomain = currentOrigin ? extractDomain(currentOrigin) : '';
  const buckets = new Map<string, SessionProfile[]>();
  for (const session of other) {
    const primaryDomain =
      (sessionOriginMap[session.id] ?? [])
        .map((o) => extractDomain(o))
        .find((d) => d && d !== currentDomain) ?? UNGROUPED_KEY;
    const bucket = buckets.get(primaryDomain);
    if (bucket) bucket.push(session);
    else buckets.set(primaryDomain, [session]);
  }

  const domainGroups = [...buckets.entries()].sort((a, b) => {
    if (a[0] === UNGROUPED_KEY) return 1;
    if (b[0] === UNGROUPED_KEY) return -1;
    return a[0].localeCompare(b[0]);
  });

  return {
    filtered,
    thisSite,
    other,
    domainGroups,
    visibleOrder: [...thisSite, ...domainGroups.flatMap(([, group]) => group)],
  };
}
