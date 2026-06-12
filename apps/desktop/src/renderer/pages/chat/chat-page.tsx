import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatSession } from '../../chat-session';
import { ConnectionBanner } from '../../components/connection-banner';
import { useSessionManager } from '../../session-manager';
import { resolveConversationIdForSend } from '../../session-send';
import { useDaemonConnection } from '../../use-daemon-connection';
import { ChatWorkspace } from './components/chat-workspace';
import { ConversationSidebar } from './components/conversation-sidebar';
import { fetchChatConfig, saveChatConfig } from './lib/chat-config';
import { getEffectiveLevels, MODELS, type ThinkingLevel } from './lib/model-options';

export function ChatPage() {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams();
  const activeSessionId = routeSessionId ?? null;
  const { isConnected } = useDaemonConnection();
  const {
    sessions,
    messages: dbMessages,
    isLoading,
    error: sessionError,
    createSession,
    activateSession,
    deleteSession,
    applySessionTitle,
  } = useSessionManager({ enabled: isConnected, activeSessionId });

  const {
    messages,
    isSending,
    isThinking,
    thinkingContent,
    titleEvent,
    error: chatError,
    sendPrompt,
    cancelCurrentTurn,
  } = useChatSession(window.cashew, { sessionId: activeSessionId });

  const [prompt, setPrompt] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('off');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [pendingPrompt, setPendingPrompt] = useState<{
    content: string;
    sessionId: string;
  } | null>(null);

  useEffect(() => {
    if (isConnected && activeSessionId) {
      activateSession(activeSessionId);
    }
  }, [activeSessionId, activateSession, isConnected]);

  useEffect(() => {
    if (!pendingPrompt || activeSessionId !== pendingPrompt.sessionId) {
      return;
    }

    setPendingPrompt(null);
    sendPrompt(pendingPrompt.content, pendingPrompt.sessionId);
  }, [activeSessionId, pendingPrompt, sendPrompt]);

  useEffect(() => {
    if (!titleEvent) return;

    applySessionTitle(titleEvent.sessionId, titleEvent.title);
  }, [applySessionTitle, titleEvent]);

  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    async function loadChatConfig() {
      try {
        const port = await window.cashew.getDaemonPort();
        if (!port) return;
        const config = await fetchChatConfig(port);
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
        const port = await window.cashew.getDaemonPort();
        if (!port) return;
        await saveChatConfig(port, updates);
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
    const session = await createSession();
    if (session) {
      navigate(`/chat/${session.id}`);
    }
  }, [createSession, navigate]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      if (sessionId === activeSessionId) {
        navigate('/chat');
      }
    },
    [activeSessionId, deleteSession, navigate],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = prompt.trim();
    if (!content || isSending) return;

    const sessionId = await resolveConversationIdForSend(activeSessionId, createSession);
    if (!sessionId) return;

    setPrompt('');

    if (sessionId !== activeSessionId) {
      setPendingPrompt({ content, sessionId });
      navigate(`/chat/${sessionId}`);
      return;
    }

    await sendPrompt(content, sessionId);
  }

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const displayMessages = activeSessionId ? [...dbMessages, ...messages] : messages;
  const latestError = chatError || sessionError;

  return (
    <main className="flex h-screen w-screen min-h-0 min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,253,249,0.96),rgba(250,246,239,0.96))] text-foreground">
      <ConnectionBanner />

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
        <ConversationSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          searchTerm={searchTerm}
          isLoading={isLoading}
          onSearchTermChange={setSearchTerm}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
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
