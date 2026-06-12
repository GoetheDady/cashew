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
  titleEvent: Extract<ChatEvent, { type: 'title' }> | null;
  completedTurnId: ChatTurnId | null;
  /** 当前 turn 是否正在输出思考内容 */
  isThinking: boolean;
  /** 当前 turn 的思考内容（思考结束后保留，供 UI 折叠展示） */
  thinkingContent: string;
}

type ChatSessionAction =
  | {
      type: 'event';
      event: ChatEvent;
    }
  | {
      type: 'send_failed';
      message: string;
    }
  | {
      type: 'session_changed';
      sessionId: string | null;
    };

export const initialChatSessionState: ChatSessionState = {
  sessionId: null,
  messages: [],
  isSending: false,
  currentTurnId: null,
  error: null,
  titleEvent: null,
  completedTurnId: null,
  isThinking: false,
  thinkingContent: '',
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

  // 切换会话时清空消息列表和思考状态，避免残留旧会话的数据
  if (action.type === 'session_changed') {
    return {
      ...initialChatSessionState,
      sessionId: action.sessionId,
    };
  }

  const { event } = action;

  if (
    event.type === 'turn_started' &&
    state.sessionId !== null &&
    event.sessionId !== state.sessionId
  ) {
    return state;
  }

  if (
    event.type !== 'turn_started' &&
    event.type !== 'session_ready' &&
    event.type !== 'title' &&
    state.sessionId !== null &&
    state.currentTurnId !== event.turnId
  ) {
    return state;
  }

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
        isThinking: false,
        thinkingContent: '',
      };

    case 'thinking_start':
      return {
        ...state,
        isThinking: true,
        thinkingContent: '',
      };

    case 'thinking_delta':
      return {
        ...state,
        thinkingContent: state.thinkingContent + event.delta,
      };

    case 'thinking_end':
      return {
        ...state,
        isThinking: false,
        // thinkingContent 保留，供 UI 展示折叠的思考内容
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
        completedTurnId: event.turnId,
      };

    case 'title':
      return {
        ...state,
        titleEvent: event,
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

export function useChatSession(
  transport: ChatTransport = window.cashew,
  { sessionId }: { sessionId: string | null } = { sessionId: null },
) {
  const [state, dispatch] = useReducer(chatSessionReducer, initialChatSessionState);

  // 切换会话时清空 chat 消息（turn_started 后的 stream 消息），
  // 避免旧会话的 turn 消息残留到新会话的 displayMessages 中
  useEffect(() => {
    dispatch({ type: 'session_changed', sessionId });
  }, [sessionId]);

  useEffect(() => {
    return transport.subscribeChatEvents((event) => {
      dispatch({
        type: 'event',
        event,
      });
    });
  }, [transport]);

  const sendPrompt = useCallback(
    async (prompt: string, sessionId?: string) => {
      try {
        await transport.sendChatCommand({
          type: 'start_turn',
          prompt,
          sessionId,
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
