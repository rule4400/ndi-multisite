import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { NDISender } from './ndiSender';
import { NDIReceiver } from './ndiReceiver';
import { DiscoveryManager } from './discoveryManager';
import { pingManager } from '../network/pingManager';
import { AppConfig, NDISource, StreamState, Site } from '../../shared/types';
import { IPC } from '../../shared/ipcChannels';

export class NDIEngine {
  private sender: NDISender = new NDISender();
  private receivers: Map<string, NDIReceiver> = new Map();
  private discovery: DiscoveryManager = new DiscoveryManager();
  private window: BrowserWindow | null = null;
  private config: AppConfig | null = null;
  private senderEnabled = true;

  async initialize(config: AppConfig, window: BrowserWindow | null): Promise<void> {
    this.config = config;
    this.window = window;

    await this.discovery.start(config.discoveryServerIp || undefined);

    this.discovery.onSourceAdded((source) => {
      log.info('NDI Source added:', source.name);
      this.window?.webContents.send(IPC.STREAM_SOURCE_LIST, this.discovery.getSources());
      this.tryAutoConnect(source);
    });

    this.discovery.onSourceRemoved((source) => {
      log.info('NDI Source removed:', source.name);
      this.window?.webContents.send(IPC.STREAM_SOURCE_LIST, this.discovery.getSources());
    });

    // VPN環境ではDiscoveryブロードキャストが届かないため、起動時に全有効拠点へ直接接続を試みる
    setTimeout(() => this.connectAllEnabledSites(), 3000);

    // ネットワーク到達性チェック開始
    pingManager.start(config.sites);
    pingManager.onStatusChange((statuses) => {
      this.window?.webContents.send(IPC.STREAM_NETWORK_STATUS, statuses);
    });
  }

  /** 全有効拠点にVPN IPで直接接続（Discovery待ちなし） */
  private async connectAllEnabledSites(): Promise<void> {
    if (!this.config) return;
    for (const site of this.config.sites) {
      if (!site.enabled) continue;
      if (this.receivers.has(site.id)) continue; // 既に接続済み
      if (!site.vpnIp?.trim() && !site.ndiSourceName?.trim()) continue;
      log.info(`Auto-connecting to site ${site.name} on startup`);
      await this.connectToSite(site).catch(e => log.warn(`Auto-connect failed for ${site.name}:`, e));
    }
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  async startSender(): Promise<void> {
    if (!this.config || !this.senderEnabled) return;
    await this.sender.start(
      this.config.ndiSourceName,
      this.config.video.resolution,
      this.config.video.frameRate,
    );
  }

  stopSender(): void {
    this.sender.stop();
  }

  setSenderEnabled(enabled: boolean): void {
    this.senderEnabled = enabled;
    if (!enabled) {
      this.sender.stop();
    }
  }

  setCameraEnabled(enabled: boolean): void {
    this.sender.setVideoEnabled(enabled);
  }

  setMicEnabled(enabled: boolean): void {
    this.sender.setAudioEnabled(enabled);
  }

  /** NDIソース名、またはVPN IPアドレスでサイトを自動マッチ */
  private tryAutoConnect(source: NDISource): void {
    if (!this.config) return;
    const matchedSite = this.config.sites.find(s => {
      if (!s.enabled) return false;
      // 既に接続済みのサイトはスキップ
      if (this.receivers.has(s.id)) return false;
      // 1) NDIソース名が明示指定されている場合は名前でマッチ
      if (s.ndiSourceName && s.ndiSourceName.trim()) {
        return s.ndiSourceName === source.name;
      }
      // 2) NDIソース名が未指定の場合はVPN IPアドレスでマッチ
      if (s.vpnIp && s.vpnIp.trim()) {
        return source.urlAddress?.includes(s.vpnIp) ?? false;
      }
      return false;
    });
    if (matchedSite) {
      this.connectToSite(matchedSite, source);
    }
  }

  /** 指定サイトに特定のNDIソース名で接続（UI からの切替に使用） */
  async switchSiteSource(siteId: string, sourceName: string): Promise<void> {
    if (!this.config) return;
    const site = this.config.sites.find(s => s.id === siteId);
    if (!site) return;
    const source = this.discovery.getSources().find(s => s.name === sourceName);
    await this.connectToSite(site, source ?? { name: sourceName, urlAddress: `${site.vpnIp}:5960` });
  }

  async connectToSite(site: Site, source?: NDISource): Promise<void> {
    if (this.receivers.has(site.id)) {
      this.receivers.get(site.id)?.disconnect();
    }

    // sourceが未指定 → NDIソース名またはIPで探す
    let ndiSource: NDISource;
    if (source) {
      ndiSource = source;
    } else if (site.ndiSourceName?.trim()) {
      const found = this.discovery.getSources().find(s => s.name === site.ndiSourceName);
      ndiSource = found ?? { name: site.ndiSourceName, urlAddress: `${site.vpnIp}:5960` };
    } else if (site.vpnIp?.trim()) {
      const found = this.discovery.getSources().find(s => s.urlAddress?.includes(site.vpnIp));
      ndiSource = found ?? { name: `${site.name}-NDI`, urlAddress: `${site.vpnIp}:5960` };
    } else {
      log.warn(`connectToSite: site ${site.name} has no NDI source name or VPN IP`);
      return;
    }

    const receiver = new NDIReceiver();
    this.receivers.set(site.id, receiver);

    await receiver.connect(
      ndiSource,
      site.id,
      (frameData, w, h) => {
        if (!this.window) return;
        this.window.webContents.send(IPC.STREAM_VIDEO_FRAME, {
          siteId: site.id,
          width: w,
          height: h,
          data: frameData,
          timestamp: Date.now(),
        });
      },
      (samples, sampleRate, channels) => {
        if (!this.window) return;
        this.window.webContents.send(IPC.STREAM_AUDIO_FRAME, {
          siteId: site.id,
          data: Array.from(samples), // Float32Array → plain array for IPC serialization
          sampleRate,
          channels,
        });
      },
    );

    this.broadcastStatus();
  }

  /** renderer から受け取ったカメラフレームを NDI Sender に転送 */
  pushVideoFrame(data: Uint8Array, width: number, height: number): void {
    this.sender.pushVideoFrame(data, width, height);
  }

  /** renderer から受け取ったマイク音声を NDI Sender に転送 */
  pushAudioChunk(data: Float32Array, sampleRate: number, channels: number): void {
    this.sender.pushAudioChunk(data, sampleRate, channels);
  }

  disconnectSite(siteId: string): void {
    this.receivers.get(siteId)?.disconnect();
    this.receivers.delete(siteId);
    this.broadcastStatus();
  }

  getStreamStatuses(): StreamState[] {
    return Array.from(this.receivers.values()).map(r => r.getStatus());
  }

  getSources(): NDISource[] {
    return this.discovery.getSources();
  }

  private broadcastStatus(): void {
    if (!this.window) return;
    this.window.webContents.send(IPC.STREAM_STATUS_UPDATE, this.getStreamStatuses());
  }

  async shutdown(): Promise<void> {
    this.sender.stop();
    for (const receiver of this.receivers.values()) {
      receiver.disconnect();
    }
    this.receivers.clear();
    this.discovery.stop();
    pingManager.stop();
    log.info('NDI Engine shutdown complete');
  }
}
