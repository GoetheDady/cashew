import {
  Archive,
  CaretDown,
  ChatCircleText,
  DotsThreeVertical,
  FileCode,
  FolderSimple,
  GearSix,
  House,
  MagnifyingGlass,
  Microphone,
  NotePencil,
  Paperclip,
  Plus,
  SidebarSimple,
  Sparkle,
  Star,
  Trash,
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
import logoLockup from './assets/cashew-logo-lockup.png';

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string | number;
};

const navItems = [
  { label: 'Home', icon: House },
  { label: 'Chat', icon: ChatCircleText, active: true },
  { label: 'Tasks', icon: Archive },
  { label: 'Tools', icon: Wrench },
  { label: 'Settings', icon: GearSix },
];

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
  const {
    sessions,
    activeSessionId,
    messages: dbMessages,
    isLoading,
    error: sessionError,
    createSession,
    activateSession,
    deleteSession,
  } = useSessionManager();

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
  const totalMessages = displayMessages.length;
  const latestError = chatError || sessionError;

  return (
    <main className="app-shell">
      <ConnectionBanner />
      <aside className="brand-rail" aria-label="Primary">
        <div className="brand-lockup">
          <img src={logoLockup} alt="Cashew" />
        </div>

        <nav className="rail-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`rail-link ${item.active ? 'is-active' : ''}`}
                type="button"
              >
                <Icon size={22} weight="regular" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="agent-status">
          <span className="agent-status__light" aria-hidden="true" />
          <span>Local agent ready</span>
        </div>
      </aside>

      <aside className="conversation-panel" aria-label="Conversations">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Workspace</p>
            <h1>Conversations</h1>
          </div>
          <button className="icon-button" onClick={() => createSession()} type="button" aria-label="New chat">
            <NotePencil size={19} />
          </button>
        </div>

        <label className="search-field">
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search conversations</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations..."
          />
        </label>

        <div className="conversation-tabs" aria-label="Conversation filters">
          <button className="is-selected" type="button">Recent</button>
          <button type="button">Starred</button>
        </div>

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
              <button onClick={() => createSession()} type="button">Start one</button>
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
                      <button
                        onClick={() => activateSession(session.id)}
                        className="session-card__main"
                        type="button"
                      >
                        <span className="session-card__title">{session.title}</span>
                        <span className="session-card__meta">
                          {formatTime(session.updated_at)}
                        </span>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="session-card__delete"
                        type="button"
                        aria-label={`Delete ${session.title}`}
                      >
                        <X size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <button className="new-chat-button" onClick={() => createSession()} type="button">
          <Plus size={18} />
          <span>New chat</span>
        </button>
      </aside>

      <section className="chat-workspace" aria-label="Chat workspace">
        <header className="chat-header">
          <div className="chat-title">
            <button className="ghost-icon" type="button" aria-label="Toggle sidebar">
              <SidebarSimple size={20} />
            </button>
            <div>
              <p className="section-kicker">Current thread</p>
              <h2>{activeSession?.title || 'Cashew Agent'}</h2>
            </div>
            <button className="ghost-icon" type="button" aria-label="Rename conversation">
              <NotePencil size={18} />
            </button>
          </div>

          <div className="chat-controls">
            <button className="model-select" type="button">
              <Sparkle size={18} />
              <span>Model: DeepSeek</span>
              <CaretDown size={14} />
            </button>
            <button className="memory-toggle" type="button" aria-pressed="true">
              <span>Memory</span>
              <span className="memory-toggle__track">
                <span />
              </span>
            </button>
            <button className="icon-button" type="button" aria-label="More actions">
              <DotsThreeVertical size={20} />
            </button>
          </div>
        </header>

        <div className="message-stage">
          <div className="message-scroll">
            {displayMessages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-chat__mark">
                  <img src={logoLockup} alt="" />
                </div>
                <h3>Start with a clear request</h3>
                <p>Cashew is ready for planning, coding, and local project work.</p>
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
              <button className="icon-button" type="button" aria-label="Attach file">
                <Paperclip size={20} />
              </button>
              <button className="tool-button" type="button">
                <Wrench size={18} />
                <span>Tools</span>
                <CaretDown size={14} />
              </button>
            </div>
            <div className="composer-tools">
              <button className="icon-button" type="button" aria-label="Voice input">
                <Microphone size={20} />
              </button>
              <button
                disabled={!isSending && !prompt.trim()}
                onClick={isSending ? cancelCurrentTurn : undefined}
                className="send-button"
                type={isSending ? 'button' : 'submit'}
              >
                {isSending ? <X size={22} /> : <Plus size={22} weight="bold" />}
                <span className="sr-only">{isSending ? 'Cancel' : 'Send'}</span>
              </button>
            </div>
          </div>
        </form>
      </section>

      <aside className="details-panel" aria-label="Conversation details">
        <div className="details-header">
          <div className="details-tabs">
            <button className="is-selected" type="button">Details</button>
            <button type="button">Context</button>
          </div>
          <button className="ghost-icon" type="button" aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <section className="detail-block">
          <div className="detail-title-row">
            <h2>{activeSession?.title || 'New conversation'}</h2>
            <button className="ghost-icon" type="button" aria-label="Favorite conversation">
              <Star size={18} />
            </button>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Created</dt>
              <dd>{formatDay(activeSession?.created_at)}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>DeepSeek</dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>{totalMessages}</dd>
            </div>
            <div>
              <dt>Tokens used</dt>
              <dd>{totalMessages > 0 ? `${Math.max(totalMessages * 240, 240)}` : '0'}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-block">
          <h3>Tags</h3>
          <div className="tag-list">
            <span>planning</span>
            <span>architecture</span>
            <button type="button" aria-label="Add tag">
              <Plus size={14} />
            </button>
          </div>
        </section>

        <section className="detail-card">
          <h3>Files referenced</h3>
          <div className="file-list">
            <div>
              <FolderSimple size={18} />
              <span>~/gdsw/cashew</span>
            </div>
            <div>
              <FileCode size={18} />
              <span>package.json</span>
            </div>
            <div>
              <FileCode size={18} />
              <span>renderer.tsx</span>
            </div>
          </div>
        </section>

        <section className="detail-card">
          <h3>Notes</h3>
          <p>Planning the foundation for Cashew as a local-first personal agent.</p>
          <button className="note-button" type="button">
            <NotePencil size={16} />
            <span>Edit notes</span>
          </button>
        </section>

        <section className="detail-card actions-card">
          <button type="button">
            <Archive size={18} />
            <span>Export conversation</span>
          </button>
          <button className="danger" onClick={() => activeSessionId && deleteSession(activeSessionId)} type="button">
            <Trash size={18} />
            <span>Delete conversation</span>
          </button>
        </section>
      </aside>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(<App />);
