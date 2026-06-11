import type { Hono } from 'hono';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

/** 端口文件名 */
export const PORT_FILE_BASENAME = 'daemon.port';

/** 满足 close 方法的 server 接口（兼容 Hono 返回的多种 server 类型） */
interface ClosableServer {
  close(callback?: (err?: Error) => void): ClosableServer;
}

/**
 * 将端口号写入端口文件。
 */
export function writePortFile(portFilePath: string, port: number): void {
  writeFileSync(portFilePath, String(port), 'utf-8');
}

/**
 * 删除端口文件（幂等：不存在时不报错）。
 */
export function removePortFile(portFilePath: string): void {
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

/**
 * 在 Hono app 上注册 shutdown 路由。
 * @param app Hono 实例
 * @param server HTTP server 实例（用于关闭）
 * @param portFilePath 端口文件路径（shutdown 时删除）
 * @param onComplete 关闭完成后的回调（默认 process.exit(0)，测试时可覆盖）
 */
export function registerShutdownRoute(
  app: Hono,
  server: ClosableServer,
  portFilePath: string,
  onComplete?: () => void,
): void {
  const done = onComplete ?? (() => process.exit(0));

  app.post('/shutdown', async (c) => {
    const response = c.json({ ok: true });
    setImmediate(() => {
      server.close(() => {
        removePortFile(portFilePath);
        done();
      });
    });
    return response;
  });
}

/**
 * 注册操作系统信号处理（SIGTERM / SIGINT → 优雅退出）。
 */
export function registerSignalHandlers(
  server: ClosableServer,
  portFilePath: string,
  onComplete?: () => void,
): void {
  const done = onComplete ?? (() => process.exit(0));

  const shutdown = (signal: string) => {
    console.log(`[daemon] received ${signal}, shutting down gracefully`);
    server.close(() => {
      removePortFile(portFilePath);
      done();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
