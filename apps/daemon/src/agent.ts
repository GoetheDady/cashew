import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { getModel, registerBuiltInApiProviders } from '@earendil-works/pi-ai';
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

// ---------- Agent 工厂（可注入）----------

export interface AgentLike {
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(input: string): Promise<void>;
  abort(): void;
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
      thinkingLevel: config.thinkingLevel as 'minimal' | 'low' | 'medium' | 'high',
      tools: [],
      messages: [],
    },
    getApiKey: (provider) => (provider === config.provider ? config.apiKey : undefined),
  });
};

// ---------- SessionManager 接口 ----------

export interface AgentSessionManager {
  getOrCreate(config: DaemonConfig): {
    startTurn(promptInput: string, emit: ChatEventSink): Promise<void>;
    cancelTurn(): void;
    turnId: ChatTurnId;
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
    if (!at || at.cancelled || event.type !== 'message_update') return;
    const update = event.assistantMessageEvent;
    if (update.type !== 'text_delta') return;
    at.assistantText += update.delta;
    at.emit({ type: 'assistant_delta', turnId: at.turnId, delta: update.delta });
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

  getOrCreate(config: DaemonConfig) {
    const key = 'default';
    let session = this.sessions.get(key);
    if (!session) {
      session = new AgentSessionImpl(randomUUID(), config, this.createAgent);
      this.sessions.set(key, session);
    }
    const turnId = randomUUID();
    return {
      turnId,
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
): void {
  const sm = sessionManager ?? new DefaultSessionManager();
  const cfg = getConfig ?? (() => loadConfig(DEFAULT_CONFIG_PATH));

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

    const turn = sm.getOrCreate(config);

    // 使用 Web Streams 手动实现 SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    let completed = false;
    let lastEvent: ChatEvent | null = null;

    // 在后台启动 agent turn
    turn.startTurn(prompt, async (event) => {
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
        persistTurnMessages(db, lastEvent);
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

  app.post('/turns/:id/cancel', (c) => {
    const config = cfg();
    if (!config) return c.json({ error: 'Configuration not found.' }, 400);
    const turn = sm.getOrCreate(config);
    turn.cancelTurn();
    return c.json({ ok: true });
  });
}

function persistTurnMessages(db: Database.Database, event: ChatEvent): void {
  if (event.type !== 'turn_completed') return;

  const sessionId = 'default';
  const existing = db.prepare('SELECT id FROM conversations WHERE id = ?').get(sessionId);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)')
      .run(sessionId, 'New Chat', now, now);
  }

  db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)')
    .run(event.message.id, sessionId, 'assistant', event.message.content, event.message.createdAt);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), sessionId);
}
