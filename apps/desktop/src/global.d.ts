import type { ChatRequest, ChatResponse } from '@cashew/shared';

declare global {
  interface Window {
    cashew: {
      chat: (request: ChatRequest) => Promise<ChatResponse>;
    };
  }
}

export {};
