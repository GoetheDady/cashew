import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { getModel, registerBuiltInApiProviders } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import type {
  ChatCommand,
  ChatErrorCode,
  ChatEvent,
  ChatMessage,
  ChatSessionId,
  ChatTurnId,
  DBCommand,
  DBEvent,
} from "@cashew/shared";
import {
  AgentConfigError,
  type AgentModelConfig,
  type LoadAgentModelConfigOptions,
  loadAgentModelConfig,
} from "./settings.js";
import { ChatDatabase } from "./database.js";

registerBuiltInApiProviders();

type ChatEventSink = (event: ChatEvent) => void;

interface AgentLike {
  subscribe(
    listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void,
  ): () => void;
  prompt(input: string): Promise<void>;
  abort(): void;
}

interface ActiveTurn {
  turnId: ChatTurnId;
  assistantMessageId: string;
  assistantText: string;
  cancelled: boolean;
  cancelEventSent: boolean;
  emit: ChatEventSink;
}

export interface AgentRuntimeOptions extends LoadAgentModelConfigOptions {
  createId?: () => string;
  now?: () => string;
  loadConfig?: () => AgentModelConfig;
  createAgent?: (config: AgentModelConfig, sessionId: ChatSessionId) => AgentLike;
}

function defaultCreateAgent(config: AgentModelConfig, sessionId: ChatSessionId): AgentLike {
  const model = getModel(config.provider, config.model);

  return new Agent({
    sessionId,
    initialState: {
      systemPrompt: "You are Cashew, a concise and helpful desktop agent.",
      model,
      thinkingLevel: config.thinkingLevel,
      tools: [],
      messages: [],
    },
    getApiKey: (provider) => (provider === config.provider ? config.apiKey : undefined),
  });
}

function getErrorCode(error: unknown): ChatErrorCode {
  if (error instanceof AgentConfigError) {
    return error.code;
  }

  return "agent_execution_failed";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown agent error.";
}

export class AgentSession {
  readonly sessionId: ChatSessionId;

  private readonly agent: AgentLike;
  private readonly createId: () => string;
  private readonly now: () => string;
  private activeTurn: ActiveTurn | undefined;

  constructor(
    sessionId: ChatSessionId,
    config: AgentModelConfig,
    options: Pick<AgentRuntimeOptions, "createId" | "now" | "createAgent"> = {},
  ) {
    this.sessionId = sessionId;
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.agent = (options.createAgent ?? defaultCreateAgent)(config, sessionId);

    this.agent.subscribe((event) => {
      this.handleAgentEvent(event);
    });
  }

  async startTurn(promptInput: string, emit: ChatEventSink): Promise<void> {
    const prompt = promptInput.trim();
    const turnId = this.createId();

    if (!prompt) {
      emit({
        type: "turn_failed",
        turnId,
        code: "prompt_empty",
        message: "Prompt is empty.",
      });
      return;
    }

    if (this.activeTurn) {
      emit({
        type: "turn_failed",
        turnId,
        code: "agent_execution_failed",
        message: "Another turn is already running.",
      });
      return;
    }

    const assistantMessageId = this.createId();
    this.activeTurn = {
      turnId,
      assistantMessageId,
      assistantText: "",
      cancelled: false,
      cancelEventSent: false,
      emit,
    };

    const userMessage: ChatMessage = {
      id: this.createId(),
      role: "user",
      content: prompt,
      createdAt: this.now(),
    };

    emit({
      type: "turn_started",
      sessionId: this.sessionId,
      turnId,
      message: userMessage,
    });

    try {
      await this.agent.prompt(prompt);
      const activeTurn = this.activeTurn;

      if (!activeTurn || activeTurn.turnId !== turnId || activeTurn.cancelled) {
        return;
      }

      emit({
        type: "turn_completed",
        turnId,
        message: {
          id: assistantMessageId,
          role: "assistant",
          content: activeTurn.assistantText.trim(),
          createdAt: this.now(),
        },
      });
    } catch (error) {
      const activeTurn = this.activeTurn;

      if (activeTurn?.cancelled) {
        return;
      }

      emit({
        type: "turn_failed",
        turnId,
        code: getErrorCode(error),
        message: getErrorMessage(error),
      });
    } finally {
      if (this.activeTurn?.turnId === turnId) {
        this.activeTurn = undefined;
      }
    }
  }

