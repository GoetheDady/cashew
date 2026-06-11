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
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: Array<{ event: string; data: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) break;
  }

  // 按空行分割 SSE 消息
  const parts = buffer.split('\n\n');

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventType = '';
    let dataStr = '';

    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6).trim();
      }
    }

    if (eventType || dataStr) {
      try {
        events.push({ event: eventType, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event: eventType, data: dataStr });
      }
    }
  }

  return events;
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
  commandType: DBCommand['type'],
  data: unknown,
): DBEvent | null {
  switch (commandType) {
    case 'create_session':
      return { type: 'session_created', session: data as DBSession };

    case 'get_all_sessions':
      return { type: 'sessions_loaded', sessions: data as DBSession[] };

    case 'get_session':
      return { type: 'session_loaded', session: data as DBSession | null };

    case 'delete_session':
      // HTTP 返回 { ok: true }
      return null; // 渲染器不依赖这个事件

    case 'get_messages':
      return { type: 'messages_loaded', messages: data as DBMessage[] };

    case 'update_session_title':
      return null; // 渲染器不依赖这个事件

    default:
      return null;
  }
}
