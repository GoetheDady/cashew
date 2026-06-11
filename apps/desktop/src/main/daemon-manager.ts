import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { app } from 'electron';
import type { DaemonStatus } from '@cashew/shared';

type DaemonStatusListener = (status: DaemonStatus) => void;

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 300;
/** 连接超时（毫秒） */
const CONNECT_TIMEOUT_MS = 30000;
/** 最长恢复轮询时间（毫秒） */
const RECOVERY_POLL_TIMEOUT_MS = 120000;

interface DaemonManagerOptions {
  portFilePath?: string;
  pollIntervalMs?: number;
  connectTimeoutMs?: number;
  recoveryPollTimeoutMs?: number;
  checkHealth?: (port: number) => Promise<boolean>;
  spawnDaemon?: () => ChildProcess;
}

/**
 * Daemon 进程管理器。
 *
 * 负责：
 * - 检测 daemon 是否在运行
 * - 自动拉起 daemon 子进程
 * - 通过端口文件发现 daemon
 * - 向 listener 报告连接状态
 */
export class DaemonManager {
  private daemonProcess: ChildProcess | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<DaemonStatusListener>();
  private currentStatus: DaemonStatus = { state: 'disconnected' };
  private readonly portFilePath: string;
  private readonly pollIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly recoveryPollTimeoutMs: number;
  private readonly checkHealthOverride?: (port: number) => Promise<boolean>;
  private readonly spawnDaemonOverride?: () => ChildProcess;

  constructor(options: DaemonManagerOptions = {}) {
    this.portFilePath = options.portFilePath ?? join(homedir(), '.cashew', 'daemon.port');
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.recoveryPollTimeoutMs = options.recoveryPollTimeoutMs ?? RECOVERY_POLL_TIMEOUT_MS;
    this.checkHealthOverride = options.checkHealth;
    this.spawnDaemonOverride = options.spawnDaemon;
  }

  /** 读取端口文件中的端口号 */
  private readPortFile(): number | null {
    try {
      if (!existsSync(this.portFilePath)) return null;
      const port = parseInt(readFileSync(this.portFilePath, 'utf-8').trim(), 10);
      return Number.isNaN(port) ? null : port;
    } catch {
      return null;
    }
  }

  /** 尝试连接 daemon 的健康检查 */
  private async checkHealth(port: number): Promise<boolean> {
    if (this.checkHealthOverride) {
      return this.checkHealthOverride(port);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  /** 更新状态并通知所有 listener */
  private setStatus(status: DaemonStatus): void {
    this.currentStatus = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  /** 获取 daemon 可执行路径 */
  private getDaemonEntryPath(): string {
    if (app.isPackaged) {
      // 生产环境：daemon 编译后的 JS 在 extraResources/daemon 中
      return path.join(process.resourcesPath, 'daemon', 'index.js');
    }
    // 开发环境：用 tsx 运行源码
    return path.join(app.getAppPath(), '..', 'daemon', 'src', 'index.ts');
  }

  /** 获取 daemon 运行命令 */
  private getDaemonCommand(): { command: string; args: string[]; cwd?: string } {
    if (app.isPackaged) {
      // 生产环境：优先使用内嵌的 Node 二进制，fallback 到系统 Node
      const bundledNode = path.join(process.resourcesPath, 'node', 'bin', 'node');
      const nodeBin = existsSync(bundledNode) ? bundledNode : 'node';
      const daemonDir = path.join(process.resourcesPath, 'daemon');
      return { command: nodeBin, args: ['index.js'], cwd: daemonDir };
    }
    // 开发环境：使用系统 Node + tsx
    return { command: 'node', args: ['--import', 'tsx', this.getDaemonEntryPath()] };
  }

  /** 拉起 daemon 子进程 */
  private spawnDaemon(): void {
    if (this.daemonProcess) return;

    if (this.spawnDaemonOverride) {
      this.daemonProcess = this.spawnDaemonOverride();
    } else {
      const { command, args } = this.getDaemonCommand();

      this.daemonProcess = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, CASHEW_PORT: process.env.CASHEW_PORT ?? '0' },
      });
    }

    this.daemonProcess.unref();

    this.daemonProcess.on('exit', (code) => {
      this.daemonProcess = null;
      // daemon 意外退出时通知
      if (this.currentStatus.state !== 'disconnected') {
        this.setStatus({ state: 'error', message: `Daemon exited with code ${code}` });
      }
    });
  }

  /** 轮询端口文件和健康检查 */
  private startPolling(timeoutMs: number): void {
    let elapsed = 0;
    let timeoutReported = false;

    this.pollTimer = setInterval(async () => {
      elapsed += this.pollIntervalMs;

      const port = this.readPortFile();

      if (port) {
        const healthy = await this.checkHealth(port);

        if (healthy) {
          this.stopPolling();
          this.setStatus({ state: 'connected', port });
          return;
        }
      }

      if (elapsed >= timeoutMs && !timeoutReported) {
        timeoutReported = true;
        this.setStatus({
          state: 'error',
          message: 'Failed to connect to Cashew service. Make sure the daemon is running.',
        });
      }

      if (elapsed >= this.recoveryPollTimeoutMs) {
        this.stopPolling();
        this.setStatus({
          state: 'error',
          message: 'Failed to connect to Cashew service. Make sure the daemon is running.',
        });
      }
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** 启动：检测 daemon，必要时拉起，然后轮询直到连上 */
  async start(): Promise<void> {
    this.setStatus({ state: 'connecting' });

    // 先检查是否已有运行的 daemon
    const port = this.readPortFile();

    if (port) {
      const healthy = await this.checkHealth(port);

      if (healthy) {
        this.setStatus({ state: 'connected', port });
        return;
      }
      // 端口文件存在但连不上 → 清理旧的端口文件
      try {
        unlinkSync(this.portFilePath);
      } catch { /* ignore */ }
    }

    // 拉起 daemon
    this.spawnDaemon();
    this.startPolling(this.connectTimeoutMs);
  }

  /** 停止 daemon（发送 shutdown 请求） */
  async stop(): Promise<void> {
    if (this.currentStatus.state === 'connected') {
      try {
        await fetch(`http://localhost:${this.currentStatus.port}/shutdown`, {
          method: 'POST',
        });
      } catch { /* ignore */ }
    }

    this.stopPolling();

    if (this.daemonProcess) {
      this.daemonProcess.kill();
      this.daemonProcess = null;
    }
  }

  /** 注册状态变更监听器 */
  onStatusChange(listener: DaemonStatusListener): () => void {
    this.listeners.add(listener);
    // 立即发送当前状态
    listener(this.currentStatus);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 获取当前状态 */
  getStatus(): DaemonStatus {
    return this.currentStatus;
  }
}
