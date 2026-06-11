import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, createSessionRoutes } from './database.js';
import { createTurnRoutes, type CreateAgentFn, type DaemonConfig, DefaultSessionManager } from './agent.js';
import type { AgentLike } from './agent.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

/**
 * Issue 04: AgentSession 迁移到 Daemon
 */

// ---------- Mock Agent ----------

function createFakeAgent(): AgentLike & { triggerDelta: (delta: string) => void } {
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
    triggerDelta(delta: string) {
      const signal = new AbortController().signal;
      for (const l of listeners) {
        l({
          type: 'message_update' as AgentEvent['type'],
          assistantMessageEvent: { type: 'text_delta', delta },
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
          'Cashew is not configured yet. Add your model provider, model, and API key before sending a message.',
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

    // 最后是 turn_completed
    const last = events[events.length - 1];
    expect(last.event).toBe('turn_completed');
  });

  it('POST /turns persists messages to SQLite on turn_completed', async () => {
    fakeAgent.prompt = vi.fn(async () => {
      fakeAgent.triggerDelta('World');
    }) as unknown as AgentLike['prompt'];

    const response = await fetch(`http://localhost:${port}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hey' }),
    });

    await response.text(); // consume SSE stream

    // 验证消息已持久化（取最后一条 assistant 消息）
    const messages = db.prepare('SELECT role, content FROM messages WHERE role = ? ORDER BY created_at DESC').all('assistant') as Array<{ role: string; content: string }>;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].content).toBe('World');
  });

  it('POST /turns/:id/cancel returns 200', async () => {
    const response = await fetch(`http://localhost:${port}/turns/any-id/cancel`, {
      method: 'POST',
    });
    expect(response.status).toBe(200);
  });
});
