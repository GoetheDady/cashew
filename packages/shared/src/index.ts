export const CHAT_COMMAND_CHANNEL = "cashew:chat-command";
export const CHAT_EVENT_CHANNEL = "cashew:chat-event";

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
