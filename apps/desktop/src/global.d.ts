import type { ChatCommand, ChatEvent, DaemonStatus, ConversationCommand, ConversationEvent } from '@cashew/shared';

declare global {
  interface Window {
    cashew: {
      platform: NodeJS.Platform;
      sendChatCommand: (command: ChatCommand) => Promise<void>;
      subscribeChatEvents: (listener: (event: ChatEvent) => void) => () => void;
      sendConversationCommand: (command: ConversationCommand) => Promise<ConversationEvent | null>;
      subscribeConversationEvents: (listener: (event: ConversationEvent) => void) => () => void;
      getDaemonPort: () => Promise<number | null>;
      getDaemonStatus: () => Promise<DaemonStatus>;
      reconnectDaemon: () => Promise<void>;
      subscribeDaemonStatus: (listener: (status: DaemonStatus) => void) => () => void;
      getChatConfig: () => Promise<unknown>;
      saveChatConfig: (updates: Record<string, unknown>) => Promise<void>;
    };
  }
}

export {};
