import { createRoot } from 'react-dom/client';
import { FormEvent, useState } from 'react';
import './index.css';
import type { ChatMessage } from '@cashew/shared';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = prompt.trim();

    if (!content || isSending) {
      return;
    }

    setError(null);
    setPrompt('');
    setIsSending(true);

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: now,
    };

    setMessages((current) => [...current, userMessage]);

    try {
      const response = await window.cashew.chat({ prompt: content });
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.text || '(empty response)',
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1b1d22]">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-8 py-10">
        <header className="flex items-center justify-between border-b border-[#ded8cc] pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#826c4f]">
              Cashew
            </p>
            <h1 className="mt-2 text-3xl font-semibold">DeepSeek chat</h1>
          </div>
          <span className="rounded border border-[#c9beb0] bg-white px-3 py-1 text-sm text-[#5f564d]">
            DEEPSEEK_API_KEY
          </span>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-6 py-8">
          <aside className="border-r border-[#ded8cc] pr-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#826c4f]">
              Runtime
            </h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-[#7a7168]">Agent core</dt>
                <dd className="mt-1 font-medium">@earendil-works/pi-agent-core</dd>
              </div>
              <div>
                <dt className="text-[#7a7168]">Model layer</dt>
                <dd className="mt-1 font-medium">@earendil-works/pi-ai</dd>
              </div>
              <div>
                <dt className="text-[#7a7168]">Model</dt>
                <dd className="mt-1 font-medium">deepseek-v4-flash</dd>
              </div>
            </dl>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col rounded border border-[#ded8cc] bg-white">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <p className="text-sm text-[#7a7168]">
                    Send a message to start a simple DeepSeek conversation.
                  </p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        message.role === 'user'
                          ? 'ml-auto max-w-[80%] rounded bg-[#1b1d22] px-4 py-3 text-white'
                          : 'mr-auto max-w-[80%] rounded border border-[#ded8cc] bg-[#fbfaf7] px-4 py-3'
                      }
                    >
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    </article>
                  ))
                )}
              </div>

              {error ? (
                <div className="border-t border-[#ead3cd] bg-[#fff4f1] px-5 py-3 text-sm text-[#9c3d2f]">
                  {error}
                </div>
              ) : null}

              <form
                onSubmit={sendMessage}
                className="flex gap-3 border-t border-[#ded8cc] p-4"
              >
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-[#c9beb0] bg-white px-4 py-3 outline-none focus:border-[#826c4f]"
                  placeholder="Ask Cashew..."
                />
                <button
                  disabled={isSending || !prompt.trim()}
                  className="w-24 rounded bg-[#1b1d22] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#b6afa5]"
                  type="submit"
                >
                  {isSending ? 'Sending' : 'Send'}
                </button>
              </form>
            </div>
          </section>
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
