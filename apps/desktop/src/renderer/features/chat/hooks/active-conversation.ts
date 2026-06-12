import { useEffect } from 'react';
import { useChatSession, type ChatTransport } from './chat-session';
import { useSessionManager } from './session-manager';

export function useActiveConversation({
  enabled,
  conversationId,
  transport = window.cashew,
}: {
  enabled: boolean;
  conversationId: string | null;
  transport?: ChatTransport;
}) {
  const history = useSessionManager({ enabled, activeSessionId: conversationId });
  const chat = useChatSession(transport, { sessionId: conversationId });

  useEffect(() => {
    if (enabled && conversationId) {
      history.activateSession(conversationId);
    }
  }, [conversationId, enabled, history.activateSession]);

  useEffect(() => {
    if (chat.titleEvent) {
      history.applySessionTitle(chat.titleEvent.sessionId, chat.titleEvent.title);
    }
  }, [chat.titleEvent, history.applySessionTitle]);

  useEffect(() => {
    if (chat.completedTurnId && conversationId) {
      history.touchSession(conversationId);
    }
  }, [chat.completedTurnId, conversationId, history.touchSession]);

  const activeConversation = history.sessions.find(
    (conversation) => conversation.id === conversationId,
  );

  return {
    conversations: history.sessions,
    activeConversation,
    messages: conversationId ? [...history.messages, ...chat.messages] : chat.messages,
    isLoading: history.isLoading,
    isSending: chat.isSending,
    isThinking: chat.isThinking,
    thinkingContent: chat.thinkingContent,
    error: chat.error || history.error,
    createConversation: history.createSession,
    deleteConversation: history.deleteSession,
    sendPrompt: chat.sendPrompt,
    cancelCurrentTurn: chat.cancelCurrentTurn,
  };
}