  cancelTurn(turnId: ChatTurnId): void {
    if (!this.activeTurn || this.activeTurn.turnId !== turnId) {
      return;
    }

    this.activeTurn.cancelled = true;
    this.agent.abort();

    if (!this.activeTurn.cancelEventSent) {
      this.activeTurn.emit({
        type: "turn_cancelled",
        turnId,
      });
      this.activeTurn.cancelEventSent = true;
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    const activeTurn = this.activeTurn;

    if (!activeTurn || activeTurn.cancelled || event.type !== "message_update") {
      return;
    }

    const update = event.assistantMessageEvent;

    if (update.type !== "text_delta") {
      return;
    }

    activeTurn.assistantText += update.delta;
    activeTurn.emit({
      type: "assistant_delta",
      turnId: activeTurn.turnId,
      delta: update.delta,
    });
  }
}

export class AgentRuntime {
  private readonly sessions = new Map<number, AgentSession>();
  private readonly createId: () => string;
  private readonly options: AgentRuntimeOptions;
  private readonly db: ChatDatabase; // 数据库实例

  constructor(options: AgentRuntimeOptions = {}) {
    this.options = options;
    this.createId = options.createId ?? randomUUID;
    this.db = new ChatDatabase(); // electron-store 不需要传路径参数
  }

  /**
   * 处理聊天命令（现有逻辑，待改造为持久化）
   */
  async handleCommand(
    windowId: number,
    command: ChatCommand,
    emit: ChatEventSink,
  ): Promise<void> {
    if (command.type === "cancel_turn") {
      this.sessions.get(windowId)?.cancelTurn(command.turnId);
      return;
    }

    try {
      const session = this.getOrCreateSession(windowId, emit);
      await session.startTurn(command.prompt, emit);
    } catch (error) {
      emit({
        type: "turn_failed",
        turnId: this.createId(),
        code: getErrorCode(error),
        message: getErrorMessage(error),
      });
    }
  }

  /**
   * 处理数据库命令
   */
  handleDBCommand(command: DBCommand, emit: (event: DBEvent) => void): void {
    try {
      switch (command.type) {
        case 'create_session': {
          const session = this.db.createSession(command.title);
          emit({ type: 'session_created', session });
          break;
        }

        case 'get_all_sessions': {
          const sessions = this.db.getAllSessions();
          emit({ type: 'sessions_loaded', sessions });
          break;
        }

        case 'get_session': {
          const session = this.db.getSession(command.sessionId);
          emit({ type: 'session_loaded', session: session ?? null });
          break;
        }

        case 'delete_session': {
          this.db.deleteSession(command.sessionId);
          emit({ type: 'session_deleted', sessionId: command.sessionId });
          break;
        }

        case 'get_messages': {
          const messages = this.db.getMessages(command.sessionId);
          emit({ type: 'messages_loaded', sessionId: command.sessionId, messages });
          break;
        }

        case 'update_session_title': {
          this.db.updateSessionTitle(command.sessionId, command.title);
          emit({ type: 'session_title_updated', sessionId: command.sessionId, title: command.title });
          break;
        }

        default: {
          const _exhaustive: never = command;
          throw new Error(`Unknown DB command: ${JSON.stringify(_exhaustive)}`);
        }
      }
    } catch (error) {
      emit({
        type: 'db_error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      });
    }
  }

  destroyWindowSession(windowId: number): void {
    this.sessions.delete(windowId);
  }

  private getOrCreateSession(windowId: number, emit: ChatEventSink): AgentSession {
    const currentSession = this.sessions.get(windowId);

    if (currentSession) {
      return currentSession;
    }

    const config =
      this.options.loadConfig?.() ??
      loadAgentModelConfig({
        cwd: this.options.cwd,
        env: this.options.env,
        isPackaged: this.options.isPackaged,
        exists: this.options.exists,
        readFile: this.options.readFile,
      });
    const sessionId = this.createId();
    const session = new AgentSession(sessionId, config, this.options);

    this.sessions.set(windowId, session);
    emit({
      type: "session_ready",
      sessionId,
    });

    return session;
  }
}
