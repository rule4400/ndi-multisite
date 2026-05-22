import type { ElectronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

if (!window.electronAPI) {
  console.error(
    '[bridge] window.electronAPI が見つかりません。' +
    'Electron の contextBridge / preload が正しく設定されているか確認してください。'
  );
}

export const api: ElectronAPI = window.electronAPI;
