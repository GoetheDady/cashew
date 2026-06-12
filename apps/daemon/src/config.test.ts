import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfigRoutes, createDaemonConfiguration } from './config.js';

/**
 * Issue 02: Daemon 配置加载
 *
 * 验证 ~/.cashew/config.json 的读写端点。
 * 测试使用临时目录隔离，不触碰真实 home 目录。
 */

function createTestApp(configPath: string): Hono {
  const app = new Hono();
  const configuration = createDaemonConfiguration(configPath, {
    fallbackToDevelopmentEnv: false,
    env: {},
  });
  createConfigRoutes(app, configuration);
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

  it('POST /config merges partial thinkingLevel updates into the saved config file', async () => {
    const response = await fetch(`http://localhost:${port}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thinkingLevel: 'xhigh' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-key',
      thinkingLevel: 'xhigh',
    });

    const fileContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(fileContent).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-key',
      thinkingLevel: 'xhigh',
    });
  });

  it('POST /config with invalid body returns 400 when no complete config can be formed', async () => {
    rmSync(configPath, { force: true });

    const response = await fetch(`http://localhost:${port}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: '' }),
    });

    expect(response.status).toBe(400);
  });
});

describe('loadConfig', () => {
  it('falls back to the existing development env config when requested', async () => {
    const { loadConfig } = await import('./config.js');
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'cashew-config-fallback-test-'));
    const desktopDir = join(workspaceRoot, 'apps', 'desktop');
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(join(desktopDir, '.env.local'), 'DEEPSEEK_API_KEY=sk-from-env-file\n');

    try {
      expect(loadConfig(join(workspaceRoot, 'missing-config.json'), {
        fallbackToDevelopmentEnv: true,
        cwd: workspaceRoot,
        env: {},
      })).toEqual({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        apiKey: 'sk-from-env-file',
        thinkingLevel: 'minimal',
      });
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('uses the same development fallback for config reads and partial updates', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'cashew-config-owner-test-'));
    const desktopDir = join(workspaceRoot, 'apps', 'desktop');
    const configPath = join(workspaceRoot, 'config.json');
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(join(desktopDir, '.env.local'), 'DEEPSEEK_API_KEY=sk-from-shared-owner\n');

    const configuration = createDaemonConfiguration(configPath, {
      fallbackToDevelopmentEnv: true,
      cwd: workspaceRoot,
      env: {},
    });

    try {
      expect(configuration.get()?.apiKey).toBe('sk-from-shared-owner');
      expect(configuration.update({ thinkingLevel: 'high' })).toMatchObject({
        apiKey: 'sk-from-shared-owner',
        thinkingLevel: 'high',
      });
      expect(configuration.get()).toMatchObject({
        apiKey: 'sk-from-shared-owner',
        thinkingLevel: 'high',
      });
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
