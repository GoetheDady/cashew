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

export function normalizeChatConfig(config: DaemonConfigResponse): ChatConfig {
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

export async function fetchChatConfig(port: number): Promise<ChatConfig> {
  const response = await fetch(`http://localhost:${port}/config`);
  const config = await response.json() as DaemonConfigResponse;
  return normalizeChatConfig(config);
}

export async function saveChatConfig(
  port: number,
  updates: Partial<ChatConfig>,
): Promise<void> {
  const response = await fetch(`http://localhost:${port}/config`);
  const current = await response.json() as DaemonConfigResponse;
  const merged = {
    ...(current || {}),
    ...updates,
  };

  await fetch(`http://localhost:${port}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  });
}
