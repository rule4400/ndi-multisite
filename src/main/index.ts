import { app, BrowserWindow, dialog, systemPreferences, screen, ipcMain } from 'electron';
import * as path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { setupIpcHandlers } from './ipc/ipcHandlers';
import { NDIEngine } from './ndi/ndiEngine';
import { ConfigManager } from './config/configManager';
import { AuthManager } from './auth/authManager';
import { AudioEngine } from './audio/audioEngine';
import { SyncManager } from './sync/syncManager';
import { IPC } from '../shared/ipcChannels';

log.initialize();
log.transports.file.level = 'info';

let mainWindow: BrowserWindow | null = null;

export const ndiEngine = new NDIEngine();
export const configManager = new ConfigManager();
export const authManager = new AuthManager();
export const audioEngine = new AudioEngine();
export const syncManager = new SyncManager(configManager);

// Viteの開発サーバーポート（環境変数で上書き可能）
const DEV_PORT = process.env.VITE_PORT ?? '5173';

async function requestMediaPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return;

  // パッケージ済みアプリのみ権限リクエストを行う
  // 開発中は electron バイナリで動くため、ターミナルの権限が使われる
  if (!app.isPackaged) {
    log.info('開発モード: カメラ/マイク権限リクエストをスキップ（ターミナルの権限を使用）');
    return;
  }

  const cameraStatus = await systemPreferences.askForMediaAccess('camera');
  const micStatus = await systemPreferences.askForMediaAccess('microphone');
  if (!cameraStatus || !micStatus) {
    const result = await dialog.showMessageBox({
      type: 'warning',
      message: 'カメラとマイクへのアクセスを許可してください',
      detail: 'システム設定 > プライバシーとセキュリティ > カメラ / マイク から許可してください。',
      buttons: ['システム設定を開く', '後で'],
    });
    if (result.response === 0) {
      const { shell } = await import('electron');
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
    }
  }
}

async function createWindow(): Promise<void> {
  const config = configManager.get();
  const displays = screen.getAllDisplays();
  const targetDisplay = displays[config.ui.targetMonitorIndex] ?? displays[0];
  const { bounds } = targetDisplay;

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    x: bounds.x,
    y: bounds.y,
    fullscreen: config.ui.startFullscreen,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,   // preloadでrequireを使うために必要（Electron 30+）
      preload: path.join(__dirname, '../preload/index.js'),
    },
    backgroundColor: '#0a0a0a',
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log.info('Window shown');
  });

  if (process.env.NODE_ENV === 'development') {
    const url = `http://localhost:${DEV_PORT}`;
    log.info(`Loading dev URL: ${url}`);
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    log.error(`Page load failed: ${code} ${desc}`);
  });

  setupIpcHandlers(mainWindow);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 自動アップデート設定 ───────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.logger = log;
  (autoUpdater.logger as any).transports.file.level = 'info';

  // バックグラウンドで自動ダウンロード
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel: string, ...args: any[]) =>
    mainWindow?.webContents.send(channel, ...args);

  autoUpdater.on('checking-for-update',   ()       => send(IPC.UPDATE_CHECKING));
  autoUpdater.on('update-available',      (info)   => { log.info('Update available:', info.version); send(IPC.UPDATE_AVAILABLE, info); });
  autoUpdater.on('update-not-available',  (info)   => { log.info('Already up-to-date:', info.version); send(IPC.UPDATE_NOT_AVAILABLE, info); });
  autoUpdater.on('download-progress',     (prog)   => send(IPC.UPDATE_PROGRESS, prog));
  autoUpdater.on('update-downloaded',     (info)   => { log.info('Update downloaded:', info.version); send(IPC.UPDATE_DOWNLOADED, info); });
  autoUpdater.on('error',                 (err)    => { log.error('AutoUpdater error:', err); send(IPC.UPDATE_ERROR, err.message); });

  // renderer からの操作を受け付ける
  ipcMain.handle(IPC.UPDATE_CHECK,   () => autoUpdater.checkForUpdates());
  ipcMain.handle(IPC.UPDATE_INSTALL, () => { autoUpdater.quitAndInstall(false, true); });
}

app.whenReady().then(async () => {
  log.info('App starting...');
  await requestMediaPermissions();
  const config = configManager.get();
  await ndiEngine.initialize(config, null);
  await createWindow();
  ndiEngine.setWindow(mainWindow!);
  syncManager.setWindow(mainWindow!);
  await syncManager.start();

  // パッケージ済みアプリのみ自動アップデートを有効化
  if (app.isPackaged) {
    setupAutoUpdater();
    // 起動 5 秒後にアップデートチェック（起動処理が落ち着いてから）
    setTimeout(() => autoUpdater.checkForUpdates().catch(e => log.warn('Update check failed:', e)), 5000);
  } else {
    log.info('開発モード: 自動アップデートをスキップ');
  }
});

app.on('before-quit', async () => {
  log.info('App shutting down...');
  await syncManager.stop();
  await ndiEngine.shutdown();
  audioEngine.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
