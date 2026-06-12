import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonManager, resolvePackagedDaemonCommand } from './daemon-manager';
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
      message: '无法连接到 Cashew 本地服务，请确认服务是否正在运行。',
    });
    expect(statuses.at(-1)).toEqual({ state: 'connected', port: 4567 });

    await manager.stop();
  });

  it('reports a clean daemon exit as an error', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cashew-daemon-manager-test-'));
    tmpDirs.push(tmpDir);
    const statuses: DaemonStatus[] = [];
    const child = fakeChildProcess();
    const manager = new DaemonManager({
      portFilePath: join(tmpDir, 'daemon.port'),
      pollIntervalMs: 100,
      spawnDaemon: () => child,
    });

    manager.onStatusChange((status) => statuses.push(status));

    await manager.start();
    child.emit('exit', 0);

    expect(statuses.at(-1)).toEqual({
      state: 'error',
      message: '本地服务已退出，退出代码：0',
    });

    await manager.stop();
  });

  it('kills the old child process and spawns a fresh one when reconnecting', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cashew-daemon-manager-test-'));
    tmpDirs.push(tmpDir);
    const children = [fakeChildProcess(), fakeChildProcess()];
    const spawnDaemon = vi.fn(() => children.shift() as ChildProcess);
    const manager = new DaemonManager({
      portFilePath: join(tmpDir, 'daemon.port'),
      pollIntervalMs: 100,
      spawnDaemon,
    });

    await manager.start();
    const firstChild = spawnDaemon.mock.results[0].value;
    await manager.reconnect();

    expect(firstChild.kill).toHaveBeenCalledTimes(1);
    expect(spawnDaemon).toHaveBeenCalledTimes(2);
    expect(manager.getStatus()).toEqual({ state: 'connecting' });

    await manager.stop();
  });

  it('reuses an independently running Daemon when reconnecting', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cashew-daemon-manager-test-'));
    tmpDirs.push(tmpDir);
    const portFilePath = join(tmpDir, 'daemon.port');
    writeFileSync(portFilePath, '4567', 'utf-8');
    const spawnDaemon = vi.fn(fakeChildProcess);
    const manager = new DaemonManager({
      portFilePath,
      checkHealth: async (port) => port === 4567,
      spawnDaemon,
    });

    await manager.start();
    await manager.reconnect();

    expect(spawnDaemon).not.toHaveBeenCalled();
    expect(manager.getStatus()).toEqual({ state: 'connected', port: 4567 });

    await manager.stop();
  });
});

describe('packaged Daemon command', () => {
  it('fails clearly when the bundled Node runtime is missing', () => {
    expect(() => resolvePackagedDaemonCommand('/resources', () => false)).toThrow(
      'Cashew 安装包缺少内置 Node runtime',
    );
  });

  it('runs the packaged Daemon with the bundled Node runtime', () => {
    expect(resolvePackagedDaemonCommand('/resources', () => true)).toEqual({
      command: process.platform === 'win32'
        ? '/resources/node/bin/node.exe'
        : '/resources/node/bin/node',
      args: ['index.js'],
      cwd: '/resources/daemon',
    });
  });
});
