import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfigRoutes } from './config.js';

/**
 * Issue 02: Daemon 配置加载
 *
 * 验证 ~/.cashew/config.json 的读写端点。
 * 测试使用临时目录隔离，不触碰真实 home 目录。
 */

function createTestApp(configPath: string): Hono {
  const app = new Hono();
  createConfigRoutes(app, configPath);
  return app;
}

describe('config endpoints', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let tmpDir: string;
  let configPath: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cashew-config-test-'));
    configPath = join(tmpDir, 'config.json');
    const app = createTestApp(configPath);
    server = serve({ fetch: app.fetch, port: 0 });
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /config returns null when config file does not exist', async () => {
    const response = await fetch(`http://localhost:${port}/config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it('POST /config saves config and returns it', async () => {
    const config = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-key',
      thinkingLevel: 'medium',
    };

    const response = await fetch(`http://localhost:${port}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(config);

    // 验证文件确实写入了
    expect(existsSync(configPath)).toBe(true);
    const fileContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(fileContent).toEqual(config);
  });

  it('GET /config returns previously saved config', async () => {
    const response = await fetch(`http://localhost:${port}/config`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-key',
      thinkingLevel: 'medium',
    });
  });

  it('POST /config with invalid body returns 400', async () => {
    const response = await fetch(`http://localhost:${port}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'deepseek' }),
    });

    expect(response.status).toBe(400);
  });
});
