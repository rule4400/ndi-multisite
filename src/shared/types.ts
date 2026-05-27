export type UserRole = 'full' | 'viewonly';

export interface Site {
  id: string;
  name: string;
  /**
   * NDIソース名（任意指定）。
   * - 空欄の場合: 拠点名と IP から自動的に検出・接続
   * - 上級者向け: 既存の NDI ソースに明示的に接続したい場合のみ手動指定
   */
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
  /**
   * 自拠点として識別するサイトの ID。
   * sites 配列の中でこの PC を表すエントリの ID を指す。
   * - null: 未確定（IP マッチで自動判定するか、ユーザーに選択を促す）
   * - 値あり: 該当サイトを自拠点として扱い、NDI 接続をスキップ。
   *           送信側 NDI 名称や siteName もこのサイトから取得する。
   */
  selfSiteId: string | null;
  sites: Site[];
  sync: {
    mode: 'host' | 'client' | 'none'; // ホスト/クライアント/同期なし
    hostIp: string;                    // クライアント側: ホストのIPアドレス
    port: number;                      // HTTPサーバーポート（デフォルト: 34567）
    intervalSec: number;               // ポーリング間隔（秒）
  };
  video: {
    resolution: '640x360' | '854x480' | '1280x720' | '1920x1080';
    frameRate: 15 | 24 | 30 | 60;
    /**
     * 受信時の NDI 帯域モード
     * - 'lowest':  プロキシ低帯域モード（NDI HX 相当・推奨）
     * - 'highest': フル品質（高帯域）
     */
    receiveBandwidth: 'lowest' | 'highest';
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
  siteId:    string;
  connected: boolean;
  hasVideo:  boolean;
  hasAudio:  boolean;
  fps:       number;
  error?:    string;  // NDI SDKエラーメッセージ
}

/** PingManager が報告するネットワーク到達性 */
export interface SiteNetworkStatus {
  siteId:    string;
  reachable: boolean;
  latencyMs: number | null;
  checkedAt: number;
}

export interface MonitorInfo {
  index: number;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
}
