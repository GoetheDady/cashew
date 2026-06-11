import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './app.js';
import { startDaemonServer } from './server.js';

type Server = ReturnType<typeof serve>;

describe('daemon server startup', () => {
  const servers: Server[] = [];
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
    }

    for (const tmpDir of tmpDirs.splice(0)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to an available port when the default port is occupied', async () => {
    const occupiedApp = new Hono();
    occupiedApp.get('/health', (c) => c.json({ status: 'occupied' }));
    const occupiedServer = serve({ fetch: occupiedApp.fetch, port: 0 });
    servers.push(occupiedServer);

    const occupiedPort = (occupiedServer.address() as { port: number }).port;
    const tmpDir = mkdtempSync(join(tmpdir(), 'cashew-server-test-'));
    tmpDirs.push(tmpDir);
    const portFilePath = join(tmpDir, 'daemon.port');

    const app = createApp({
      configPath: join(tmpDir, 'config.json'),
      dbPath: join(tmpDir, 'test.db'),
    });

    const daemonServer = await startDaemonServer({
      app,
      preferredPort: occupiedPort,
      portFilePath,
      allowPortFallback: true,
    });
    servers.push(daemonServer);

    const actualPort = Number(readFileSync(portFilePath, 'utf-8'));

    expect(actualPort).not.toBe(occupiedPort);

    const response = await fetch(`http://localhost:${actualPort}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
