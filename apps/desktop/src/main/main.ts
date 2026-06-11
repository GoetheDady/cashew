import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { DaemonManager } from './daemon-manager.js';
import { DaemonStatusSubscriptionRegistry } from './daemon-status-subscriptions.js';

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

// IPC: 渲染器订阅 daemon 状态变更
ipcMain.on('cashew:daemon-status-subscribe', (event, subscriptionId: string) => {
  daemonStatusSubscriptions.subscribe(event.sender, subscriptionId);
});

ipcMain.on('cashew:daemon-status-unsubscribe', (event, subscriptionId: string) => {
  daemonStatusSubscriptions.unsubscribe(event.sender, subscriptionId);
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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

  mainWindow.webContents.openDevTools();
};

app.on('ready', () => {
  createWindow();
  // 自动拉起 daemon
  daemonManager.start();
});

app.on('before-quit', async () => {
  await daemonManager.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
