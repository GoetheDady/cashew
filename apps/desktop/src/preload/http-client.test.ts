import { describe, it, expect, vi } from 'vitest';
import { formatDaemonError, parseSSEStream, readSSEStream, mapConversationCommandToFetch, mapResponseToConversationEvent } from './http-client.js';

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

// ---------- 增量 SSE 读取测试 ----------

describe('readSSEStream', () => {
  it('incrementally dispatches events as they arrive in chunks', async () => {
    // 模拟分块到达的 SSE 流：第一个 chunk 是 turn_started，
    // 第二个 chunk 是 assistant_delta，第三个是 turn_completed
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('event: turn_started\ndata: {"type":"turn_started","sessionId":"s1"}\n\n'),
      encoder.encode('event: assistant_delta\ndata: {"type":"assistant_delta","delta":"Hi"}\n\n'),
      encoder.encode('event: turn_completed\ndata: {"type":"turn_completed"}\n\n'),
    ];

    let chunkIndex = 0;
    const reader = {
      read: vi.fn(async () => {
        if (chunkIndex < chunks.length) {
          const value = chunks[chunkIndex++];
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const dispatched: Array<{ event: string; data: unknown }> = [];
    await readSSEStream(reader, (evt) => {
      dispatched.push(evt);
    });

    // 验证事件按顺序增量分派
    expect(dispatched).toHaveLength(3);
    expect(dispatched[0].event).toBe('turn_started');
    expect(dispatched[1].event).toBe('assistant_delta');
    expect(dispatched[2].event).toBe('turn_completed');
  });

  it('handles partial events across chunk boundaries', async () => {
    // 模拟一个 SSE 事件被拆分到两个 chunk 中
    const encoder = new TextEncoder();
    const part1 = encoder.encode('event: turn_started\ndata: {"type":"turn_start');
    const part2 = encoder.encode('ed"}\n\n');

    const chunks = [part1, part2];
    let chunkIndex = 0;
    const reader = {
      read: vi.fn(async () => {
        if (chunkIndex < chunks.length) {
          const value = chunks[chunkIndex++];
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const dispatched: Array<{ event: string; data: unknown }> = [];
    await readSSEStream(reader, (evt) => {
      dispatched.push(evt);
    });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].event).toBe('turn_started');
  });

  it('dispatches events immediately, not after stream completion', async () => {
    // 验证事件在到达时立即回调，而不是等流结束
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('event: turn_started\ndata: {"type":"turn_started"}\n\n'),
      encoder.encode('event: turn_completed\ndata: {"type":"turn_completed"}\n\n'),
    ];

    const dispatchOrder: string[] = [];
    let chunkIndex = 0;

    const reader = {
      read: vi.fn(async () => {
        if (chunkIndex < chunks.length) {
          const value = chunks[chunkIndex++];
          // 此时 dispatchOrder 应该只包含之前的事件
          return { done: false, value };
        }
        return { done: true, value: undefined };
      }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const callback = vi.fn((evt: { event: string }) => {
      dispatchOrder.push(evt.event);
    });

    await readSSEStream(reader, callback);

    // turn_started 在第一个 read 之后、第二个 read 之前被回调
    // turn_completed 在第二个 read 之后、done 之前被回调
    expect(callback).toHaveBeenCalledTimes(2);
    expect(dispatchOrder).toEqual(['turn_started', 'turn_completed']);
  });
});

// ---------- DB Command 映射测试 ----------

describe('mapConversationCommandToFetch', () => {
  const PORT = 11434;

  it('maps get_all_sessions to GET /sessions', () => {
    const result = mapConversationCommandToFetch(PORT, { type: 'get_all_sessions' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions`);
    expect(result.method).toBe('GET');
  });

  it('maps create_session to POST /sessions', () => {
    const result = mapConversationCommandToFetch(PORT, { type: 'create_session', title: 'Test' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions`);
    expect(result.method).toBe('POST');
    expect(result.body).toBe(JSON.stringify({ title: 'Test' }));
  });

  it('maps delete_session to DELETE /sessions/:id', () => {
    const result = mapConversationCommandToFetch(PORT, { type: 'delete_session', sessionId: 'abc' });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc`);
    expect(result.method).toBe('DELETE');
  });

  it('maps update_session_title to PATCH /sessions/:id', () => {
    const result = mapConversationCommandToFetch(PORT, {
      type: 'update_session_title',
      sessionId: 'abc',
      title: 'New',
    });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc`);
    expect(result.method).toBe('PATCH');
    expect(result.body).toBe(JSON.stringify({ title: 'New' }));
  });

  it('maps get_messages to GET /sessions/:id/messages', () => {
    const result = mapConversationCommandToFetch(PORT, {
      type: 'get_messages',
      sessionId: 'abc',
    });
    expect(result.url).toBe(`http://localhost:${PORT}/sessions/abc/messages`);
    expect(result.method).toBe('GET');
  });
});

// ---------- mapResponseToConversationEvent 测试 ----------

describe('mapResponseToConversationEvent', () => {
  it('includes sessionId in messages_loaded event', () => {
    const messages = [
      { id: 'msg-1', conversation_id: 'abc', role: 'user' as const, content: 'Hi', created_at: 1700000000000 },
    ];

    const event = mapResponseToConversationEvent({ type: 'get_messages', sessionId: 'abc' }, messages);

    expect(event).toEqual({
      type: 'messages_loaded',
      sessionId: 'abc',
      messages: [{
        id: 'msg-1',
        session_id: 'abc',
        role: 'user',
        content: 'Hi',
        created_at: 1700000000000,
      }],
    });
  });

  it('returns sessions_loaded for get_all_sessions', () => {
    const sessions = [{ id: 's1', title: 'Test', created_at: 1, updated_at: 2 }];
    const event = mapResponseToConversationEvent({ type: 'get_all_sessions' }, sessions);
    expect(event).toEqual({ type: 'sessions_loaded', sessions });
  });

  it('returns session_created for create_session', () => {
    const session = { id: 's1', title: 'Test', created_at: 1, updated_at: 2 };
    const event = mapResponseToConversationEvent({ type: 'create_session' }, session);
    expect(event).toEqual({ type: 'session_created', session });
  });

  it('returns session_deleted for delete_session', () => {
    const event = mapResponseToConversationEvent({ type: 'delete_session', sessionId: 'abc' }, { ok: true });
    expect(event).toEqual({ type: 'session_deleted', sessionId: 'abc' });
  });
});

describe('Daemon response validation', () => {
  it('rejects an invalid Conversation response before it reaches Desktop state', () => {
    expect(() => mapResponseToConversationEvent(
      { type: 'create_session' },
      { id: 'conversation-1', title: 'Broken' },
    )).toThrow('Daemon 返回了无效的 Conversation');
  });
});

describe('formatDaemonError', () => {
  it('turns missing configuration into an actionable message', () => {
    expect(formatDaemonError(400, { error: 'Configuration not found.' })).toBe(
      'Cashew 尚未完成配置，请先添加模型服务商、模型和 API 密钥。',
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
