import type { ChatCommand, ChatEvent } from '@cashew/shared';

declare global {
  interface Window {
    cashew: {
      sendChatCommand: (command: ChatCommand) => Promise<void>;
      subscribeChatEvents: (listener: (event: ChatEvent) => void) => () => void;
    };
  }
}

export {};
