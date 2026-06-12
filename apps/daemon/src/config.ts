import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path, { dirname } from 'node:path';

/**
 * Daemon 配置类型，对齐 AgentModelConfig。
 */
export interface DaemonConfig {
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: string;
}

export interface LoadConfigOptions {
  fallbackToDevelopmentEnv?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DaemonConfiguration {
  get(): DaemonConfig | null;
  update(changes: Partial<DaemonConfig>): DaemonConfig;
}

/** 配置必须包含的字段 */
const REQUIRED_FIELDS = ['provider', 'model', 'apiKey', 'thinkingLevel'] as const;

function readEnvFileValue(filePath: string, name: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  for (const line of readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    if (trimmed.slice(0, separatorIndex).trim() !== name) continue;

    return trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
  }

  return undefined;
}

function loadDevelopmentConfig(options: LoadConfigOptions): DaemonConfig | null {
  const envApiKey = (options.env ?? process.env).DEEPSEEK_API_KEY?.trim();
  if (envApiKey) {
    return createDeepSeekConfig(envApiKey);
  }

  const cwd = options.cwd ?? process.cwd();
  const workspaceRoot = path.basename(path.dirname(cwd)) === 'apps'
    ? path.resolve(cwd, '../..')
    : cwd;
  const envFiles = [
    path.resolve(workspaceRoot, 'apps/desktop/.env.local'),
    path.resolve(workspaceRoot, 'apps/desktop/.env'),
    path.resolve(workspaceRoot, '.env.local'),
    path.resolve(workspaceRoot, '.env'),
  ];

  for (const filePath of envFiles) {
    const apiKey = readEnvFileValue(filePath, 'DEEPSEEK_API_KEY');
    if (apiKey) return createDeepSeekConfig(apiKey);
  }

  return null;
}

function createDeepSeekConfig(apiKey: string): DaemonConfig {
  return {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey,
    thinkingLevel: 'minimal',
  };
}

/**
 * 从文件读取配置。文件值优先，空字段退到 dev fallback（env 等），
 * 确保 UI 写入了部分字段（如 thinkingLevel）时不会丢失 apiKey。
 */
export function loadConfig(configPath: string, options: LoadConfigOptions = {}): DaemonConfig | null {
  let fileConfig: Partial<DaemonConfig> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as Partial<DaemonConfig>;
  }

  const fallback = options.fallbackToDevelopmentEnv
    ? loadDevelopmentConfig(options)
    : null;

  // 合并：文件值优先，空字符串视为未设置，回退到 fallback
  const merged: DaemonConfig = {
    provider: fileConfig.provider || fallback?.provider || 'deepseek',
    model: fileConfig.model || fallback?.model || 'deepseek-v4-flash',
    apiKey: fileConfig.apiKey || fallback?.apiKey || '',
    thinkingLevel: fileConfig.thinkingLevel || fallback?.thinkingLevel || 'minimal',
  };

  if (!merged.apiKey && !fallback) return null;

  return merged;
}

/**
 * 写入配置到文件，自动创建父目录。
 */
function saveConfig(configPath: string, config: DaemonConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function createDaemonConfiguration(
  configPath: string,
  loadOptions: LoadConfigOptions = { fallbackToDevelopmentEnv: true },
): DaemonConfiguration {
  return {
    get() {
      return loadConfig(configPath, loadOptions);
    },
    update(changes) {
      const current = loadConfig(configPath, loadOptions);
      const merged: DaemonConfig = {
        provider: changes.provider || current?.provider || 'deepseek',
        model: changes.model || current?.model || 'deepseek-v4-flash',
        apiKey: changes.apiKey || current?.apiKey || '',
        thinkingLevel: changes.thinkingLevel || current?.thinkingLevel || 'minimal',
      };

      if (!validateConfig(merged)) {
        throw new Error(`缺少必填配置项：${REQUIRED_FIELDS.join(', ')}`);
      }

      saveConfig(configPath, merged);
      return merged;
    },
  };
}

/**
 * 校验配置对象是否包含所有必填字段。
 */
function validateConfig(body: unknown): body is DaemonConfig {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  return REQUIRED_FIELDS.every((field) => {
    if (!(field in body)) return false;
    const value = (body as Record<typeof field, unknown>)[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/**
 * 在 Hono app 上注册 config 相关路由。
 */
export function createConfigRoutes(
  app: Hono,
  configuration: DaemonConfiguration,
): void {
  app.get('/config', (c) => {
    return c.json(configuration.get());
  });

  app.post('/config', async (c) => {
    const body = await c.req.json();

    try {
      return c.json(configuration.update(body));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : '配置无效' },
        400,
      );
    }
  });
}
