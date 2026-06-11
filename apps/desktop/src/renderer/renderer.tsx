import {
  ArrowUp,
  CaretDown,
  DotsThreeVertical,
  GearSix,
  MagnifyingGlass,
  Microphone,
  NotePencil,
  Paperclip,
  Sparkle,
  Wrench,
  X,
} from '@phosphor-icons/react';
import { FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DBMessage } from '@cashew/shared';
import './index.css';
import { useChatSession } from './chat-session';
import { useSessionManager } from './session-manager';
import { ConnectionBanner } from './components/connection-banner';
import { Button } from './components/ui/button';
import { useDaemonConnection } from './use-daemon-connection';
import logoLockup from './assets/cashew-logo-lockup.png';
type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string | number;
};

function formatTime(value?: string | number) {
  if (!value) {
    return '';
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDay(value?: number) {
  if (!value) {
    return 'Today';
  }

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getMessageTimestamp(message: DisplayMessage) {
  return 'created_at' in message
    ? (message as DisplayMessage & Pick<DBMessage, 'created_at'>).created_at
    : message.createdAt;
}

function App() {
  const { isConnected } = useDaemonConnection();
  const {
    sessions,
    activeSessionId,
    messages: dbMessages,
    isLoading,
    error: sessionError,
    createSession,
    activateSession,
    deleteSession,
  } = useSessionManager({ enabled: isConnected });

  const { messages, isSending, error: chatError, sendPrompt, cancelCurrentTurn } = useChatSession();
  const [prompt, setPrompt] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const filteredSessions = sessions.filter((session) =>
    session.title.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

  const groupedSessions = useMemo(() => {
    return filteredSessions.reduce<Record<string, typeof sessions>>((groups, session) => {
      const group = formatDay(session.updated_at);
      return {
        ...groups,
        [group]: [...(groups[group] || []), session],
      };
    }, {});
  }, [filteredSessions]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = prompt.trim();

    if (!content || isSending) {
      return;
    }

    if (!activeSessionId) {
      await createSession();
    }

    setPrompt('');
    await sendPrompt(content);
  }

  const displayMessages: DisplayMessage[] = activeSessionId
    ? [...dbMessages, ...messages]
    : messages;
  const latestError = chatError || sessionError;

  return (
    <main className="app-shell">
      <ConnectionBanner />

      <aside className="conversation-panel" aria-label="Conversations">
        <div className="sidebar-top">
          <div className="app-mark">
            <img src={logoLockup} alt="Cashew" />
          </div>
          <Button className="icon-button" variant="ghost" size="icon" type="button" aria-label="Settings">
            <GearSix size={19} />
          </Button>
        </div>

        <Button className="new-chat-button" variant="secondary" onClick={() => createSession()} type="button">
          <NotePencil size={18} />
          <span>New chat</span>
        </Button>

        <label className="search-field">
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search conversations</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations..."
          />
        </label>

        <div className="conversation-list">
          {isLoading && sessions.length === 0 ? (
            <div className="session-skeleton" aria-label="Loading conversations">
              <span />
              <span />
              <span />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="empty-panel">
              <Sparkle size={22} />
              <p>No conversations found</p>
              <Button onClick={() => createSession()} type="button">Start one</Button>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([group, groupSessions]) => (
              <section key={group} className="session-group">
                <h2>{group}</h2>
                <div className="session-group__items">
                  {groupSessions.map((session) => (
                    <article
                      key={session.id}
                      className={`session-card ${
                        activeSessionId === session.id ? 'is-active' : ''
                      }`}
                    >
                      <Button
                        onClick={() => activateSession(session.id)}
                        className="session-card__main"
                        variant="ghost"
                        type="button"
                      >
                        <span className="session-card__title">{session.title}</span>
                        <span className="session-card__meta">
                          {formatTime(session.updated_at)}
                        </span>
                      </Button>
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="session-card__delete"
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label={`Delete ${session.title}`}
                      >
                        <X size={14} />
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <span className="agent-status__light" aria-hidden="true" />
          <span>Local agent ready</span>
        </div>
      </aside>

      <section className="chat-workspace" aria-label="Chat workspace">
        <header className="chat-header">
          <div className="chat-title">
            <div>
              <h2>{activeSession?.title || 'Cashew Agent'}</h2>
              <p>{activeSession ? formatDay(activeSession.updated_at) : 'New conversation'}</p>
            </div>
          </div>

          <div className="chat-controls">
            <Button className="model-select" variant="secondary" type="button">
              <Sparkle size={18} />
              <span>DeepSeek</span>
              <CaretDown size={14} />
            </Button>
            <Button className="icon-button" variant="ghost" size="icon" type="button" aria-label="More actions">
              <DotsThreeVertical size={20} />
            </Button>
          </div>
        </header>

        <div className="message-stage">
          <div className="message-scroll">
            {displayMessages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-chat__mark">
                  <img src={logoLockup} alt="" />
                </div>
                <h3>What can I help with?</h3>
              </div>
            ) : (
              displayMessages.map((message) => {
                const isUser = message.role === 'user';
                const timestamp = formatTime(getMessageTimestamp(message));

                return (
                  <article
                    key={message.id}
                    className={`message-bubble ${isUser ? 'is-user' : 'is-assistant'}`}
                  >
                    {!isUser ? (
                      <div className="message-avatar">
                        <img src={logoLockup} alt="" />
                      </div>
                    ) : null}
                    <div className="message-card">
                      <div className="message-card__meta">
                        <span>{isUser ? 'You' : 'Cashew'}</span>
                        {timestamp ? <time>{timestamp}</time> : null}
                      </div>
                      <p>{message.content || (isSending ? 'Thinking...' : '')}</p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {latestError ? (
          <div className="inline-error" role="alert">
            {latestError}
          </div>
        ) : null}

        <form onSubmit={sendMessage} className="composer">
          <label className="sr-only" htmlFor="prompt-input">Message Cashew</label>
          <textarea
            id="prompt-input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Cashew to think, plan, or act..."
            rows={1}
          />
          <div className="composer-actions">
            <div className="composer-tools">
              <Button className="icon-button" variant="ghost" size="icon" type="button" aria-label="Attach file">
                <Paperclip size={20} />
              </Button>
              <Button className="tool-button" variant="secondary" type="button">
                <Wrench size={18} />
                <span>Tools</span>
                <CaretDown size={14} />
              </Button>
            </div>
            <div className="composer-tools">
              <Button className="icon-button" variant="ghost" size="icon" type="button" aria-label="Voice input">
                <Microphone size={20} />
              </Button>
              <Button
                disabled={!isSending && !prompt.trim()}
                onClick={isSending ? cancelCurrentTurn : undefined}
                className="send-button"
                variant="default"
                size="icon"
                type={isSending ? 'button' : 'submit'}
              >
                {isSending ? <X size={22} /> : <ArrowUp size={21} weight="bold" />}
                <span className="sr-only">{isSending ? 'Cancel' : 'Send'}</span>
              </Button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(<App />);
