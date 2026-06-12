import type { DaemonStatus } from '@cashew/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatWorkspace } from './components/chat-workspace';
import { ConversationSidebar } from './components/conversation-sidebar';
import { useActiveConversation } from './hooks/active-conversation';
import { normalizeChatConfig } from './lib/chat-config';
import { getEffectiveLevels, MODELS, type ThinkingLevel } from './lib/model-options';
import { ConversationSendCoordinator } from './lib/conversation-send';

type ChatPageProps = {
  daemonStatus: DaemonStatus;
  isConnected: boolean;
  onReconnect: () => void;
};

export function ChatPage({ daemonStatus, isConnected, onReconnect }: ChatPageProps) {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams();
  const activeSessionId = routeSessionId ?? null;
  const {
    conversations: sessions,
    activeConversation: activeSession,
    messages: displayMessages,
    isLoading,
    isSending,
    isThinking,
    thinkingContent,
    error: latestError,
    createConversation: createSession,
    deleteConversation: deleteSession,
    sendPrompt,
    cancelCurrentTurn,
  } = useActiveConversation({
    enabled: isConnected,
    conversationId: activeSessionId,
  });

  const [prompt, setPrompt] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('off');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const sendCoordinator = useRef<ConversationSendCoordinator | null>(null);
  const sendDependencies = { createConversation: createSession, navigate, sendPrompt };
  if (!sendCoordinator.current) {
    sendCoordinator.current = new ConversationSendCoordinator(sendDependencies);
  } else {
    sendCoordinator.current.updateDependencies(sendDependencies);
  }

  useEffect(() => {
    if (isConnected && activeSessionId) {
      sendCoordinator.current?.activate(activeSessionId);
    }
  }, [activeSessionId, isConnected]);

  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    async function loadChatConfig() {
      try {
        const config = normalizeChatConfig(await window.cashew.getChatConfig());
        if (cancelled) return;

        setSelectedModel(config.model);
        setThinkingLevel(config.thinkingLevel);
      } catch {
        // 配置读取失败不影响聊天页面启动。
      }
    }

    loadChatConfig();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const updateDaemonConfig = useCallback(
    async (updates: { thinkingLevel?: ThinkingLevel; model?: string }) => {
      if (!isConnected) return;
      try {
        await window.cashew.saveChatConfig(updates);
      } catch {
        // 配置更新失败不影响发送消息。
      }
    },
    [isConnected],
  );

  const handleThinkingChange = useCallback(
    (level: ThinkingLevel) => {
      setThinkingLevel(level);
      updateDaemonConfig({ thinkingLevel: level });
    },
    [updateDaemonConfig],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      const newEffective = getEffectiveLevels(modelId);
      const needsReset = !newEffective.includes(thinkingLevel);
      setSelectedModel(modelId);
      if (needsReset) {
        setThinkingLevel('off');
        updateDaemonConfig({ model: modelId, thinkingLevel: 'off' });
      } else {
        updateDaemonConfig({ model: modelId });
      }
    },
    [updateDaemonConfig, thinkingLevel],
  );

  const handleCreateSession = useCallback(async () => {
    if (!isConnected) return;
    const session = await createSession();
    if (session) {
      navigate(`/chat/${session.id}`);
    }
  }, [createSession, isConnected, navigate]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!isConnected) return;
      await deleteSession(sessionId);
      if (sessionId === activeSessionId) {
        navigate('/chat');
      }
    },
    [activeSessionId, deleteSession, isConnected, navigate],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = prompt.trim();
    if (!content || isSending || !isConnected) return;

    const accepted = await sendCoordinator.current?.send(activeSessionId, content);
    if (accepted) setPrompt('');
  }

  return (
    <main className="chat-page-shell flex h-screen w-screen min-h-0 min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,253,249,0.96),rgba(250,246,239,0.96))] text-foreground">
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <ConversationSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          searchTerm={searchTerm}
          isLoading={isLoading}
          daemonStatus={daemonStatus}
          onSearchTermChange={setSearchTerm}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onReconnect={onReconnect}
        />

        <ChatWorkspace
          activeSession={activeSession}
          activeSessionId={activeSessionId}
          messages={displayMessages}
          prompt={prompt}
          selectedModel={selectedModel}
          thinkingLevel={thinkingLevel}
          isLoading={isLoading}
          isSending={isSending}
          isThinking={isThinking}
          thinkingContent={thinkingContent}
          error={latestError}
          isConnected={isConnected}
          onPromptChange={setPrompt}
          onModelChange={handleModelChange}
          onThinkingChange={handleThinkingChange}
          onSendMessage={sendMessage}
          onCancelTurn={cancelCurrentTurn}
        />
      </div>
    </main>
  );
}
