import { Hono } from 'hono';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConfigRoutes } from './config.js';
import { openDatabase, createSessionRoutes } from './database.js';
import { createTurnRoutes } from './agent.js';

/** 默认数据目录：~/.cashew */
export const DEFAULT_DATA_DIR = join(homedir(), '.cashew');

/** 默认配置路径：~/.cashew/config.json */
export const DEFAULT_CONFIG_PATH = join(DEFAULT_DATA_DIR, 'config.json');

/** 默认数据库路径：~/.cashew/db.sqlite */
export const DEFAULT_DB_PATH = join(DEFAULT_DATA_DIR, 'db.sqlite');

export interface CreateAppOptions {
  configPath?: string;
  dbPath?: string;
}

/**
 * 创建 Hono 应用实例，注册所有路由。
 * 参数可注入，方便测试时使用临时路径。
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const app = new Hono();

  // CORS 中间件：允许 renderer 跨域访问（dev 时端口不同）
  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type');

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  });

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  createConfigRoutes(app, configPath);

  const db = openDatabase(dbPath);
  createSessionRoutes(app, db);
  createTurnRoutes(app, db);

  return app;
}
