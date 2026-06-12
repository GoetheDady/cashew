export interface DesktopLifecycleApp {
  exit(exitCode?: number): void;
  on(
    event: 'ready' | 'before-quit' | 'window-all-closed' | 'activate',
    listener: (event?: { preventDefault(): void }) => void | Promise<void>,
  ): void;
}

interface DesktopLifecycleOptions {
  createWindow(): void;
  hasOpenWindows(): boolean;
  startDaemon(): void | Promise<void>;
  stopDaemon(): void | Promise<void>;
}

/**
 * Desktop lifecycle 使用领域语义区分 Close 与 Quit：
 * Close 只关闭窗口，明确 Quit 才会停止独立运行的 Daemon。
 */
export function registerDesktopLifecycle(
  app: DesktopLifecycleApp,
  options: DesktopLifecycleOptions,
): void {
  let quitStarted = false;

  app.on('ready', () => {
    options.createWindow();
    return options.startDaemon();
  });

  app.on('before-quit', async (event) => {
    if (quitStarted) return;
    quitStarted = true;
    event?.preventDefault();
    await options.stopDaemon();
    app.exit(0);
  });

  app.on('window-all-closed', () => {
    // Daemon 独立于窗口运行，Close 不等于 Quit。
  });

  app.on('activate', () => {
    if (!options.hasOpenWindows()) {
      options.createWindow();
    }
  });
}
