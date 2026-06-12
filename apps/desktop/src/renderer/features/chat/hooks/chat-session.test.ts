import { describe, expect, it } from 'vitest';
import { chatSessionReducer, initialChatSessionState } from './chat-session';

describe('chatSessionReducer', () => {
  it('adds a user message and streams into an assistant placeholder', () => {
    const started = chatSessionReducer(initialChatSessionState, {
      type: 'event',
      event: {
        type: 'turn_started',
        sessionId: 'session-1',
        turnId: 'turn-1',
        message: {
          id: 'user-1',
          role: 'user',
          content: 'Hi',
          createdAt: '2026-06-10T00:00:00.000Z',
        },
      },
    });
    const streamed = chatSessionReducer(started, {
      type: 'event',
      event: {
        type: 'assistant_delta',
        turnId: 'turn-1',
        delta: 'Hello',
      },
    });

    expect(streamed.isSending).toBe(true);
    expect(streamed.currentTurnId).toBe('turn-1');
    expect(streamed.messages).toHaveLength(2);
    expect(streamed.messages[1]).toMatchObject({
      id: 'turn-1:assistant',
      role: 'assistant',
      content: 'Hello',
    });
  });

  it('streams thinking content and marks end', () => {
    const state = chatSessionReducer(initialChatSessionState, {
      type: 'event',
      event: { type: 'thinking_start', turnId: 'turn-1' },
    });
    expect(state.isThinking).toBe(true);
    expect(state.thinkingContent).toBe('');

    const withDelta = chatSessionReducer(state, {
      type: 'event',
      event: { type: 'thinking_delta', turnId: 'turn-1', delta: 'Let me think' },
    });
    expect(withDelta.isThinking).toBe(true);
    expect(withDelta.thinkingContent).toBe('Let me think');

    const afterEnd = chatSessionReducer(withDelta, {
      type: 'event',
      event: { type: 'thinking_end', turnId: 'turn-1' },
    });
    // isThinking 置 false，但 thinkingContent 保留
    expect(afterEnd.isThinking).toBe(false);
    expect(afterEnd.thinkingContent).toBe('Let me think');
  });

  it('session_changed resets messages, thinkingContent, and turn state', () => {
    const stateWithMessages: typeof initialChatSessionState = {
      ...initialChatSessionState,
      sessionId: 'old-session',
      messages: [
        { id: 'user-1', role: 'user', content: 'Hi', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'turn-1:assistant', role: 'assistant', content: 'Hello', createdAt: '2026-01-01T00:00:01.000Z' },
      ],
      isSending: false,
      currentTurnId: null,
      isThinking: false,
      thinkingContent: 'previous thinking',
    };

    const next = chatSessionReducer(stateWithMessages, {
      type: 'session_changed',
      sessionId: 'new-session',
    });

    expect(next.sessionId).toBe('new-session');
    expect(next.messages).toEqual([]);
    expect(next.isSending).toBe(false);
    expect(next.currentTurnId).toBeNull();
    expect(next.isThinking).toBe(false);
    expect(next.thinkingContent).toBe('');
  });

  it('ignores stale streamed events after switching the active Conversation', () => {
    const switched = chatSessionReducer({
      ...initialChatSessionState,
      sessionId: 'old-conversation',
      currentTurnId: 'old-turn',
      isSending: true,
    }, {
      type: 'session_changed',
      sessionId: 'new-conversation',
    });

    const staleStart = chatSessionReducer(switched, {
      type: 'event',
      event: {
        type: 'turn_started',
        sessionId: 'old-conversation',
        turnId: 'old-turn',
        message: {
          id: 'old-message',
          role: 'user',
          content: 'stale',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });
    const staleDelta = chatSessionReducer(staleStart, {
      type: 'event',
      event: { type: 'thinking_delta', turnId: 'old-turn', delta: 'stale thinking' },
    });

    expect(staleDelta).toEqual(switched);
  });

  it('stores title events from the chat stream', () => {
    const next = chatSessionReducer(initialChatSessionState, {
      type: 'event',
      event: {
        type: 'title',
        sessionId: 'session-1',
        turnId: 'turn-1',
        title: '前端路由重构',
      },
    });

    expect(next.titleEvent).toEqual({
      type: 'title',
      sessionId: 'session-1',
      turnId: 'turn-1',
      title: '前端路由重构',
    });
  });

  it('finishes completed, failed, and cancelled turns', () => {
    const sendingState = {
      ...initialChatSessionState,
      isSending: true,
      currentTurnId: 'turn-1',
    };

    expect(
      chatSessionReducer(sendingState, {
        type: 'event',
        event: {
          type: 'turn_cancelled',
          turnId: 'turn-1',
        },
      }),
    ).toMatchObject({
      isSending: false,
      currentTurnId: null,
    });

    expect(
      chatSessionReducer(sendingState, {
        type: 'event',
        event: {
          type: 'turn_failed',
          turnId: 'turn-1',
          code: 'agent_execution_failed',
          message: 'Boom',
        },
      }),
    ).toMatchObject({
      isSending: false,
      currentTurnId: null,
      error: 'Boom',
    });
  });
});
