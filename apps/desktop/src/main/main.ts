import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { DaemonManager } from './daemon-manager.js';
import { DaemonStatusSubscriptionRegistry } from './daemon-status-subscriptions.js';
import { registerDesktopLifecycle } from './desktop-lifecycle.js';

const daemonManager = new DaemonManager();
const daemonStatusSubscriptions = new DaemonStatusSubscriptionRegistry((listener) =>
  daemonManager.onStatusChange(listener),
);

// IPC: 渲染器获取 daemon 端口
ipcMain.handle('cashew:daemon-port', () => {
  const status = daemonManager.getStatus();
  return status.state === 'connected' ? status.port : null;
});
ipcMain.handle('cashew:daemon-status', () => {
  return daemonManager.getStatus();
});
ipcMain.handle('cashew:daemon-reconnect', async () => {
  await daemonManager.reconnect();
});

// IPC: 渲染器订阅 daemon 状态变更
ipcMain.on('cashew:daemon-status-subscribe', (event, subscriptionId: string) => {
  daemonStatusSubscriptions.subscribe(event.sender, subscriptionId);
});

ipcMain.on('cashew:daemon-status-unsubscribe', (event, subscriptionId: string) => {
  daemonStatusSubscriptions.unsubscribe(event.sender, subscriptionId);
});

const createWindow = () => {
  const macWindowOptions =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          vibrancy: 'sidebar' as const,
          visualEffectState: 'followWindow' as const,
          transparent: true,
          backgroundColor: '#00000000',
        }
      : {
          titleBarStyle: 'default' as const,
        };

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    ...macWindowOptions,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

};

registerDesktopLifecycle(app, {
  createWindow,
  hasOpenWindows: () => BrowserWindow.getAllWindows().length > 0,
  startDaemon: () => daemonManager.start(),
  stopDaemon: () => daemonManager.stop(),
});
