import { useCallback, useEffect, useReducer } from 'react';
import type { ChatEvent, ChatMessage, ChatTurnId } from '@cashew/shared';

export interface ChatTransport {
  sendChatCommand: Window['cashew']['sendChatCommand'];
  subscribeChatEvents: Window['cashew']['subscribeChatEvents'];
}

export interface ChatSessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  currentTurnId: ChatTurnId | null;
  error: string | null;
}

type ChatSessionAction =
  | {
      type: 'event';
      event: ChatEvent;
    }
  | {
      type: 'send_failed';
      message: string;
    };

export const initialChatSessionState: ChatSessionState = {
  sessionId: null,
  messages: [],
  isSending: false,
  currentTurnId: null,
  error: null,
};

function assistantPlaceholder(turnId: ChatTurnId, createdAt: string): ChatMessage {
  return {
    id: `${turnId}:assistant`,
    role: 'assistant',
    content: '',
    createdAt,
  };
}

function replaceMessage(
  messages: ChatMessage[],
  id: string,
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((message) => (message.id === id ? update(message) : message));
}

export function chatSessionReducer(
  state: ChatSessionState,
  action: ChatSessionAction,
): ChatSessionState {
  if (action.type === 'send_failed') {
    return {
      ...state,
      isSending: false,
      currentTurnId: null,
      error: action.message,
    };
  }

  const { event } = action;

  switch (event.type) {
    case 'session_ready':
      return {
        ...state,
        sessionId: event.sessionId,
      };

    case 'turn_started':
      return {
        ...state,
        sessionId: event.sessionId,
        messages: [
          ...state.messages,
          event.message,
          assistantPlaceholder(event.turnId, event.message.createdAt),
        ],
        isSending: true,
        currentTurnId: event.turnId,
        error: null,
      };

    case 'assistant_delta':
      return {
        ...state,
        messages: replaceMessage(
          state.messages,
          `${event.turnId}:assistant`,
          (message) => ({
            ...message,
            content: `${message.content}${event.delta}`,
          }),
        ),
      };

    case 'turn_completed':
      return {
        ...state,
        messages: replaceMessage(
          state.messages,
          `${event.turnId}:assistant`,
          () => event.message,
        ),
        isSending: false,
        currentTurnId: null,
      };

    case 'turn_failed':
      return {
        ...state,
        isSending: false,
        currentTurnId: null,
        error: event.message,
      };

    case 'turn_cancelled':
      return {
        ...state,
        isSending: false,
        currentTurnId: null,
      };

    default:
      return state;
  }
}

export function useChatSession(transport: ChatTransport = window.cashew) {
  const [state, dispatch] = useReducer(chatSessionReducer, initialChatSessionState);

  useEffect(() => {
    return transport.subscribeChatEvents((event) => {
      dispatch({
        type: 'event',
        event,
      });
    });
  }, [transport]);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      try {
        await transport.sendChatCommand({
          type: 'start_turn',
          prompt,
        });
      } catch (error) {
        dispatch({
          type: 'send_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [transport],
  );

  const cancelCurrentTurn = useCallback(async () => {
    if (!state.currentTurnId) {
      return;
    }

    try {
      await transport.sendChatCommand({
        type: 'cancel_turn',
        turnId: state.currentTurnId,
      });
    } catch (error) {
      dispatch({
        type: 'send_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [state.currentTurnId, transport]);

  return {
    ...state,
    sendPrompt,
    cancelCurrentTurn,
  };
}
