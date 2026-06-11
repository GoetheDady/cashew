import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Daemon 配置类型，对齐 AgentModelConfig。
 */
export interface DaemonConfig {
  provider: string;
  model: string;
  apiKey: string;
  thinkingLevel: string;
}

/** 配置必须包含的字段 */
const REQUIRED_FIELDS = ['provider', 'model', 'apiKey', 'thinkingLevel'] as const;

/**
 * 从文件读取配置，不存在则返回 null。
 */
export function loadConfig(configPath: string): DaemonConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as DaemonConfig;
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

/**
 * 校验配置对象是否包含所有必填字段。
 */
function validateConfig(body: unknown): body is DaemonConfig {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  return REQUIRED_FIELDS.every((field) => field in body);
}

/**
 * 在 Hono app 上注册 config 相关路由。
 */
export function createConfigRoutes(app: Hono, configPath: string): void {
  app.get('/config', (c) => {
    const config = loadConfig(configPath);
    return c.json(config);
  });

  app.post('/config', async (c) => {
    const body = await c.req.json();

    if (!validateConfig(body)) {
      return c.json(
        { error: `Missing required fields. Required: ${REQUIRED_FIELDS.join(', ')}` },
        400,
      );
    }

    saveConfig(configPath, body);
    return c.json(body);
  });
}
