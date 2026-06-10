import { describe, expect, it } from "vitest";
import {
  CHAT_COMMAND_CHANNEL,
  CHAT_ERROR_CODES,
  CHAT_EVENT_CHANNEL,
  assertNever,
  type ChatErrorCode,
  type ChatEvent,
} from "./index.js";

describe("chat protocol", () => {
  it("defines stable IPC channels", () => {
    expect(CHAT_COMMAND_CHANNEL).toBe("cashew:chat-command");
    expect(CHAT_EVENT_CHANNEL).toBe("cashew:chat-event");
  });

  it("defines the expected error codes", () => {
    expect(CHAT_ERROR_CODES).toEqual([
      "prompt_empty",
      "missing_api_key",
      "agent_execution_failed",
      "unknown",
    ] satisfies ChatErrorCode[]);
  });

  it("supports exhaustive event handling", () => {
    function renderEvent(event: ChatEvent): string {
      switch (event.type) {
        case "session_ready":
          return event.sessionId;
        case "turn_started":
          return event.message.content;
        case "assistant_delta":
          return event.delta;
        case "turn_completed":
          return event.message.content;
        case "turn_failed":
          return event.code;
        case "turn_cancelled":
          return event.turnId;
        default:
          return assertNever(event);
      }
    }

    expect(
      renderEvent({
        type: "turn_cancelled",
        turnId: "turn-1",
      }),
    ).toBe("turn-1");
  });
});
