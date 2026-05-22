import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { NDISender } from './ndiSender';
import { NDIReceiver } from './ndiReceiver';
import { DiscoveryManager } from './discoveryManager';
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

  private tryAutoConnect(source: NDISource): void {
    if (!this.config) return;
    const matchedSite = this.config.sites.find(
      s => s.enabled && s.ndiSourceName === source.name
    );
    if (matchedSite) {
      this.connectToSite(matchedSite, source);
    }
  }

  async connectToSite(site: Site, source?: NDISource): Promise<void> {
    if (this.receivers.has(site.id)) {
      this.receivers.get(site.id)?.disconnect();
    }

    const ndiSource: NDISource = source ?? {
      name: site.ndiSourceName,
      urlAddress: `${site.vpnIp}:5960`,
    };

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
      (_samples, _sampleRate, _channels) => {
        // Audio handled by AudioEngine
      },
    );

    this.broadcastStatus();
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
    log.info('NDI Engine shutdown complete');
  }
}
