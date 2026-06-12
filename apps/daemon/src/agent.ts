import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { complete, getModel, registerBuiltInApiProviders } from '@earendil-works/pi-ai';
import type { Context, ProviderStreamOptions } from '@earendil-works/pi-ai';
import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatTurnId } from '@cashew/shared';
import { loadConfig, type DaemonConfig } from './config.js';
import { DEFAULT_CONFIG_PATH } from './app.js';

// 重新导出 config 类型，方便外部使用
export type { DaemonConfig };
export { loadConfig };

type ChatEventSink = (event: ChatEvent) => Promise<void> | void;
type AgentMessage = Extract<AgentEvent, { type: 'message_end' }>['message'];
type GenerateTitleFn = (input: {
  config: DaemonConfig;
  userPrompt: string;
  assistantText: string;
}) => Promise<string>;

// ---------- Agent 工厂（可注入）----------

export interface AgentLike {
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(input: string): Promise<void>;
  abort(): void;
  /** Agent 运行状态（thinkingLevel 等可动态修改） */
  readonly state: { thinkingLevel: string };
}

/** Agent 工厂函数类型，返回 AgentLike 实例 */
export type CreateAgentFn = (config: DaemonConfig, sessionId: string) => AgentLike;

/** 默认 Agent 工厂：创建真实的 pi-agent-core Agent */
export const defaultCreateAgent: CreateAgentFn = (config, sessionId) => {
  registerBuiltInApiProviders();
  // config 来自用户配置，provider 和 model 是动态字符串，需 cast 通过 API 类型检查
  const model = getModel(config.provider as never, config.model as never);

  return new Agent({
    sessionId,
    initialState: {
      systemPrompt: 'You are Cashew, a concise and helpful desktop agent.',
      model,
      thinkingLevel: config.thinkingLevel as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
      tools: [],
      messages: [],
    },
    getApiKey: (provider: string) => (provider === config.provider ? config.apiKey : undefined),
  });
};

const TITLE_SYSTEM_PROMPT = [
  'Generate a concise chat title.',
  'Follow the user message language.',
  'Use at most 20 Chinese characters or at most 8 English words.',
  'Return only the title.',
  'Do not use quotes, punctuation at the end, or prefixes like "Title:".',
].join('\n');

function cleanGeneratedTitle(title: string): string {
  return title
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^标题[:：]\s*/i, '')
    .replace(/^title[:：]\s*/i, '')
    .replace(/[。.!！?？]+$/g, '')
    .trim();
}

function fallbackTitleFromPrompt(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, ' ');
  if (!compact) return 'New Chat';

  const containsCjk = /[\u3400-\u9fff]/.test(compact);
  if (containsCjk) {
    return compact.slice(0, 20);
  }

  return compact.split(' ').slice(0, 8).join(' ');
}

export function createTitleStreamOptions(config: DaemonConfig): ProviderStreamOptions {
  return {
    apiKey: config.apiKey,
    reasoning: 'minimal',
  };
}

async function defaultGenerateTitle({
  config,
  userPrompt,
  assistantText,
}: {
  config: DaemonConfig;
  userPrompt: string;
  assistantText: string;
}): Promise<string> {
  registerBuiltInApiProviders();
  const model = getModel(config.provider as never, config.model as never);
  const context: Context = {
    systemPrompt: TITLE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `User message:\n${userPrompt}`,
              `Assistant response:\n${assistantText}`,
            ].join('\n\n'),
          },
        ],
        timestamp: Date.now(),
      },
    ],
    tools: [],
  };

  const response = await complete(model, context, createTitleStreamOptions(config));

  const title = response.content
    .filter((content): content is { type: 'text'; text: string } => (
      content.type === 'text' && typeof content.text === 'string'
    ))
    .map((content) => content.text)
    .join(' ');

  return cleanGeneratedTitle(title) || fallbackTitleFromPrompt(userPrompt);
}

// ---------- SessionManager 接口 ----------

export interface AgentSessionManager {
  getOrCreate(config: DaemonConfig, sessionId?: string): {
    startTurn(promptInput: string, emit: ChatEventSink): Promise<void>;
    cancelTurn(): void;
    turnId: ChatTurnId;
    sessionId: string;
  };
}

// ---------- AgentSession 实现 ----------

interface ActiveTurn {
  turnId: ChatTurnId;
  assistantMessageId: string;
  assistantText: string;
  cancelled: boolean;
  cancelEventSent: boolean;
  emit: ChatEventSink;
  userMessageId: string;
  userMessageContent: string;
}

function extractAssistantText(message: AgentMessage): string {
  if (!('content' in message) || !Array.isArray(message.content)) {
    return '';
  }

  return message.content
    .filter((content): content is { type: 'text'; text: string } => (
      content.type === 'text' && typeof content.text === 'string'
    ))
    .map((content) => content.text)
    .join('');
}

class AgentSessionImpl {
  readonly sessionId: string;
  private readonly agent: AgentLike;
  private activeTurn: ActiveTurn | undefined;

