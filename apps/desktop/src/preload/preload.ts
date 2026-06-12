import { contextBridge, ipcRenderer } from 'electron';
import type { ChatCommand, ChatEvent, DBCommand, DBEvent, DaemonStatus } from '@cashew/shared';
import {
  formatDaemonError,
  readSSEStream,
  mapDBCommandToFetch,
  mapResponseToDBEvent,
} from './http-client.js';

/** 从 IPC 获取 daemon 端口号 */
async function getDaemonPort(): Promise<number | null> {
  return ipcRenderer.invoke('cashew:daemon-port') as Promise<number | null>;
}

/** 保证 daemon 端口可用；不可用时抛出错误 */
async function requireDaemonPort(): Promise<number> {
  const port = await getDaemonPort();
  if (!port) throw new Error('Daemon is not running. Please start Cashew service first.');
  return port;
}

/**
 * 存储当前的 SSE 流式连接 reader，
 * 用于 subscribeChatEvents 的取消订阅逻辑。
 */
let currentSSEReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let chatEventListener: ((event: ChatEvent) => void) | null = null;
let dbEventListener: ((event: DBEvent) => void) | null = null;
let daemonStatusSubscriptionSeq = 0;

/** 发起 turn（POST /turns），返回 SSE stream 的 reader */
async function startTurnStream(
  port: number,
  prompt: string,
  sessionId?: string,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(`http://localhost:${port}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sessionId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(formatDaemonError(response.status, error));
  }

  if (!response.body) {
    throw new Error('No response body for SSE stream');
  }

  return response.body.getReader();
}

contextBridge.exposeInMainWorld('cashew', {
  /** 获取 daemon 端口号 */
  getDaemonPort: (): Promise<number | null> =>
    ipcRenderer.invoke('cashew:daemon-port'),

  /** 获取 daemon 连接状态 */
  getDaemonStatus: (): Promise<DaemonStatus> =>
    ipcRenderer.invoke('cashew:daemon-status'),

  /** 订阅 daemon 状态变更 */
  subscribeDaemonStatus: (
    listener: (status: DaemonStatus) => void,
  ): (() => void) => {
    const subscriptionId = `daemon-status-${daemonStatusSubscriptionSeq++}`;
    ipcRenderer.send('cashew:daemon-status-subscribe', subscriptionId);

    const handler = (
      _event: Electron.IpcRendererEvent,
      eventSubscriptionId: string,
      status: DaemonStatus,
    ) => {
      if (eventSubscriptionId !== subscriptionId) return;
      listener(status);
    };

    ipcRenderer.on('cashew:daemon-status-changed', handler);

    return () => {
      ipcRenderer.removeListener('cashew:daemon-status-changed', handler);
      ipcRenderer.send('cashew:daemon-status-unsubscribe', subscriptionId);
    };
  },

  /** 发送聊天命令 */
  sendChatCommand: async (command: ChatCommand): Promise<void> => {
    const port = await requireDaemonPort();

    if (command.type === 'cancel_turn') {
      await fetch(`http://localhost:${port}/turns/${command.turnId}/cancel`, {
        method: 'POST',
      });
      return;
    }

    // start_turn：启动 SSE 流式连接，增量解析并实时分派事件。
    // 这样 turn_started（含用户消息）可以立刻到达 UI，
    // assistant_delta 逐条流式更新，用户感知到即时响应。
    const reader = await startTurnStream(port, command.prompt, command.sessionId);
    currentSSEReader = reader;

    try {
      await readSSEStream(reader, (evt) => {
        if (chatEventListener) {
          chatEventListener(evt.data as ChatEvent);
        }
      });
    } catch (error) {
      // 当组件卸载时 subscribeChatEvents 的 unsubscribe 回调
      // 会 cancel reader 并将 currentSSEReader 置 null。
      // 此时 reader.read() 抛出的错误属于正常流程，不需要向上传播。
      if (currentSSEReader === reader) {
        throw error;
      }
    } finally {
      currentSSEReader = null;
    }
  },

  /** 订阅聊天事件 */
  subscribeChatEvents: (listener: (event: ChatEvent) => void): (() => void) => {
    chatEventListener = listener;

    return () => {
      chatEventListener = null;
      if (currentSSEReader) {
        currentSSEReader.cancel().catch(() => {});
        currentSSEReader = null;
      }
    };
  },

  /** 发送数据库命令 */
  sendDBCommand: async (command: DBCommand): Promise<DBEvent | null> => {
    try {
      const port = await requireDaemonPort();
      const { url, method, body } = mapDBCommandToFetch(port, command);
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        // daemon 返回了错误状态码（如 404 Session not found），
        // 抛出错误以便 catch 分支统一处理为 db_error 事件，
        // 避免 error 对象被 mapResponseToDBEvent 强制转型为业务数据。
        const message =
          typeof data === 'object' && data !== null && 'error' in data &&
          typeof (data as Record<string, unknown>).error === 'string'
            ? (data as Record<string, unknown>).error
            : `Request failed with status ${response.status}`;
        throw new Error(message as string);
      }

      if (dbEventListener) {
        const event = mapResponseToDBEvent(command, data);
        if (event) dbEventListener(event);
        return event;
      }

      return mapResponseToDBEvent(command, data);
    } catch (error) {
      const event: DBEvent = {
        type: 'db_error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
      if (dbEventListener) {
        dbEventListener(event);
      }
      return event;
    }
  },

  /** 订阅数据库事件 */
  subscribeDBEvents: (listener: (event: DBEvent) => void): (() => void) => {
    dbEventListener = listener;
    return () => { dbEventListener = null; };
  },
});
