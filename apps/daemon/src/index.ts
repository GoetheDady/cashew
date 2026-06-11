import { serve } from '@hono/node-server';
import { createApp, DEFAULT_DATA_DIR } from './app.js';
import { writePortFile, registerShutdownRoute, registerSignalHandlers } from './lifecycle.js';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { PORT_FILE_BASENAME } from './lifecycle.js';

// 确保数据目录存在
if (!existsSync(DEFAULT_DATA_DIR)) {
  mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
}

const portFilePath = join(DEFAULT_DATA_DIR, PORT_FILE_BASENAME);

// 端口策略：环境变量 → 默认 11434 → 0（系统分配）
const envPort = process.env.CASHEW_PORT ? parseInt(process.env.CASHEW_PORT, 10) : undefined;
const preferredPort = envPort ?? 11434;

const app = createApp();

// 先启动 server 再注册 shutdown 端点
const server = serve({ fetch: app.fetch, port: preferredPort }, (info) => {
  const actualPort = info.port;
  writePortFile(portFilePath, actualPort);
  console.log(`[daemon] listening on http://localhost:${actualPort}`);
});

registerShutdownRoute(app, server, portFilePath);
registerSignalHandlers(server, portFilePath);
