import { ipcMain, BrowserWindow, screen, app, shell } from 'electron';
import { IPC } from '../../shared/ipcChannels';
import { ndiEngine, configManager, authManager, audioEngine, syncManager } from '../index';
import { firewallManager } from '../system/firewallManager';
import { Site, UserRole } from '../../shared/types';

export function setupIpcHandlers(window: BrowserWindow): void {

  // --- App Info ---
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));

  // --- System ---
  ipcMain.handle(IPC.SYSTEM_CONFIGURE_FIREWALL, () => firewallManager.configure());
  ipcMain.handle(IPC.SYSTEM_FIREWALL_STATUS,    () => ({
    configured: firewallManager.isConfigured(),
    platform:   process.platform,
  }));

  // --- Auth ---
  ipcMain.handle(IPC.AUTH_IS_FIRST_RUN, async () => {
    return authManager.isFirstRun();
  });

  ipcMain.handle(IPC.AUTH_LOGIN, async (_e, password: string) => {
    const result = await authManager.login(password);
    if (result.success && result.role === 'full') {
      await ndiEngine.startSender();
    }
    return result;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, () => {
    authManager.logout();
    ndiEngine.stopSender();
  });

  ipcMain.handle(IPC.AUTH_GET_ROLE, () => {
    return authManager.getRole();
  });

  ipcMain.handle(IPC.AUTH_SET_PASSWORD, async (_e, role: UserRole, password: string) => {
    await authManager.setPassword(role, password);
  });

  // --- Config ---
  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configManager.get();
  });

  ipcMain.handle(IPC.CONFIG_SET, async (_e, partial: any) => {
    configManager.set(partial);
    // NDI エンジンに最新設定を反映（送信名・自拠点・拠点リストの変更を検知）
    ndiEngine.applyConfig(configManager.get());
    // 同期設定が変わった場合はサーバー/クライアントを再起動
    if (partial.sync) {
      await syncManager.start();
    }
  });

  ipcMain.handle(IPC.CONFIG_ADD_SITE, (_e, site: Site) => {
    configManager.addSite(site);
    ndiEngine.applyConfig(configManager.get());
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.CONFIG_GET, configManager.get());
    }
  });

  ipcMain.handle(IPC.CONFIG_REMOVE_SITE, (_e, siteId: string) => {
    configManager.removeSite(siteId);
    ndiEngine.disconnectSite(siteId);
    ndiEngine.applyConfig(configManager.get());
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.CONFIG_GET, configManager.get());
    }
  });

  ipcMain.handle(IPC.CONFIG_GET_MONITORS, () => {
    return screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: `モニター ${i + 1} (${d.size.width}x${d.size.height})`,
      width: d.size.width,
      height: d.size.height,
      isPrimary: d.id === screen.getPrimaryDisplay().id,
    }));
  });

  // --- Device Control ---
  ipcMain.handle(IPC.CTRL_SET_CAMERA, (_e, enabled: boolean) => {
    // Guard: only full access role can control camera
    if (!authManager.isFullAccess()) return;
    ndiEngine.setCameraEnabled(enabled);
  });

  ipcMain.handle(IPC.CTRL_SET_MIC, (_e, enabled: boolean) => {
    if (!authManager.isFullAccess()) return;
    ndiEngine.setMicEnabled(enabled);
  });

  ipcMain.handle(IPC.CTRL_SET_SPEAKER, (_e, enabled: boolean) => {
    audioEngine.setSpeakerEnabled(enabled);
  });

  ipcMain.handle(IPC.CTRL_SET_VOLUME, (_e, vol: number) => {
    audioEngine.setMasterVolume(vol);
  });

  ipcMain.handle(IPC.CTRL_SET_SITE_VOLUME, (_e, siteId: string, vol: number) => {
    audioEngine.setSiteVolume(siteId, vol);
  });

  ipcMain.handle(IPC.CTRL_GET_DEVICE_STATE, () => {
    return {
      cameraEnabled: true,
      micEnabled: true,
      speakerEnabled: audioEngine.isSpeakerEnabled(),
      masterVolume: audioEngine.getMasterVolume(),
      siteVolumes: {},
    };
  });

  // --- Sync ---
  ipcMain.handle('sync:now', async () => {
    return syncManager.syncNow();
  });

  ipcMain.handle('sync:discoverHost', async (_e, port: number, subnet: string) => {
    return syncManager.discoverHost(port, subnet);
  });

  // --- Stream ---
  ipcMain.handle(IPC.STREAM_SOURCE_LIST, () => {
    return ndiEngine.getSources();
  });

  ipcMain.handle(IPC.STREAM_GET_SOURCES, () => {
    return ndiEngine.getSources();
  });

  ipcMain.handle(IPC.STREAM_STATUS_UPDATE, () => {
    return ndiEngine.getStreamStatuses();
  });

  ipcMain.handle(IPC.STREAM_CONNECT_SITE, async (_e, siteId: string, sourceName?: string) => {
    const config = configManager.get();
    const site = config.sites.find(s => s.id === siteId);
    if (!site) return;
    if (sourceName) {
      await ndiEngine.switchSiteSource(siteId, sourceName);
    } else {
      await ndiEngine.connectToSite(site);
    }
  });

  ipcMain.handle(IPC.STREAM_DISCONNECT_SITE, (_e, siteId: string) => {
    ndiEngine.disconnectSite(siteId);
  });

  // renderer → main: カメラ映像フレーム（RGBA Uint8Array）
  ipcMain.on(IPC.STREAM_PUSH_FRAME, (_e, data: Uint8Array, width: number, height: number) => {
    ndiEngine.pushVideoFrame(data, width, height);
  });

  // renderer → main: マイク音声（インターリーブ Float32Array）
  ipcMain.on(IPC.STREAM_PUSH_AUDIO, (_e, data: Float32Array, sampleRate: number, channels: number) => {
    ndiEngine.pushAudioChunk(data, sampleRate, channels);
  });
}
