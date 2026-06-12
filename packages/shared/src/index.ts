export const CHAT_COMMAND_CHANNEL = "cashew:chat-command";
export const CHAT_EVENT_CHANNEL = "cashew:chat-event";
export const DB_COMMAND_CHANNEL = "cashew:db-command";
export const DB_EVENT_CHANNEL = "cashew:db-event";

export type ChatSessionId = string;
export type ChatTurnId = string;

export const CHAT_ERROR_CODES = [
  "prompt_empty",
  "missing_api_key",
  "agent_execution_failed",
  "unknown",
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export type ChatCommand =
  | {
      type: "start_turn";
      prompt: string;
      /** 会话 ID，daemon 用于路由到正确的 Agent 实例 */
      sessionId?: string;
    }
  | {
      type: "cancel_turn";
      turnId: ChatTurnId;
    };

export type ChatEvent =
  | {
      type: "session_ready";
      sessionId: ChatSessionId;
    }
  | {
      type: "turn_started";
      sessionId: ChatSessionId;
      turnId: ChatTurnId;
      message: ChatMessage;
    }
  | {
      type: "thinking_start";
      turnId: ChatTurnId;
    }
  | {
      type: "thinking_delta";
      turnId: ChatTurnId;
      delta: string;
    }
  | {
      type: "thinking_end";
      turnId: ChatTurnId;
    }
  | {
      type: "assistant_delta";
      turnId: ChatTurnId;
      delta: string;
    }
  | {
      type: "turn_completed";
      turnId: ChatTurnId;
      message: ChatMessage;
    }
  | {
      type: "title";
      sessionId: ChatSessionId;
      turnId: ChatTurnId;
      title: string;
    }
  | {
      type: "turn_failed";
      turnId: ChatTurnId;
      code: ChatErrorCode;
      message: string;
    }
  | {
      type: "turn_cancelled";
      turnId: ChatTurnId;
    };

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

// Daemon 连接状态类型
export type DaemonStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; port: number }
  | { state: 'error'; message: string };

// 数据库相关类型
export interface DBSession {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface DBMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

// 数据库命令类型
export type DBCommand =
  | { type: 'create_session'; title?: string }
  | { type: 'get_all_sessions' }
  | { type: 'get_session'; sessionId: string }
  | { type: 'delete_session'; sessionId: string }
  | { type: 'get_messages'; sessionId: string }
  | { type: 'update_session_title'; sessionId: string; title: string };

// 数据库事件类型
export type DBEvent =
  | { type: 'session_created'; session: DBSession }
  | { type: 'sessions_loaded'; sessions: DBSession[] }
  | { type: 'session_loaded'; session: DBSession | null }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'messages_loaded'; sessionId: string; messages: DBMessage[] }
  | { type: 'session_title_updated'; sessionId: string; title: string }
  | { type: 'db_error'; error: string };
