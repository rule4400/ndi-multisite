import { contextBridge, ipcRenderer } from 'electron';
import type { AuthResult, AppConfig, Site, UserRole, DeviceState, StreamState, NDISource, VideoFrame, MonitorInfo } from '../shared/types';

// IPCチャンネル名をインライン定義（sandbox環境でのrequire問題を回避）
const IPC = {
  STREAM_VIDEO_FRAME:    'stream:videoFrame',
  STREAM_SOURCE_LIST:    'stream:sourceList',
  STREAM_STATUS_UPDATE:  'stream:statusUpdate',
  STREAM_CONNECT_SITE:   'stream:connectSite',
  STREAM_DISCONNECT_SITE:'stream:disconnectSite',
  STREAM_GET_SOURCES:    'stream:getSources',
  STREAM_PUSH_FRAME:     'stream:pushFrame',
  STREAM_PUSH_AUDIO:     'stream:pushAudio',
  DEVICE_GET_CAMERAS:    'device:getCameras',
  UPDATE_CHECK:          'update:check',
  UPDATE_INSTALL:        'update:install',
  UPDATE_CHECKING:       'update:checking',
  UPDATE_AVAILABLE:      'update:available',
  UPDATE_NOT_AVAILABLE:  'update:notAvailable',
  UPDATE_PROGRESS:       'update:progress',
  UPDATE_DOWNLOADED:     'update:downloaded',
  UPDATE_ERROR:          'update:error',
  CTRL_SET_CAMERA:       'control:setCamera',
  CTRL_SET_MIC:          'control:setMic',
  CTRL_SET_SPEAKER:      'control:setSpeaker',
  CTRL_SET_VOLUME:       'control:setVolume',
  CTRL_SET_SITE_VOLUME:  'control:setSiteVolume',
  CTRL_GET_DEVICE_STATE: 'control:getDeviceState',
  CONFIG_GET:            'config:get',
  CONFIG_SET:            'config:set',
  CONFIG_ADD_SITE:       'config:addSite',
  CONFIG_REMOVE_SITE:    'config:removeSite',
  CONFIG_GET_MONITORS:   'config:getMonitors',
  AUTH_LOGIN:            'auth:login',
  AUTH_LOGOUT:           'auth:logout',
  AUTH_GET_ROLE:         'auth:getRole',
  AUTH_SET_PASSWORD:     'auth:setPassword',
  AUTH_IS_FIRST_RUN:     'auth:isFirstRun',
} as const;

const api = {
  // Auth
  isFirstRun: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.AUTH_IS_FIRST_RUN),
  login: (password: string): Promise<AuthResult> =>
    ipcRenderer.invoke(IPC.AUTH_LOGIN, password),
  logout: (): Promise<void> =>
    ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  getRole: (): Promise<UserRole | null> =>
    ipcRenderer.invoke(IPC.AUTH_GET_ROLE),
  setPassword: (role: UserRole, password: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AUTH_SET_PASSWORD, role, password),

  // Config
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_GET),
  setConfig: (partial: Partial<AppConfig>): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SET, partial),
  addSite: (site: Site): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_ADD_SITE, site),
  removeSite: (siteId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_REMOVE_SITE, siteId),
  getMonitors: (): Promise<MonitorInfo[]> =>
    ipcRenderer.invoke(IPC.CONFIG_GET_MONITORS),

  // Device control
  setCamera: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.CTRL_SET_CAMERA, enabled),
  setMic: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.CTRL_SET_MIC, enabled),
  setSpeaker: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.CTRL_SET_SPEAKER, enabled),
  setVolume: (vol: number): Promise<void> =>
    ipcRenderer.invoke(IPC.CTRL_SET_VOLUME, vol),
  setSiteVolume: (siteId: string, vol: number): Promise<void> =>
    ipcRenderer.invoke(IPC.CTRL_SET_SITE_VOLUME, siteId, vol),
  getDeviceState: (): Promise<DeviceState> =>
    ipcRenderer.invoke(IPC.CTRL_GET_DEVICE_STATE),

  // Stream events
  onVideoFrame: (siteId: string, callback: (frame: VideoFrame) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: VideoFrame) => {
      if (frame.siteId === siteId) callback(frame);
    };
    ipcRenderer.on(IPC.STREAM_VIDEO_FRAME, handler);
    return () => ipcRenderer.removeListener(IPC.STREAM_VIDEO_FRAME, handler);
  },

  onSourceList: (callback: (sources: NDISource[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sources: NDISource[]) => callback(sources);
    ipcRenderer.on(IPC.STREAM_SOURCE_LIST, handler);
    return () => ipcRenderer.removeListener(IPC.STREAM_SOURCE_LIST, handler);
  },

  onStreamStatus: (callback: (statuses: StreamState[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, statuses: StreamState[]) => callback(statuses);
    ipcRenderer.on(IPC.STREAM_STATUS_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC.STREAM_STATUS_UPDATE, handler);
  },

  // Stream control
  getSources: (): Promise<NDISource[]> =>
    ipcRenderer.invoke(IPC.STREAM_GET_SOURCES),
  connectSite: (siteId: string, sourceName?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.STREAM_CONNECT_SITE, siteId, sourceName),
  disconnectSite: (siteId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.STREAM_DISCONNECT_SITE, siteId),

  // カメラ映像フレーム送信（renderer → main → NDI）
  sendVideoFrame: (data: Uint8Array, width: number, height: number): void =>
    ipcRenderer.send(IPC.STREAM_PUSH_FRAME, data, width, height),

  // マイク音声送信（renderer → main → NDI）
  sendAudioChunk: (data: Float32Array, sampleRate: number, channels: number): void =>
    ipcRenderer.send(IPC.STREAM_PUSH_AUDIO, data, sampleRate, channels),

  // Sync
  syncNow: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('sync:now'),
  discoverHost: (port: number, subnet: string): Promise<string | null> =>
    ipcRenderer.invoke('sync:discoverHost', port, subnet),

  // Auto updater
  checkForUpdates: (): Promise<any> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateChecking:     (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on(IPC.UPDATE_CHECKING, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_CHECKING, h);
  },
  onUpdateAvailable:    (cb: (info: any) => void) => {
    const h = (_: any, info: any) => cb(info);
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, h);
  },
  onUpdateNotAvailable: (cb: (info: any) => void) => {
    const h = (_: any, info: any) => cb(info);
    ipcRenderer.on(IPC.UPDATE_NOT_AVAILABLE, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_NOT_AVAILABLE, h);
  },
  onUpdateProgress:     (cb: (progress: any) => void) => {
    const h = (_: any, prog: any) => cb(prog);
    ipcRenderer.on(IPC.UPDATE_PROGRESS, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, h);
  },
  onUpdateDownloaded:   (cb: (info: any) => void) => {
    const h = (_: any, info: any) => cb(info);
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, h);
  },
  onUpdateError:        (cb: (message: string) => void) => {
    const h = (_: any, msg: string) => cb(msg);
    ipcRenderer.on(IPC.UPDATE_ERROR, h);
    return () => ipcRenderer.removeListener(IPC.UPDATE_ERROR, h);
  },

  onConfigUpdate: (callback: (config: AppConfig) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig) => callback(config);
    ipcRenderer.on(IPC.CONFIG_GET, handler);
    return () => ipcRenderer.removeListener(IPC.CONFIG_GET, handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
