import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonManager } from './daemon-manager';
import type { DaemonStatus } from '@cashew/shared';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(process.cwd(), 'apps', 'desktop'),
  },
}));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.unref = vi.fn();
  child.kill = vi.fn();
  return child;
}

describe('DaemonManager', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const tmpDir of tmpDirs.splice(0)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('recovers from a startup timeout when the daemon becomes healthy later', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cashew-daemon-manager-test-'));
    tmpDirs.push(tmpDir);
    const portFilePath = join(tmpDir, 'daemon.port');
    const statuses: DaemonStatus[] = [];
    let healthy = false;

    const manager = new DaemonManager({
      portFilePath,
      pollIntervalMs: 5,
      connectTimeoutMs: 10,
      recoveryPollTimeoutMs: 100,
      checkHealth: async () => healthy,
      spawnDaemon: fakeChildProcess,
    });

    manager.onStatusChange((status) => statuses.push(status));

    await manager.start();
    await sleep(25);

    writeFileSync(portFilePath, '4567', 'utf-8');
    healthy = true;
    await sleep(25);

    expect(statuses).toContainEqual({
      state: 'error',
      message: 'Failed to connect to Cashew service. Make sure the daemon is running.',
    });
    expect(statuses.at(-1)).toEqual({ state: 'connected', port: 4567 });

    await manager.stop();
  });
});
