import type { ChatCommand, ChatEvent, DBCommand, DBEvent } from '@cashew/shared';

declare global {
  interface Window {
    cashew: {
      sendChatCommand: (command: ChatCommand) => Promise<void>;
      subscribeChatEvents: (listener: (event: ChatEvent) => void) => () => void;
      sendDBCommand: (command: DBCommand) => Promise<void>;
      subscribeDBEvents: (listener: (event: DBEvent) => void) => () => void;
    };
  }
}

export {};