  constructor(sessionId: string, config: DaemonConfig, createAgent: CreateAgentFn = defaultCreateAgent) {
    this.sessionId = sessionId;
    this.agent = createAgent(config, sessionId);
    this.agent.subscribe((event) => this.handleAgentEvent(event));
  }

  async startTurn(promptInput: string, emit: ChatEventSink): Promise<void> {
    const prompt = promptInput.trim();
    const turnId = randomUUID();

    if (!prompt) {
      throw new TurnError('prompt_empty', 'Prompt is empty.', turnId);
    }

    if (this.activeTurn) {
      throw new TurnError('agent_execution_failed', 'Another turn is already running.', turnId);
    }

    const assistantMessageId = randomUUID();
    const userMessageId = randomUUID();

    this.activeTurn = {
      turnId,
      assistantMessageId,
      assistantText: '',
      cancelled: false,
      cancelEventSent: false,
      emit,
      userMessageId,
      userMessageContent: prompt,
    };

    const now = new Date().toISOString();

    await emit({
      type: 'turn_started',
      sessionId: this.sessionId,
      turnId,
      message: { id: userMessageId, role: 'user', content: prompt, createdAt: now },
    });

    try {
      await this.agent.prompt(prompt);
      const at = this.activeTurn;
      if (!at || at.turnId !== turnId || at.cancelled) return;

      await emit({
        type: 'turn_completed',
        turnId,
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: at.assistantText.trim(),
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const at = this.activeTurn;
      if (at?.cancelled) return;

      await emit({
        type: 'turn_failed',
        turnId,
        code: error instanceof TurnError ? error.code : 'agent_execution_failed',
        message: error instanceof Error ? error.message : 'Unknown agent error.',
      });
    } finally {
      if (this.activeTurn?.turnId === turnId) this.activeTurn = undefined;
    }
  }

  /** 同步最新的 config 到 Agent state（thinkingLevel 等动态参数） */
  syncConfig(config: DaemonConfig): void {
    this.agent.state.thinkingLevel = config.thinkingLevel;
  }

  cancelTurn(): void {
    if (!this.activeTurn) return;
    this.activeTurn.cancelled = true;
    this.agent.abort();
    if (!this.activeTurn.cancelEventSent) {
      this.activeTurn.emit({ type: 'turn_cancelled', turnId: this.activeTurn.turnId });
      this.activeTurn.cancelEventSent = true;
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    const at = this.activeTurn;
    if (!at || at.cancelled) return;

    if (event.type === 'message_end') {
      const finalText = extractAssistantText(event.message);
      if (finalText) {
        at.assistantText = finalText;
      }
      return;
    }

    if (event.type !== 'message_update') return;

    const update = event.assistantMessageEvent;

    switch (update.type) {
      case 'thinking_start':
        at.emit({ type: 'thinking_start', turnId: at.turnId });
        break;

      case 'thinking_delta':
        at.emit({ type: 'thinking_delta', turnId: at.turnId, delta: update.delta });
        break;

      case 'thinking_end':
        at.emit({ type: 'thinking_end', turnId: at.turnId });
        break;

      case 'text_delta':
        at.assistantText += update.delta;
        at.emit({ type: 'assistant_delta', turnId: at.turnId, delta: update.delta });
        break;

      case 'text_end':
        if (typeof update.content === 'string' && update.content) {
          at.assistantText = update.content;
        }
        break;
    }
  }
}

class TurnError extends Error {
  constructor(
    public code: 'prompt_empty' | 'agent_execution_failed',
    message: string,
    public turnId: string,
  ) {
    super(message);
    this.name = 'TurnError';
  }
}

// ---------- 默认 SessionManager ----------

export class DefaultSessionManager implements AgentSessionManager {
  private sessions = new Map<string, AgentSessionImpl>();
  constructor(private createAgent: CreateAgentFn = defaultCreateAgent) {}

  getOrCreate(config: DaemonConfig, sessionId?: string) {
    // 按 sessionId 维护独立的 Agent 实例
    const key = sessionId || 'default';
    let session = this.sessions.get(key);
    if (!session) {
      session = new AgentSessionImpl(key, config, this.createAgent);
      this.sessions.set(key, session);
    } else {
      // 每次 turn 前同步最新的 thinkingLevel 到 Agent state，
      // 这样用户调整滑块后下次发送立即生效，无需重建 Agent
      session.syncConfig(config);
    }
    const turnId = randomUUID();
    return {
      turnId,
      sessionId: session.sessionId,
      startTurn(p: string, e: ChatEventSink) { return session!.startTurn(p, e); },
      cancelTurn() { session!.cancelTurn(); },
    };
  }
}

// ---------- Hono 路由 ----------

export function createTurnRoutes(
  app: Hono,
  db: Database.Database,
  sessionManager?: AgentSessionManager,
  getConfig?: () => DaemonConfig | null,
  generateTitle: GenerateTitleFn = defaultGenerateTitle,
): void {
  const sm = sessionManager ?? new DefaultSessionManager();
  const cfg = getConfig ?? (() => loadConfig(DEFAULT_CONFIG_PATH, {
    fallbackToDevelopmentEnv: true,
  }));

  function sseEventResponse(event: ChatEvent): Response {
    const encoder = new TextEncoder();
    return new Response(
      encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  app.post('/turns', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return c.json({ error: 'prompt is required' }, 400);

    // 支持会话级 Agent 路由：前端传入 sessionId，daemon 按会话维护 Agent 实例
    const sessionId: string | undefined =
      typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined;

    const config = cfg();
    if (!config) {
      return sseEventResponse({
        type: 'turn_failed',
        turnId: randomUUID(),
        code: 'missing_api_key',
        message:
          'Cashew is not configured yet. Add your model provider, model, and API key before sending a message.',
      });
    }

    const turn = sm.getOrCreate(config, sessionId);

    // 使用 Web Streams 手动实现 SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    let completed = false;
    let lastEvent: ChatEvent | null = null;
    // 在 SSE emit 回调中捕获 turn_started 里的用户消息，
    // 以便 turn 完成后与 assistant 消息一同持久化到 SQLite
    let userMessage: { id: string; content: string; createdAt: string } | undefined;
    const shouldGenerateTitle = shouldGenerateTitleForSession(db, turn.sessionId ?? 'default');

    // 在后台启动 agent turn
    turn.startTurn(prompt, async (event) => {
      if (event.type === 'turn_started') {
        userMessage = {
          id: event.message.id,
          content: event.message.content,
          createdAt: event.message.createdAt,
        };
      }
      await writer.write(
        encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      );
      if (
        event.type === 'turn_completed' ||
        event.type === 'turn_failed' ||
        event.type === 'turn_cancelled'
      ) {
        completed = true;
      }
      lastEvent = event;
    }).then(async () => {
      if (completed && lastEvent) {
        persistTurnMessages(db, turn.sessionId ?? 'default', lastEvent, userMessage);
        if (lastEvent.type === 'turn_completed' && shouldGenerateTitle && userMessage) {
          const title = await createSessionTitle({
            config,
            prompt: userMessage.content,
            assistantText: lastEvent.message.content,
            generateTitle,
          });
          persistSessionTitle(db, turn.sessionId ?? 'default', title);
          await writer.write(
            encoder.encode(`event: title\ndata: ${JSON.stringify({
              type: 'title',
              sessionId: turn.sessionId ?? 'default',
              turnId: lastEvent.turnId,
              title,
            } satisfies ChatEvent)}\n\n`),
          );
        }
      }
      await writer.close();
    }).catch(async (err) => {
      console.error('[agent] turn error:', err);
      await writer.abort(err);
    });

    return c.newResponse(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  });

  app.post('/turns/:id/cancel', async (c) => {
    const config = cfg();
    if (!config) return c.json({ error: 'Configuration not found.' }, 400);
    // cancel 时尝试从 body 读取 sessionId 以定位正确的 Agent 实例
    const body = await c.req.json().catch(() => ({}));
    const sessionId: string | undefined =
      typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined;
    const turn = sm.getOrCreate(config, sessionId);
    turn.cancelTurn();
    return c.json({ ok: true });
  });
}

async function createSessionTitle({
  config,
  prompt,
  assistantText,
  generateTitle,
}: {
  config: DaemonConfig;
  prompt: string;
  assistantText: string;
  generateTitle: GenerateTitleFn;
}): Promise<string> {
  try {
    return cleanGeneratedTitle(await generateTitle({ config, userPrompt: prompt, assistantText }))
      || fallbackTitleFromPrompt(prompt);
  } catch {
    return fallbackTitleFromPrompt(prompt);
  }
}

function shouldGenerateTitleForSession(db: Database.Database, sessionId: string): boolean {
  const session = db.prepare('SELECT title FROM conversations WHERE id = ?').get(sessionId) as
    | { title: string }
    | undefined;

  if (!session) return true;

  const messageCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?')
    .get(sessionId) as { count: number };

  return messageCount.count === 0 && (!session.title.trim() || session.title === 'New Chat');
}

function persistTurnMessages(
  db: Database.Database,
  sessionId: string,
  event: ChatEvent,
  userMessage?: { id: string; content: string; createdAt: string },
): void {
  if (event.type !== 'turn_completed') return;

  const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(sessionId);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)')
      .run(sessionId, 'New Chat', now, now);
  }

  // 持久化用户消息（turn_started 中 emit 的消息，此前漏掉未保存）
  if (userMessage) {
    db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)')
      .run(userMessage.id, sessionId, 'user', userMessage.content, userMessage.createdAt);
  }

  // 持久化 assistant 消息
  db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)')
    .run(event.message.id, sessionId, 'assistant', event.message.content, event.message.createdAt);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), sessionId);
}

function persistSessionTitle(
  db: Database.Database,
  sessionId: string,
  title: string,
): void {
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
    .run(title, new Date().toISOString(), sessionId);
}
