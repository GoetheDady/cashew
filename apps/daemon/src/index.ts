import { createApp, DEFAULT_DATA_DIR } from './app.js';
import { registerShutdownRoute, registerSignalHandlers } from './lifecycle.js';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { PORT_FILE_BASENAME } from './lifecycle.js';
import { startDaemonServer } from './server.js';

// 确保数据目录存在
if (!existsSync(DEFAULT_DATA_DIR)) {
  mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
}

const portFilePath = join(DEFAULT_DATA_DIR, PORT_FILE_BASENAME);

// 端口策略：环境变量 → 默认 11434 → 默认端口冲突时回退到 0（系统分配）
const hasEnvPort = process.env.CASHEW_PORT !== undefined;
const envPort = hasEnvPort ? parseInt(process.env.CASHEW_PORT || '', 10) : undefined;
const preferredPort = envPort ?? 11434;

const app = createApp();

// 先启动 server 再注册 shutdown 端点。显式端口失败时应暴露错误；
// 默认端口冲突时回退到随机端口，桌面端通过端口文件发现实际端口。
const server = await startDaemonServer({
  app,
  preferredPort,
  portFilePath,
  allowPortFallback: !hasEnvPort,
});

registerShutdownRoute(app, server, portFilePath);
registerSignalHandlers(server, portFilePath);
