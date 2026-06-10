import { contextBridge, ipcRenderer } from 'electron';
import {
  CHAT_COMMAND_CHANNEL,
  CHAT_EVENT_CHANNEL,
  DB_COMMAND_CHANNEL,
  DB_EVENT_CHANNEL,
  type ChatCommand,
  type ChatEvent,
  type DBCommand,
  type DBEvent,
} from '@cashew/shared';

contextBridge.exposeInMainWorld('cashew', {
  sendChatCommand: (command: ChatCommand): Promise<void> =>
    ipcRenderer.invoke(CHAT_COMMAND_CHANNEL, command),
  subscribeChatEvents: (listener: (event: ChatEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chatEvent: ChatEvent) => {
      listener(chatEvent);
    };

    ipcRenderer.on(CHAT_EVENT_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(CHAT_EVENT_CHANNEL, handler);
    };
  },
  sendDBCommand: (command: DBCommand): Promise<void> =>
    ipcRenderer.invoke(DB_COMMAND_CHANNEL, command),
  subscribeDBEvents: (listener: (event: DBEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dbEvent: DBEvent) => {
      listener(dbEvent);
    };

    ipcRenderer.on(DB_EVENT_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(DB_EVENT_CHANNEL, handler);
    };
  },
});
