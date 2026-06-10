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
