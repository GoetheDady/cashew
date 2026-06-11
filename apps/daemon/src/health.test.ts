import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Issue 01: Daemon 健康检查
 */

describe('daemon health check', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cashew-health-test-'));
    const app = createApp({
      configPath: join(tmpDir, 'config.json'),
      dbPath: join(tmpDir, 'test.db'),
    });
    server = serve({ fetch: app.fetch, port: 0 });
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /health returns 200 with { status: "ok" }', async () => {
    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('GET /health response has content-type application/json', async () => {
    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});
