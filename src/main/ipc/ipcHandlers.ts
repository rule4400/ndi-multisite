import { ipcMain, BrowserWindow, screen } from 'electron';
import { IPC } from '../../shared/ipcChannels';
import { ndiEngine, configManager, authManager, audioEngine } from '../index';
import { Site, UserRole } from '../../shared/types';

export function setupIpcHandlers(window: BrowserWindow): void {

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

  ipcMain.handle(IPC.CONFIG_SET, (_e, partial: any) => {
    configManager.set(partial);
  });

  ipcMain.handle(IPC.CONFIG_ADD_SITE, (_e, site: Site) => {
    configManager.addSite(site);
    window.webContents.send(IPC.CONFIG_GET, configManager.get());
  });

  ipcMain.handle(IPC.CONFIG_REMOVE_SITE, (_e, siteId: string) => {
    configManager.removeSite(siteId);
    ndiEngine.disconnectSite(siteId);
    window.webContents.send(IPC.CONFIG_GET, configManager.get());
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

  // --- Stream ---
  ipcMain.handle(IPC.STREAM_SOURCE_LIST, () => {
    return ndiEngine.getSources();
  });

  ipcMain.handle(IPC.STREAM_STATUS_UPDATE, () => {
    return ndiEngine.getStreamStatuses();
  });
}
