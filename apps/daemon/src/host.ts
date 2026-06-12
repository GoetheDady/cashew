import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, DEFAULT_DATA_DIR } from './app.js';
import {
  PORT_FILE_BASENAME,
  registerShutdownRoute,
  registerSignalHandlers,
  removePortFile,
} from './lifecycle.js';
import { startDaemonServer } from './server.js';

export interface DaemonHost {
  port: number;
  stop(): Promise<void>;
}

interface StartDaemonHostOptions {
  dataDir?: string;
  preferredPort?: number;
  allowPortFallback?: boolean;
  registerSignals?: boolean;
}

export async function startDaemonHost(options: StartDaemonHostOptions = {}): Promise<DaemonHost> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const hasEnvPort = process.env.CASHEW_PORT !== undefined;
  const envPort = hasEnvPort ? parseInt(process.env.CASHEW_PORT || '', 10) : undefined;
  const preferredPort = options.preferredPort ?? envPort ?? 11434;
  const allowPortFallback = options.allowPortFallback ?? !hasEnvPort;
  const portFilePath = join(dataDir, PORT_FILE_BASENAME);
  const app = createApp({
    configPath: join(dataDir, 'config.json'),
    dbPath: join(dataDir, 'db.sqlite'),
  });
  const server = await startDaemonServer({
    app,
    preferredPort,
    portFilePath,
    allowPortFallback,
  });

  registerShutdownRoute(app, server, portFilePath);
  if (options.registerSignals !== false) {
    registerSignalHandlers(server, portFilePath);
  }

  const port = (server.address() as { port: number }).port;
  return {
    port,
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        removePortFile(portFilePath);
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}
