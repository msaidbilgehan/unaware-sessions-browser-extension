import { describe, it, expect, beforeEach } from 'vitest';
import { resetChromeMocks, mockChrome } from '../setup';
import { initMessaging } from '@background/messaging';
import { hydrateSessions } from '@background/session-manager';
import { hydrateTabMap } from '@background/tab-tracker';
import { MessageType } from '@shared/types';
import type { MessageResponse } from '@shared/types';

beforeEach(async () => {
  resetChromeMocks();
  await hydrateSessions();
  await hydrateTabMap();
  initMessaging();
});

function sendTestMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender = {},
): Promise<MessageResponse> {
  return new Promise((resolve) => {
    const listeners = mockChrome.runtime.onMessage._listeners;
    const handler = listeners[listeners.length - 1];
    handler(message, sender, resolve);
  });
}

describe('messaging', () => {
  it('handles CREATE_SESSION', async () => {
    const response = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });

    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({ name: 'test', color: '#3B82F6' });
  });

  it('handles LIST_SESSIONS', async () => {
    // Create a session first
    await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });

    const response = await sendTestMessage({ type: MessageType.LIST_SESSIONS });

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(1);
  });

  it('handles DELETE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'to-delete',
      color: '#EF4444',
    });

    const sessionId = (createResp.data as { id: string }).id;
    const deleteResp = await sendTestMessage({
      type: MessageType.DELETE_SESSION,
      sessionId,
    });

    expect(deleteResp.success).toBe(true);

    const listResp = await sendTestMessage({ type: MessageType.LIST_SESSIONS });
    expect(listResp.data).toHaveLength(0);
  });

  it('handles PING', async () => {
    const response = await sendTestMessage({ type: MessageType.PING });
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ status: 'alive' });
  });

  it('handles CONTENT_SCRIPT_READY with tab sender', async () => {
    const response = await sendTestMessage(
      { type: MessageType.CONTENT_SCRIPT_READY },
      { tab: { id: 42 } as chrome.tabs.Tab },
    );
    expect(response.success).toBe(true);
  });

  it('returns error for unknown message type', async () => {
    const response = await sendTestMessage({ type: 'UNKNOWN_TYPE' });
    expect(response.success).toBe(false);
    expect(response.error).toContain('Unknown message type');
  });

  it('handles errors in handlers gracefully', async () => {
    const response = await sendTestMessage({
      type: MessageType.DELETE_SESSION,
      sessionId: 'non-existent',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Session not found');
  });

  it('handles UPDATE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'original',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const updateResp = await sendTestMessage({
      type: MessageType.UPDATE_SESSION,
      sessionId,
      updates: { name: 'renamed', color: '#EF4444' },
    });

    expect(updateResp.success).toBe(true);
    expect(updateResp.data).toMatchObject({ name: 'renamed', color: '#EF4444' });
  });

  it('handles CREATE_SESSION with emoji', async () => {
    const response = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Work',
      color: '#3B82F6',
      emoji: '\u{1F4BC}',
    });

    expect(response.success).toBe(true);
    expect((response.data as { emoji: string }).emoji).toBe('\u{1F4BC}');
  });

  it('handles GET_ALL_TAB_COUNTS', async () => {
    const response = await sendTestMessage({
      type: MessageType.GET_ALL_TAB_COUNTS,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({});
  });

  it('handles GET_TABS_FOR_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const response = await sendTestMessage({
      type: MessageType.GET_TABS_FOR_SESSION,
      sessionId,
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('handles GET_SESSION_STATS', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'test',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const response = await sendTestMessage({
      type: MessageType.GET_SESSION_STATS,
      sessionId,
    });

    expect(response.success).toBe(true);
    const stats = response.data as Record<string, unknown>;
    expect(stats.tabCount).toBe(0);
    expect(stats.cookieCount).toBe(0);
  });

  it('handles DUPLICATE_SESSION', async () => {
    const createResp = await sendTestMessage({
      type: MessageType.CREATE_SESSION,
      name: 'Original',
      color: '#3B82F6',
    });
    const sessionId = (createResp.data as { id: string }).id;

    const dupResp = await sendTestMessage({
      type: MessageType.DUPLICATE_SESSION,
      sessionId,
    });

    expect(dupResp.success).toBe(true);
    expect((dupResp.data as { name: string }).name).toBe('Copy of Original');
    expect((dupResp.data as { color: string }).color).toBe('#3B82F6');
  });

  it('handles REORDER_SESSIONS', async () => {
    const response = await sendTestMessage({
      type: MessageType.REORDER_SESSIONS,
      orderedIds: ['id1', 'id2', 'id3'],
    });

    expect(response.success).toBe(true);
  });
});
