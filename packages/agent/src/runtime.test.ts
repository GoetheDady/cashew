import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ChatEvent } from "@cashew/shared";
import { describe, expect, it, vi } from "vitest";
import { AgentConfigError, type AgentModelConfig } from "./settings.js";
import { AgentRuntime } from "./runtime.js";

const config: AgentModelConfig = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  apiKey: "test-key",
  thinkingLevel: "minimal",
};

class FakeAgent {
  readonly listeners: Array<(event: AgentEvent, signal: AbortSignal) => void> = [];
  readonly abort = vi.fn();
  prompt = vi.fn(async () => {
    this.emit({
      type: "message_update",
      message: {
        role: "assistant",
        content: [],
        timestamp: Date.now(),
      },
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Hello",
      },
    } as unknown as AgentEvent);
  });

  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => void): () => void {
    this.listeners.push(listener);
    return () => undefined;
  }

  emit(event: AgentEvent): void {
    const signal = new AbortController().signal;

    for (const listener of this.listeners) {
      listener(event, signal);
    }
  }
}

function createIdFactory(ids: string[]): () => string {
  return () => {
    const id = ids.shift();

    if (!id) {
      throw new Error("No test id left.");
    }

    return id;
  };
}

describe("AgentRuntime", () => {
  it("emits session and streaming turn events", async () => {
    const fakeAgent = new FakeAgent();
    const events: ChatEvent[] = [];
    const runtime = new AgentRuntime({
      createId: createIdFactory(["session-1", "turn-1", "assistant-1", "user-1"]),
      now: () => "2026-06-10T00:00:00.000Z",
      loadConfig: () => config,
      createAgent: () => fakeAgent,
    });

    await runtime.handleCommand(
      1,
      {
        type: "start_turn",
        prompt: "Hi",
      },
      (event) => events.push(event),
    );

    expect(events).toEqual([
      {
        type: "session_ready",
        sessionId: "session-1",
      },
      {
        type: "turn_started",
        sessionId: "session-1",
        turnId: "turn-1",
        message: {
          id: "user-1",
          role: "user",
          content: "Hi",
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      },
      {
        type: "assistant_delta",
        turnId: "turn-1",
        delta: "Hello",
      },
      {
        type: "turn_completed",
        turnId: "turn-1",
        message: {
          id: "assistant-1",
          role: "assistant",
          content: "Hello",
          createdAt: "2026-06-10T00:00:00.000Z",
        },
      },
    ]);
  });

  it("maps configuration errors into failed turn events", async () => {
    const events: ChatEvent[] = [];
    const runtime = new AgentRuntime({
      createId: createIdFactory(["failed-turn"]),
      loadConfig: () => {
        throw new AgentConfigError("missing_api_key", "DEEPSEEK_API_KEY is not set.");
      },
    });

    await runtime.handleCommand(
      1,
      {
        type: "start_turn",
        prompt: "Hi",
      },
      (event) => events.push(event),
    );

    expect(events).toEqual([
      {
        type: "turn_failed",
        turnId: "failed-turn",
        code: "missing_api_key",
        message: "DEEPSEEK_API_KEY is not set.",
      },
    ]);
  });

  it("cancels the active turn", async () => {
    let finishPrompt: (() => void) | undefined;
    const fakeAgent = new FakeAgent();
    fakeAgent.prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPrompt = resolve;
        }),
    );
    fakeAgent.abort.mockImplementation(() => {
      finishPrompt?.();
    });

    const events: ChatEvent[] = [];
    const runtime = new AgentRuntime({
      createId: createIdFactory(["session-1", "turn-1", "assistant-1", "user-1"]),
      now: () => "2026-06-10T00:00:00.000Z",
      loadConfig: () => config,
      createAgent: () => fakeAgent,
    });

    const start = runtime.handleCommand(
      1,
      {
        type: "start_turn",
        prompt: "Hi",
      },
      (event) => events.push(event),
    );

    await Promise.resolve();
    await runtime.handleCommand(
      1,
      {
        type: "cancel_turn",
        turnId: "turn-1",
      },
      (event) => events.push(event),
    );
    await start;

    expect(fakeAgent.abort).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({
      type: "turn_cancelled",
      turnId: "turn-1",
    });
  });
});
