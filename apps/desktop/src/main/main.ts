import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { AgentRuntime } from '@cashew/agent';
import {
  CHAT_COMMAND_CHANNEL,
  CHAT_EVENT_CHANNEL,
  DB_COMMAND_CHANNEL,
  DB_EVENT_CHANNEL,
  type ChatCommand,
  type DBCommand,
} from '@cashew/shared';

const agentRuntime = new AgentRuntime({
  isPackaged: app.isPackaged,
});

// 聊天命令处理
ipcMain.handle(CHAT_COMMAND_CHANNEL, async (event, command: ChatCommand): Promise<void> => {
  const windowId = event.sender.id;

  await agentRuntime.handleCommand(windowId, command, (chatEvent) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(CHAT_EVENT_CHANNEL, chatEvent);
    }
  });
});

// 数据库命令处理
ipcMain.handle(DB_COMMAND_CHANNEL, async (event, command: DBCommand): Promise<void> => {
  agentRuntime.handleDBCommand(command, (dbEvent) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(DB_EVENT_CHANNEL, dbEvent);
    }
  });
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
  const windowId = mainWindow.webContents.id;

  mainWindow.on('closed', () => {
    agentRuntime.destroyWindowSession(windowId);
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);

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
