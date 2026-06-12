import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, createSessionRoutes } from './database.js';
import {
  createTurnRoutes,
  createTitleStreamOptions,
  type CreateAgentFn,
  type DaemonConfig,
  DefaultSessionManager,
} from './agent.js';
import type { AgentLike } from './agent.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

/**
 * Issue 04: AgentSession 迁移到 Daemon
 */

// ---------- Mock Agent ----------

function createFakeAgent(): AgentLike & {
  triggerDelta: (delta: string) => void;
  triggerTextEnd: (content: string) => void;
  triggerMessageEnd: (content: string) => void;
} {
  const listeners: Array<(event: AgentEvent, signal: AbortSignal) => void> = [];
  const prompt = vi.fn(async () => {
    // 默认不 emit 任何事件 — 测试通过 triggerDelta 手动控制
  });

  const agent = {
    subscribe(listener: Parameters<AgentLike['subscribe']>[0]) {
      listeners.push(listener);
      return () => undefined;
    },
    prompt: prompt as unknown as AgentLike['prompt'],
    abort: vi.fn(),
    state: { thinkingLevel: 'minimal' },
    triggerDelta(delta: string) {
      const signal = new AbortController().signal;
      for (const l of listeners) {
        l({
          type: 'message_update' as AgentEvent['type'],
          assistantMessageEvent: { type: 'text_delta', delta },
        } as AgentEvent, signal);
      }
    },
    triggerTextEnd(content: string) {
      const signal = new AbortController().signal;
      for (const l of listeners) {
        l({
          type: 'message_update' as AgentEvent['type'],
          assistantMessageEvent: { type: 'text_end', content },
        } as AgentEvent, signal);
      }
    },
    triggerMessageEnd(content: string) {
      const signal = new AbortController().signal;
      for (const l of listeners) {
        l({
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: content }],
            timestamp: Date.now(),
          },
        } as AgentEvent, signal);
      }
    },
  };

  return agent;
}

// ---------- 测试用 config ----------

const mockConfig: DaemonConfig = {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  apiKey: 'sk-test',
  thinkingLevel: 'minimal',
};

// ---------- SSE 解析工具 ----------

async function readSSEStream(response: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: unknown }> = [];
  const lines = text.split('\n');
  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) currentEvent = line.slice(7);
    else if (line.startsWith('data: ')) currentData = line.slice(6);
    else if (line === '' && (currentEvent || currentData)) {
      try { events.push({ event: currentEvent, data: JSON.parse(currentData) }); }
      catch { events.push({ event: currentEvent, data: currentData }); }
      currentEvent = '';
      currentData = '';
    }
  }
  return events;
}

// ---------- 测试主体 ----------

