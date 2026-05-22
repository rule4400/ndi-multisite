export type UserRole = 'full' | 'viewonly';

export interface Site {
  id: string;
  name: string;
  ndiSourceName: string;
  vpnIp: string;
  enabled: boolean;
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
