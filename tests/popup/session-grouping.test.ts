import { describe, it, expect } from 'vitest';
import { groupSessions, UNGROUPED_KEY } from '@popup/session-grouping';
import type { SessionProfile } from '@shared/types';

function session(id: string, name = id): SessionProfile {
  return {
    id,
    name,
    color: '#3B82F6',
    createdAt: 0,
    updatedAt: 0,
    settings: {},
  } as SessionProfile;
}

const base = {
  sessions: [] as SessionProfile[],
  sessionsWithOriginData: new Set<string>(),
  sessionOriginMap: {} as Record<string, string[]>,
  currentOrigin: 'https://mail.google.com',
  activeSessionId: undefined as string | undefined,
  searchQuery: '',
};

describe('groupSessions', () => {
  it('puts sessions holding data for the current origin under "this site"', () => {
    const a = session('a');
    const b = session('b');
    const result = groupSessions({
      ...base,
      sessions: [a, b],
      sessionsWithOriginData: new Set(['a']),
    });

    expect(result.thisSite.map((s) => s.id)).toEqual(['a']);
    expect(result.other.map((s) => s.id)).toEqual(['b']);
  });

  it('treats the tab’s active session as belonging to this site even without saved data', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a'), session('b')],
      activeSessionId: 'b',
    });

    expect(result.thisSite.map((s) => s.id)).toEqual(['b']);
    expect(result.other.map((s) => s.id)).toEqual(['a']);
  });

  it('buckets other sessions by their first non-current domain', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a'), session('b'), session('c')],
      sessionOriginMap: {
        a: ['https://github.com'],
        b: ['https://mail.google.com', 'https://app.slack.com'],
        c: ['https://github.com'],
      },
    });

    expect(result.domainGroups).toEqual([
      ['app.slack.com', [expect.objectContaining({ id: 'b' })]],
      ['github.com', [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'c' })]],
    ]);
  });

  it('sorts named domains alphabetically and keeps the no-data bucket last', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('none'), session('z'), session('a')],
      sessionOriginMap: {
        z: ['https://zeta.example'],
        a: ['https://alpha.example'],
      },
    });

    expect(result.domainGroups.map(([domain]) => domain)).toEqual([
      'alpha.example',
      'zeta.example',
      UNGROUPED_KEY,
    ]);
  });

  it('matches the search query against session names and saved origins', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a', 'Work'), session('b', 'Personal')],
      sessionOriginMap: { a: ['https://claude.ai'] },
      searchQuery: 'CLAUDE',
    });

    expect(result.filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('ignores surrounding whitespace in the search query', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a', 'Work'), session('b', 'Personal')],
      searchQuery: '   ',
    });

    expect(result.filtered).toHaveLength(2);
  });

  it('exposes visibleOrder as this-site rows followed by the rendered domain groups', () => {
    // The 1-9 quick-switch keys index this array, so it has to match the order
    // the list actually paints rather than the stored session order.
    const result = groupSessions({
      ...base,
      sessions: [session('zeta'), session('alpha'), session('here')],
      sessionsWithOriginData: new Set(['here']),
      sessionOriginMap: {
        zeta: ['https://zeta.example'],
        alpha: ['https://alpha.example'],
      },
    });

    expect(result.visibleOrder.map((s) => s.id)).toEqual(['here', 'alpha', 'zeta']);
  });

  it('excludes filtered-out sessions from visibleOrder', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a', 'Work'), session('b', 'Personal')],
      searchQuery: 'work',
    });

    expect(result.visibleOrder.map((s) => s.id)).toEqual(['a']);
  });

  it('does not bucket a session under the site the user is already on', () => {
    const result = groupSessions({
      ...base,
      sessions: [session('a')],
      sessionOriginMap: { a: ['https://mail.google.com'] },
    });

    expect(result.domainGroups.map(([domain]) => domain)).toEqual([UNGROUPED_KEY]);
  });

  it('handles an empty session list', () => {
    const result = groupSessions({ ...base });

    expect(result.filtered).toEqual([]);
    expect(result.thisSite).toEqual([]);
    expect(result.other).toEqual([]);
    expect(result.domainGroups).toEqual([]);
    expect(result.visibleOrder).toEqual([]);
  });
});
