export type UserRole = 'full' | 'viewonly';

export interface Site {
  id: string;
  name: string;
  ndiSourceName: string;
  vpnIp: string;
  enabled: boolean;
  hidden?: boolean;  // グリッドから非表示（NDI接続は維持）
}

export interface VideoFrame {
  siteId: string;
  width: number;
  height: number;
  data: Uint8Array;
  timestamp: number;
}

export interface AudioChunk {
  siteId: string;
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

export interface NDISource {
  name: string;
  urlAddress: string;
}

export interface AppConfig {
  siteName: string;
  ndiSourceName: string;
  discoveryServerIp: string;
  sites: Site[];
  sync: {
    mode: 'host' | 'client' | 'none'; // ホスト/クライアント/同期なし
    hostIp: string;                    // クライアント側: ホストのIPアドレス
    port: number;                      // HTTPサーバーポート（デフォルト: 34567）
    intervalSec: number;               // ポーリング間隔（秒）
  };
  video: {
    resolution: '1280x720' | '1920x1080';
    frameRate: 30 | 60;
  };
  ui: {
    gridLayout: 'auto' | '2x2' | '3x3' | '4x4';
    startFullscreen: boolean;
    targetMonitorIndex: number;
    showSiteLabels: boolean;
    focusOnClick: boolean;
  };
}

export interface AuthResult {
  success: boolean;
  role: UserRole | null;
  error?: string;
}

export interface DeviceState {
  cameraEnabled: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  masterVolume: number;
  siteVolumes: Record<string, number>;
}

export interface StreamState {
  siteId: string;
  connected: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  fps: number;
}

export interface MonitorInfo {
  index: number;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
}
