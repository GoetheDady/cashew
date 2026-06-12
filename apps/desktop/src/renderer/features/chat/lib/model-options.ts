export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: '关闭思考',
  minimal: '极简',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '最强',
};

const MODEL_THINKING_EFFECTIVE: Record<string, ThinkingLevel[]> = {
  'deepseek-v4-flash': ['off', 'high', 'xhigh'],
  'deepseek-v4-pro': ['off', 'high', 'xhigh'],
};

export const MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
] as const;

export function getEffectiveLevels(modelId: string): ThinkingLevel[] {
  return MODEL_THINKING_EFFECTIVE[modelId] ?? ['off', 'high', 'xhigh'];
}
