import { createRoot } from 'react-dom/client';
import { FormEvent, useState } from 'react';
import './index.css';
import { useChatSession } from './chat-session';
import { useSessionManager } from './session-manager';

function App() {
  const {
    sessions,
    activeSessionId,
    messages: dbMessages,
    isLoading,
    createSession,
    activateSession,
    deleteSession,
  } = useSessionManager();

  const { messages, isSending, error, sendPrompt, cancelCurrentTurn } = useChatSession();
  const [prompt, setPrompt] = useState('');

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = prompt.trim();

    if (!content || isSending) {
      return;
    }

    // 如果没有激活会话，先创建一个
    if (!activeSessionId) {
      await createSession();
    }

    setPrompt('');
    await sendPrompt(content);
  }

  // 合并数据库消息和当前会话的实时消息
  // TODO: 后续需要将实时消息持久化到数据库
  const displayMessages = activeSessionId ? [...dbMessages, ...messages] : messages;

  return (
    <main className="flex h-screen bg-[#f7f5ef] text-[#1b1d22]">
      {/* 左侧会话列表 */}
      <aside className="flex w-64 flex-col border-r border-[#ded8cc] bg-white">
        <header className="border-b border-[#ded8cc] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#826c4f]">Cashew</p>
          <h1 className="mt-1 text-lg font-semibold">会话历史</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => createSession()}
            className="mb-2 w-full rounded border border-[#c9beb0] bg-white px-3 py-2 text-left text-sm font-medium hover:bg-[#f7f5ef]"
          >
            + 新建会话
          </button>

          {isLoading && sessions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#7a7168]">加载中...</p>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative rounded px-3 py-2 text-sm ${
                    activeSessionId === session.id
                      ? 'bg-[#1b1d22] text-white'
                      : 'hover:bg-[#f7f5ef]'
                  }`}
                >
                  <button
                    onClick={() => activateSession(session.id)}
                    className="w-full truncate text-left"
                  >
                    {session.title}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className={`absolute right-2 top-2 rounded p-1 text-xs opacity-0 group-hover:opacity-100 ${
                      activeSessionId === session.id
                        ? 'hover:bg-[#3a3c42]'
                        : 'hover:bg-[#ded8cc]'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-[#ded8cc] p-3 text-xs text-[#7a7168]">
          <div className="space-y-1">
            <div>
              <span className="font-medium">Model:</span> deepseek-v4-flash
            </div>
            <div>
              <span className="font-medium">Sessions:</span> {sessions.length}
            </div>
          </div>
        </footer>
      </aside>

      {/* 右侧聊天区域 */}
      <section className="flex flex-1 flex-col">
        <header className="border-b border-[#ded8cc] px-6 py-4">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#826c4f]">
            {activeSessionId ? '当前会话' : '欢迎'}
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {activeSessionId
              ? sessions.find((s) => s.id === activeSessionId)?.title || 'New Chat'
              : 'Cashew Agent'}
          </h2>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <div className="flex min-h-0 flex-1 flex-col rounded border border-[#ded8cc] bg-white">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {displayMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-[#7a7168]">开始新的对话</p>
                    <p className="mt-2 text-xs text-[#b6afa5]">
                      选择左侧会话或创建新会话开始聊天
                    </p>
                  </div>
                </div>
              ) : (
                displayMessages.map((message) => (
                  <article
                    key={message.id}
                    className={
                      message.role === 'user'
                        ? 'ml-auto max-w-[80%] rounded bg-[#1b1d22] px-4 py-3 text-white'
                        : 'mr-auto max-w-[80%] rounded border border-[#ded8cc] bg-[#fbfaf7] px-4 py-3'
                    }
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  </article>
                ))
              )}
            </div>

            {error ? (
              <div className="border-t border-[#ead3cd] bg-[#fff4f1] px-5 py-3 text-sm text-[#9c3d2f]">
                {error}
              </div>
            ) : null}

            <form onSubmit={sendMessage} className="flex gap-3 border-t border-[#ded8cc] p-4">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-w-0 flex-1 rounded border border-[#c9beb0] bg-white px-4 py-3 outline-none focus:border-[#826c4f]"
                placeholder="输入消息..."
              />
              <button
                disabled={!isSending && !prompt.trim()}
                onClick={isSending ? cancelCurrentTurn : undefined}
                className="w-24 rounded bg-[#1b1d22] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#b6afa5]"
                type={isSending ? 'button' : 'submit'}
              >
                {isSending ? '取消' : '发送'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(<App />);
