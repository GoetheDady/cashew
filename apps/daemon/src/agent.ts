import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { complete, getModel, registerBuiltInApiProviders } from '@earendil-works/pi-ai';
import type { Context, ProviderStreamOptions } from '@earendil-works/pi-ai';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { ChatEvent, ChatTurnId } from '@cashew/shared';
import { loadConfig, type DaemonConfig } from './config.js';
import type { ConversationPersistence } from './database.js';

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
  if (!compact) return '新对话';

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
  startTurn(
    config: DaemonConfig,
    sessionId: string | undefined,
    prompt: string,
    emit: ChatEventSink,
  ): {
    turnId: ChatTurnId;
    sessionId: string;
    completed: Promise<void>;
  };
  cancelTurn(turnId: ChatTurnId): boolean;
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

  async startTurn(promptInput: string, emit: ChatEventSink, turnId: ChatTurnId): Promise<void> {
    const prompt = promptInput.trim();

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
        message: error instanceof Error ? error.message : '未知助手错误。',
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
  private activeTurns = new Map<ChatTurnId, AgentSessionImpl>();
  constructor(private createAgent: CreateAgentFn = defaultCreateAgent) {}

  startTurn(
    config: DaemonConfig,
    sessionId: string | undefined,
    prompt: string,
    emit: ChatEventSink,
  ) {
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
    this.activeTurns.set(turnId, session);
    const completed = session.startTurn(prompt, emit, turnId)
      .finally(() => this.activeTurns.delete(turnId));
    return {
      turnId,
      sessionId: session.sessionId,
      completed,
    };
  }

  cancelTurn(turnId: ChatTurnId): boolean {
    const session = this.activeTurns.get(turnId);
    if (!session) return false;
    session.cancelTurn();
    return true;
  }
}

// ---------- Turn workflow ----------

export class TurnWorkflow {
  constructor(
    private readonly persistence: ConversationPersistence,
    private readonly sessionManager: AgentSessionManager,
    private readonly getConfig: () => DaemonConfig | null,
    private readonly generateTitle: GenerateTitleFn = defaultGenerateTitle,
  ) {}

  start(
    prompt: string,
    sessionId: string | undefined,
    emit: ChatEventSink,
  ): { turnId: ChatTurnId; sessionId: string; completed: Promise<void> } {
    const config = this.getConfig();
    if (!config) {
      const turnId = randomUUID();
      return {
        turnId,
        sessionId: sessionId ?? 'default',
        completed: Promise.resolve(emit({
          type: 'turn_failed',
          turnId,
          code: 'missing_api_key',
          message: 'Cashew 尚未完成配置，请先添加模型服务商、模型和 API 密钥。',
        })).then(() => undefined),
      };
    }

    let userMessage: { id: string; content: string; createdAt: string } | undefined;
    let lastEvent: ChatEvent | null = null;
    const conversationId = sessionId ?? 'default';
    const shouldGenerateTitle = this.persistence.shouldGenerateTitle(conversationId);
    const turn = this.sessionManager.startTurn(config, sessionId, prompt, async (event) => {
      if (event.type === 'turn_started') {
        userMessage = {
          id: event.message.id,
          content: event.message.content,
          createdAt: event.message.createdAt,
        };
      }
      lastEvent = event;
      await emit(event);
    });

    const completed = turn.completed.then(async () => {
      const finalEvent: ChatEvent | null = lastEvent;
      if (finalEvent?.type !== 'turn_completed' || !userMessage) return;

      this.persistence.saveCompletedTurn(turn.sessionId, userMessage, finalEvent.message);
      if (!shouldGenerateTitle) return;

      const title = await createSessionTitle({
        config,
        prompt: userMessage.content,
        assistantText: finalEvent.message.content,
        generateTitle: this.generateTitle,
      });
      this.persistence.saveTitle(turn.sessionId, title);
      await emit({
        type: 'title',
        sessionId: turn.sessionId,
        turnId: finalEvent.turnId,
        title,
      });
    });

    return { ...turn, completed };
  }

  cancel(turnId: ChatTurnId): boolean {
    return this.sessionManager.cancelTurn(turnId);
  }
}

// ---------- Hono SSE adapter ----------

export function createTurnRoutes(
  app: Hono,
  persistence: ConversationPersistence,
  sessionManager?: AgentSessionManager,
  getConfig: () => DaemonConfig | null = () => null,
  generateTitle: GenerateTitleFn = defaultGenerateTitle,
): void {
  const sm = sessionManager ?? new DefaultSessionManager();
  const cfg = getConfig;
  const workflow = new TurnWorkflow(persistence, sm, cfg, generateTitle);

  app.post('/turns', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return c.json({ error: '消息不能为空' }, 400);

    // 支持会话级 Agent 路由：前端传入 sessionId，daemon 按会话维护 Agent 实例
    const sessionId: string | undefined =
      typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : undefined;

    // 使用 Web Streams 手动实现 SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const turn = workflow.start(prompt, sessionId, async (event) => {
      await writer.write(
        encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      );
    });

    turn.completed.then(async () => {
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
    return c.json({ ok: workflow.cancel(c.req.param('id')) });
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
