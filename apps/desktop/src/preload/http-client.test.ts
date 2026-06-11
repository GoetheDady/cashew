import { describe, it, expect, vi } from 'vitest';
import type { ChatEvent, DBCommand } from '@cashew/shared';
import { formatDaemonError, parseSSEStream, mapDBCommandToFetch } from './http-client.js';

/**
 * Issue 06: Desktop preload HTTP 适配层
 *
 * 测试 SSE 解析和 HTTP 请求映射逻辑（不依赖 Electron / daemon）。
 */

// ---------- SSE 解析测试 ----------

describe('parseSSEStream', () => {
  it('parses a single SSE event', async () => {
    const stream = createSSEStream([
      ['turn_started', '{"type":"turn_started","sessionId":"s1","turnId":"t1"}'],
    ]);
    const events = await parseSSEStream(stream);
    expect(events).toEqual([
      {
        event: 'turn_started',
        data: { type: 'turn_started', sessionId: 's1', turnId: 't1' },
      },
    ]);
  });

  it('parses multiple SSE events in one stream', async () => {
    const stream = createSSEStream([
      ['turn_started', '{"type":"turn_started"}'],
      ['assistant_delta', '{"type":"assistant_delta","delta":"Hi"}'],
      ['turn_completed', '{"type":"turn_completed"}'],
    ]);
    const events = await parseSSEStream(stream);
    expect(events).toHaveLength(3);
    expect(events[0].event).toBe('turn_started');
    expect(events[1].event).toBe('assistant_delta');
    expect(events[2].event).toBe('turn_completed');
  });

  it('handles empty stream', async () => {
    const stream = createReadableStream('');
    const events = await parseSSEStream(stream);
    expect(events).toEqual([]);
  });
});

// ---------- DB Command 映射测试 ----------

describe('mapDBCommandToFetch', () => {
  const PORT = 11434;

  it('maps get_all_sessions to GET /sessions', () => {
    const result = mapDBCommandToFetch(PORT, { type: 'get_all_sessions' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions`);
    expect(result.method).toBe('GET');
  });

  it('maps create_session to POST /sessions', () => {
    const result = mapDBCommandToFetch(PORT, { type: 'create_session', title: 'Test' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions`);
    expect(result.method).toBe('POST');
    expect(result.body).toBe(JSON.stringify({ title: 'Test' }));
  });

  it('maps delete_session to DELETE /sessions/:id', () => {
    const result = mapDBCommandToFetch(PORT, { type: 'delete_session', sessionId: 'abc' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc`);
    expect(result.method).toBe('DELETE');
  });

  it('maps update_session_title to PATCH /sessions/:id', () => {
    const result = mapDBCommandToFetch(PORT, {
      type: 'update_session_title',
      sessionId: 'abc',
      title: 'New',
    });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc`);
    expect(result.method).toBe('PATCH');
    expect(result.body).toBe(JSON.stringify({ title: 'New' }));
  });

  it('maps get_messages to GET /sessions/:id/messages', () => {
    const result = mapDBCommandToFetch(PORT, {
      type: 'get_messages',
      sessionId: 'abc',
    });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc/messages`);
    expect(result.method).toBe('GET');
  });
});

describe('formatDaemonError', () => {
  it('turns missing configuration into an actionable message', () => {
    expect(formatDaemonError(400, { error: 'Configuration not found.' })).toBe(
      'Cashew is not configured yet. Add your model provider, model, and API key before sending a message.',
    );
  });

  it('preserves daemon error messages when they are already specific', () => {
    expect(formatDaemonError(400, { error: 'prompt is required' })).toBe('prompt is required');
  });
});

// ---------- 工具函数 ----------

/** 创建模拟的 SSE ReadableStream */
function createSSEStream(events: Array<[string, string]>): ReadableStream<Uint8Array> {
  const text = events
    .map(([event, data]) => `event: ${event}\ndata: ${data}\n\n`)
    .join('');
  return createReadableStream(text);
}

function createReadableStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}
