import type { ChatEvent, DBCommand, DBEvent, DBSession, DBMessage } from '@cashew/shared';

function getErrorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return null;
  }

  const { error } = data as { error?: unknown };
  return typeof error === 'string' ? error : null;
}

export function formatDaemonError(status: number, data: unknown): string {
  const message = getErrorMessage(data);

  if (message === 'Configuration not found.') {
    return 'Cashew is not configured yet. Add your model provider, model, and API key before sending a message.';
  }

  return message || `Request failed with status ${status}`;
}

/**
 * 从 SSE ReadableStream 解析出所有事件。
 * SSE 格式：event: <type>\ndata: <json>\n\n
 *
 * 注意：此函数一次性读取整个流再返回所有事件，
 * 适用于批量处理场景。实时流式场景请使用 readSSEStream。
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const events: Array<{ event: string; data: unknown }> = [];
  await readSSEStream(reader, (evt) => { events.push(evt); });
  return events;
}

/**
 * 解析 SSE 事件（从 text buffer 中提取完整事件）。
 * 返回解析后的事件，buffer 原地截断已解析的部分。
 */
function parseSSEEvent(buffer: string): {
  event: { event: string; data: unknown } | null;
  consumed: number;
} {
  const idx = buffer.indexOf('\n\n');
  if (idx === -1) return { event: null, consumed: 0 };

  const part = buffer.slice(0, idx);
  const consumed = idx + 2;

  if (!part.trim()) return { event: null, consumed };

  let eventType = '';
  let dataStr = '';

  for (const line of part.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataStr = line.slice(6).trim();
    }
  }

  if (!eventType && !dataStr) return { event: null, consumed };

  try {
    return { event: { event: eventType, data: JSON.parse(dataStr) }, consumed };
  } catch {
    return { event: { event: eventType, data: dataStr }, consumed };
  }
}

/**
 * 增量读取 SSE 流，每解析出一个完整事件就立即回调 onEvent。
 * 这样 turn_started（含用户消息）可以立刻显示，
 * assistant_delta 可以逐条流式更新到 UI。
 */
export async function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: { event: string; data: unknown }) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    // 从 buffer 中提取所有完整的 SSE 消息（以 \n\n 分隔）
    while (true) {
      const { event, consumed } = parseSSEEvent(buffer);
      if (!event) break;
      buffer = buffer.slice(consumed);
      onEvent(event);
    }

    if (done) break;
  }

  // 流结束后处理 buffer 中剩余的未完成事件（通常为空，但做防御性处理）
  while (buffer.trim()) {
    const { event, consumed } = parseSSEEvent(buffer);
    if (!event) break;
    buffer = buffer.slice(consumed);
    onEvent(event);
  }
}

/**
 * DB command → HTTP 请求映射。
 */
export function mapDBCommandToFetch(
  port: number,
  command: DBCommand,
): { url: string; method: string; body?: string } {
  const base = `http://localhost:${port}`;

  switch (command.type) {
    case 'get_all_sessions':
      return { url: `${base}/sessions`, method: 'GET' };

    case 'create_session':
      return {
        url: `${base}/sessions`,
        method: 'POST',
        body: JSON.stringify({ title: command.title }),
      };

    case 'get_session':
      return { url: `${base}/sessions/${command.sessionId}`, method: 'GET' };

    case 'delete_session':
      return { url: `${base}/sessions/${command.sessionId}`, method: 'DELETE' };

    case 'get_messages':
      return {
        url: `${base}/sessions/${command.sessionId}/messages`,
        method: 'GET',
      };

    case 'update_session_title':
      return {
        url: `${base}/sessions/${command.sessionId}`,
        method: 'PATCH',
        body: JSON.stringify({ title: command.title }),
      };
  }
}

/**
 * 将 HTTP 响应数据映射为 DBEvent。
 * 不同 daemon 端点返回不同的形状，此处做适配。
 */
export function mapResponseToDBEvent(
  command: DBCommand,
  data: unknown,
): DBEvent | null {
  switch (command.type) {
    case 'create_session':
      return { type: 'session_created', session: data as DBSession };

    case 'get_all_sessions':
      return { type: 'sessions_loaded', sessions: data as DBSession[] };

    case 'get_session':
      return { type: 'session_loaded', session: data as DBSession | null };

    case 'delete_session':
      return { type: 'session_deleted', sessionId: command.sessionId };

    case 'get_messages':
      return { type: 'messages_loaded', sessionId: command.sessionId, messages: data as DBMessage[] };

    case 'update_session_title':
      return null; // 渲染器不依赖这个事件

    default:
      return null;
  }
}