describe('turn endpoints', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let tmpDir: string;
  let db: Database.Database;
  let fakeAgent: ReturnType<typeof createFakeAgent>;

  const createAgent: CreateAgentFn = () => fakeAgent;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cashew-agent-test-'));
    const dbPath = join(tmpDir, 'test.db');
    db = openDatabase(dbPath);
    fakeAgent = createFakeAgent();

    const app = new Hono();
    createSessionRoutes(app, db);

    const sessionManager = new DefaultSessionManager(createAgent);
    createTurnRoutes(app, db, sessionManager, () => mockConfig);

    server = serve({ fetch: app.fetch, port: 0 });
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /turns with empty prompt returns 400', async () => {
    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(response.status).toBe(400);
  });

  it('POST /turns without config returns a turn_failed SSE event', async () => {
    const app = new Hono();
    createTurnRoutes(app, db, undefined, () => null);
    const localServer = serve({ fetch: app.fetch, port: 0 });
    const localPort = (localServer.address() as { port: number }).port;

    try {
      const response = await fetch(`http://localhost:${localPort}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hi' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = await readSSEStream(response);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('turn_failed');
      expect(events[0].data).toMatchObject({
        type: 'turn_failed',
        code: 'missing_api_key',
        message:
          'Cashew 尚未完成配置，请先添加模型服务商、模型和 API 密钥。',
      });
    } finally {
      localServer.close();
    }
  });

  it('POST /turns returns SSE stream with proper events', async () => {
    // 先 setup：让 fakeAgent.prompt resolve 后才 emit delta
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('Hello');
    }) as unknown as AgentLike['prompt'];

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hi' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSSEStream(response);
    expect(events.length).toBeGreaterThanOrEqual(2);

    // 第一个事件是 turn_started
    expect(events[0].event).toBe('turn_started');
    const started = events[0].data as Record<string, unknown>;
    expect(started.type).toBe('turn_started');

    // 应该有 assistant_delta
    const deltas = events.filter((e) => e.event === 'assistant_delta');
    expect(deltas.length).toBeGreaterThanOrEqual(1);

    expect(events.some((event) => event.event === 'turn_completed')).toBe(true);
  });

  it('POST /turns emits and persists title for the first new-session turn', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('Route components cleanly.');
    }) as unknown as AgentLike['prompt'];

    const app = new Hono();
    const sessionManager = new DefaultSessionManager(createAgent);
    createSessionRoutes(app, db);
    createTurnRoutes(app, db, sessionManager, () => mockConfig, async () => '前端路由重构');
    const localServer = serve({ fetch: app.fetch, port: 0 });
    const localPort = (localServer.address() as { port: number }).port;

    try {
      const createResponse = await fetch(`http://localhost:${localPort}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const session = await createResponse.json() as { id: string };

      const response = await fetch(`http://localhost:${localPort}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '帮我重构前端路由', sessionId: session.id }),
      });

      const events = await readSSEStream(response);
      const completedIndex = events.findIndex((event) => event.event === 'turn_completed');
      const titleIndex = events.findIndex((event) => event.event === 'title');
      expect(completedIndex).toBeGreaterThanOrEqual(0);
      expect(titleIndex).toBeGreaterThan(completedIndex);

      const title = events[titleIndex].data as {
        type: string;
        sessionId: string;
        turnId: string;
        title: string;
      };
      expect(title).toMatchObject({
        type: 'title',
        title: '前端路由重构',
      });

      const updatedSession = db.prepare('SELECT title FROM conversations WHERE id = ?')
        .get(title.sessionId) as { title: string };
      expect(updatedSession.title).toBe('前端路由重构');
    } finally {
      localServer.close();
    }
  });

  it('POST /turns does not emit title for an existing titled session', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('Bound reply');
    }) as unknown as AgentLike['prompt'];

    const createResponse = await fetch(`http://localhost:${port}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Already named' }),
    });
    const session = await createResponse.json() as { id: string };

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Keep the title', sessionId: session.id }),
    });

    const events = await readSSEStream(response);
    expect(events.some((event) => event.event === 'title')).toBe(false);
  });

  it('POST /turns persists user and assistant messages to SQLite on turn_completed', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('World');
    }) as unknown as AgentLike['prompt'];

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hey' }),
    });

    await response.text(); // consume SSE stream

    // 验证 assistant 消息已持久化
    const assistantMessages = db.prepare('SELECT role, content FROM messages WHERE role = ? ORDER BY created_at DESC').all('assistant') as Array<{ role: string; content: string }>;
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[0].content).toBe('World');

    // 验证 user 消息也已持久化
    const userMessages = db.prepare('SELECT role, content FROM messages WHERE role = ? ORDER BY created_at DESC').all('user') as Array<{ role: string; content: string }>;
    expect(userMessages.length).toBeGreaterThanOrEqual(1);
    expect(userMessages[0].content).toBe('Hey');
  });

  it('POST /turns persists messages under the provided sessionId', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('Bound reply');
    }) as unknown as AgentLike['prompt'];

    const createResponse = await fetch(`http://localhost:${port}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bound conversation' }),
    });
    const session = await createResponse.json() as { id: string };

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Keep me here', sessionId: session.id }),
    });
    await response.text();

    const messagesResponse = await fetch(`http://localhost:${port}/sessions/${session.id}/messages`);
    const messages = await messagesResponse.json() as Array<{ role: string; content: string }>;

    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Keep me here'],
      ['assistant', 'Bound reply'],
    ]);
  });

  it('POST /turns completes with text_end content when no text_delta was emitted', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerTextEnd('Text from final event');
    }) as unknown as AgentLike['prompt'];

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Use final content' }),
    });

    const events = await readSSEStream(response);
    const completed = events.at(-1)?.data as { type?: string; message?: { content?: string } };
    expect(completed).toMatchObject({
      type: 'turn_completed',
      message: { content: 'Text from final event' },
    });
  });

  it('POST /turns completes with message_end text when no streaming text event was emitted', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerMessageEnd('Text from message end');
    }) as unknown as AgentLike['prompt'];

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Use message end' }),
    });

    const events = await readSSEStream(response);
    const completed = events.at(-1)?.data as { type?: string; message?: { content?: string } };
    expect(completed).toMatchObject({
      type: 'turn_completed',
      message: { content: 'Text from message end' },
    });
  });

  it('syncConfig updates agent thinkingLevel on subsequent turns', () => {
    // getOrCreate 首次创建 agent 时 thinkingLevel = 'minimal'（来自 mockConfig）
    const sessionManager = new DefaultSessionManager(createAgent);
    const turn1 = sessionManager.getOrCreate(mockConfig, 'test-session');
    expect(fakeAgent.state.thinkingLevel).toBe('minimal');

    // 修改 config 中的 thinkingLevel，再次 getOrCreate 应同步到 agent
    const updatedConfig = { ...mockConfig, thinkingLevel: 'xhigh' };
    sessionManager.getOrCreate(updatedConfig, 'test-session');
    expect(fakeAgent.state.thinkingLevel).toBe('xhigh');
  });

  it('POST /turns/:id/cancel returns 200', async () => {
    const response = await fetch(`http://localhost:${port}/turns/any-id/cancel`, {
      method: 'POST',
    });
    expect(response.status).toBe(200);
  });
});

describe('defaultGenerateTitle', () => {
  it('passes the configured api key to the title model call options', () => {
    expect(createTitleStreamOptions(mockConfig)).toMatchObject({
      apiKey: mockConfig.apiKey,
      reasoning: 'minimal',
    });
  });
});
