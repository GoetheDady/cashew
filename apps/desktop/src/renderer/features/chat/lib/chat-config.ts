import { getEffectiveLevels, MODELS, type ThinkingLevel } from './model-options';

export type ChatConfig = {
  model: string;
  thinkingLevel: ThinkingLevel;
};

export type DaemonConfigResponse = Partial<{
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: string;
}> | null;

export function normalizeChatConfig(input: unknown): ChatConfig {
  const config = typeof input === 'object' && input !== null
    ? input as Exclude<DaemonConfigResponse, null>
    : null;
  const model = typeof config?.model === 'string' && config.model
    ? config.model
    : MODELS[0].id;
  const requestedThinkingLevel = config?.thinkingLevel;
  const effectiveLevels = getEffectiveLevels(model);
  const thinkingLevel = effectiveLevels.includes(requestedThinkingLevel as ThinkingLevel)
    ? requestedThinkingLevel as ThinkingLevel
    : 'off';

  return { model, thinkingLevel };
}
