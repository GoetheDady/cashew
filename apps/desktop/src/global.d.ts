import type { ChatCommand, ChatEvent, DaemonStatus, DBCommand, DBEvent } from '@cashew/shared';

declare global {
  interface Window {
    cashew: {
      sendChatCommand: (command: ChatCommand) => Promise<void>;
      subscribeChatEvents: (listener: (event: ChatEvent) => void) => () => void;
      sendDBCommand: (command: DBCommand) => Promise<void>;
      subscribeDBEvents: (listener: (event: DBEvent) => void) => () => void;
      getDaemonStatus: () => Promise<DaemonStatus>;
      subscribeDaemonStatus: (listener: (status: DaemonStatus) => void) => () => void;
    };
  }
}

export {};
