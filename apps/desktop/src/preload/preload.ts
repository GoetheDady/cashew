import { contextBridge, ipcRenderer } from 'electron';
import {
  CHAT_COMMAND_CHANNEL,
  CHAT_EVENT_CHANNEL,
  type ChatCommand,
  type ChatEvent,
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
});
