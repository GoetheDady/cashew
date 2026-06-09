// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import type { ChatRequest, ChatResponse } from '@cashew/shared';

contextBridge.exposeInMainWorld('cashew', {
  chat: (request: ChatRequest): Promise<ChatResponse> =>
    ipcRenderer.invoke('cashew:chat', request),
});
