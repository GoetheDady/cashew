import { contextBridge, ipcRenderer } from 'electron';
import type { ChatCommand, ChatEvent, DBCommand, DBEvent, DaemonStatus } from '@cashew/shared';
import {
  formatDaemonError,
  parseSSEStream,
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
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(`http://localhost:${port}/turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
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

    // start_turn：启动 SSE 流式连接
    const reader = await startTurnStream(port, command.prompt);
    currentSSEReader = reader;

    // 解析 SSE 事件并转发给 listener
    const stream = new ReadableStream({
      start(controller) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        };
        pump();
      },
    });

    const events = await parseSSEStream(stream);

    for (const evt of events) {
      if (chatEventListener) {
        chatEventListener(evt.data as ChatEvent);
      }
    }

    currentSSEReader = null;
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
  sendDBCommand: async (command: DBCommand): Promise<void> => {
    try {
      const port = await requireDaemonPort();
      const { url, method, body } = mapDBCommandToFetch(port, command);
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });

      const data = await response.json();

      if (dbEventListener) {
        const event = mapResponseToDBEvent(command.type, data);
        if (event) dbEventListener(event);
      }
    } catch (error) {
      if (dbEventListener) {
        dbEventListener({
          type: 'db_error',
          error: error instanceof Error ? error.message : 'Unknown database error',
        });
      }
    }
  },

  /** 订阅数据库事件 */
  subscribeDBEvents: (listener: (event: DBEvent) => void): (() => void) => {
    dbEventListener = listener;
    return () => { dbEventListener = null; };
  },
});
