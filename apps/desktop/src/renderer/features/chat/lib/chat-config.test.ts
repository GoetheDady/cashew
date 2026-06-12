import { describe, expect, it } from 'vitest';
import { normalizeChatConfig } from './chat-config';

describe('normalizeChatConfig', () => {
  it('uses model and thinking level from daemon config', () => {
    expect(normalizeChatConfig({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-test',
      thinkingLevel: 'xhigh',
    })).toEqual({
      model: 'deepseek-v4-flash',
      thinkingLevel: 'xhigh',
    });
  });

  it('falls back to off when the saved thinking level is not effective for the model', () => {
    expect(normalizeChatConfig({
      model: 'deepseek-v4-flash',
      thinkingLevel: 'medium',
    })).toEqual({
      model: 'deepseek-v4-flash',
      thinkingLevel: 'off',
    });
  });
});
