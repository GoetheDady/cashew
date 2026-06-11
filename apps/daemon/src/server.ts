import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { writePortFile } from './lifecycle.js';

type NodeListenError = Error & {
  code?: string;
};

type Server = ReturnType<typeof serve>;

interface ListenResult {
  server: Server;
  port: number;
}

export interface StartDaemonServerOptions {
  app: Hono;
  preferredPort: number;
  portFilePath: string;
  allowPortFallback: boolean;
}

function listen(app: Hono, port: number): Promise<ListenResult> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      server.off('error', onError);
      resolve({ server, port: info.port });
    });

    const onError = (error: NodeListenError) => {
      server.off('error', onError);
      reject(error);
    };

    server.once('error', onError);
  });
}

export async function startDaemonServer({
  app,
  preferredPort,
  portFilePath,
  allowPortFallback,
}: StartDaemonServerOptions): Promise<Server> {
  let result: ListenResult;

  try {
    result = await listen(app, preferredPort);
  } catch (error) {
    if (
      !allowPortFallback ||
      preferredPort === 0 ||
      (error as NodeListenError).code !== 'EADDRINUSE'
    ) {
      throw error;
    }

    result = await listen(app, 0);
  }

  writePortFile(portFilePath, result.port);
  console.log(`[daemon] listening on http://localhost:${result.port}`);

  return result.server;
}
