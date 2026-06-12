import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '@cashew/shared';
import { sessionManagerReducer } from './session-manager';

const initialState = {
  sessions: [],
  activeSessionId: null,
  messages: [] as ConversationMessage[],
  isLoading: true,
  error: null as string | null,
};

describe('sessionManagerReducer', () => {
  it('moves a touched Conversation to the front of Conversation History', () => {
    const next = sessionManagerReducer({
      ...initialState,
      sessions: [
        { id: 'newer', title: 'Newer', created_at: 2, updated_at: 2 },
        { id: 'active', title: 'Active', created_at: 1, updated_at: 1 },
      ],
    }, {
      type: 'session_touched',
      sessionId: 'active',
      updatedAt: 3,
    });

    expect(next.sessions.map((conversation) => conversation.id)).toEqual(['active', 'newer']);
    expect(next.sessions[0].updated_at).toBe(3);
  });

  describe('session_activated', () => {
    it('clears messages when switching to a new session', () => {
      // 模拟用户从 session-1 切换到 session-2
      const stateWithMessages = {
        ...initialState,
        activeSessionId: 'session-1',
        messages: [
          { id: 'msg-1', session_id: 'session-1', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
          { id: 'msg-2', session_id: 'session-1', role: 'assistant' as const, content: 'Hello', created_at: 1700000000001 },
        ],
        isLoading: false,
      };

      const next = sessionManagerReducer(stateWithMessages, {
        type: 'session_activated',
        sessionId: 'session-2',
      });

      expect(next.activeSessionId).toBe('session-2');
      // 消息列表已清空，不会残留上一会话的数据
      expect(next.messages).toEqual([]);
      expect(next.isLoading).toBe(true);
    });

    it('keeps messages as an empty array even when loading fails subsequently', () => {
      // 模拟：先切换到 session-2，然后 db_error 触发
      const stateWithMessages = {
        ...initialState,
        activeSessionId: 'session-1',
        messages: [
          { id: 'msg-1', session_id: 'session-1', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
        ],
        isLoading: false,
      };

      const afterActivate = sessionManagerReducer(stateWithMessages, {
        type: 'session_activated',
        sessionId: 'session-2',
      });

      const afterError = sessionManagerReducer(afterActivate, {
        type: 'set_error',
        error: 'Session not found',
      });

      // 即使加载失败，messages 仍为数组（不是 error 对象），不会导致 [...dbMessages] 崩溃
      expect(Array.isArray(afterError.messages)).toBe(true);
      expect(afterError.messages).toEqual([]);
      expect(afterError.isLoading).toBe(false);
      expect(afterError.error).toBe('Session not found');
    });
  });

  describe('messages_loaded', () => {
    it('sets messages from a successful load', () => {
      const messages = [
        { id: 'msg-1', session_id: 'session-1', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
      ];

      const next = sessionManagerReducer({ ...initialState, activeSessionId: 'session-1' }, {
        type: 'messages_loaded',
        sessionId: 'session-1',
        messages,
      });

      expect(next.messages).toEqual(messages);
      expect(next.isLoading).toBe(false);
    });

    it('ignores messages_loaded when sessionId does not match activeSessionId', () => {
      // 模拟竞态：用户快速从 session-1 切到 session-2，
      // 但 session-1 的 messages_loaded 事件后到达
      const state = {
        ...initialState,
        activeSessionId: 'session-2',
        messages: [] as ConversationMessage[],
        isLoading: true,
      };

      const staleMessages = [
        { id: 'msg-1', session_id: 'session-1', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
      ];

      const next = sessionManagerReducer(state, {
        type: 'messages_loaded',
        sessionId: 'session-1',
        messages: staleMessages,
      });

      // 不应采用过期消息
      expect(next.messages).toEqual([]);
      // isLoading 保持 true，等待正确的消息到达
      expect(next.isLoading).toBe(true);
    });

    it('accepts messages_loaded when sessionId matches activeSessionId', () => {
      const messages = [
        { id: 'msg-1', session_id: 'session-2', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
      ];

      const next = sessionManagerReducer(
        { ...initialState, activeSessionId: 'session-2', messages: [], isLoading: true },
        { type: 'messages_loaded', sessionId: 'session-2', messages },
      );

      expect(next.messages).toEqual(messages);
      expect(next.isLoading).toBe(false);
    });
  });
});
