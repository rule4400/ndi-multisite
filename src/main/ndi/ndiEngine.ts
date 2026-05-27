import { BrowserWindow } from 'electron';
import * as os from 'os';
import log from 'electron-log';
import { requireGrandiose } from './requireNative';
import { NDISender } from './ndiSender';
import { NDIReceiver } from './ndiReceiver';
import { DiscoveryManager } from './discoveryManager';
import { pingManager } from '../network/pingManager';
import { AppConfig, NDISource, StreamState, Site } from '../../shared/types';
import { IPC } from '../../shared/ipcChannels';
import { getSenderName, ndiSourceMatchesSite } from './ndiNaming';

export class NDIEngine {
  private sender: NDISender = new NDISender();
  private receivers: Map<string, NDIReceiver> = new Map();
  private discovery: DiscoveryManager = new DiscoveryManager();
  private window: BrowserWindow | null = null;
  private config: AppConfig | null = null;
  private senderEnabled = true;
  private statusTimer: NodeJS.Timeout | null = null;

  /** NDI SDK（grandiose）が利用可能かチェックして結果を返す */
  static checkNdiAvailable(): { available: boolean; error?: string } {
    try {
      requireGrandiose();
      return { available: true };
    } catch (err: any) {
      log.warn('[NDI] SDK not available:', err.message);
      return { available: false, error: err.message };
    }
  }

  async initialize(config: AppConfig, window: BrowserWindow | null): Promise<void> {
    this.config = config;
    this.window = window;

    // NDI SDK 利用可能チェック → renderer に通知（遅延送信）
    const ndiCheck = NDIEngine.checkNdiAvailable();
    if (!ndiCheck.available) {
      log.warn('[NDI] NDI SDK not found. Users need to install NDI Runtime.');
    }
    setTimeout(() => this.send(IPC.NDI_SDK_STATUS, ndiCheck), 2000);

    if (!ndiCheck.available) {
      // SDK が無い場合はディスカバリ／送受信を起動しない
      log.warn('[NDI] SDK 未インストールのため、NDI 機能は無効化されます');
      return;
    }

    await this.discovery.start(config.discoveryServerIp || undefined);

    this.discovery.onSourceAdded((source) => {
      log.info(`[NDI] Source added: "${source.name}" (${source.urlAddress})`);
      this.send(IPC.STREAM_SOURCE_LIST, this.discovery.getSources());
      this.tryAutoConnect(source);
    });

    this.discovery.onSourceRemoved((source) => {
      log.info(`[NDI] Source removed: "${source.name}"`);
      this.send(IPC.STREAM_SOURCE_LIST, this.discovery.getSources());
    });

    // NDI 送信を開始（他拠点から自拠点が見えるようにする）
    this.startSender().catch(e => log.warn('[NDI] startSender failed:', e));

    // 起動時に全有効拠点へ直接接続（Discovery 待ちなし）
    setTimeout(() => this.connectAllEnabledSites(), 3000);

    // 2秒ごとにステータスをブロードキャスト
    this.statusTimer = setInterval(() => this.broadcastStatus(), 2000);

    // ネットワーク到達性チェック開始（自拠点は除外）
    pingManager.start(this.getPingableSites());
    pingManager.onStatusChange((statuses) => {
      this.send(IPC.STREAM_NETWORK_STATUS, statuses);
    });
  }

  /** 設定が更新されたときに呼び出す（同期 or 手動編集） */
  applyConfig(config: AppConfig): void {
    const prev = this.config;
    this.config = config;

    // selfSiteId を自動推定（未設定なら）
    if (!config.selfSiteId) {
      const guessed = this.guessSelfSiteId();
      if (guessed) {
        log.info(`[NDI] selfSiteId 自動判定: ${guessed}`);
        config.selfSiteId = guessed;
      }
    }

    // 送信側の名前が変わったら再起動
    const newSenderName = this.getEffectiveSenderName();
    const oldSenderName = prev ? this.getSenderNameFor(prev) : '';
    if (newSenderName !== oldSenderName) {
      log.info(`[NDI] 送信名変更: "${oldSenderName}" → "${newSenderName}" - 再起動`);
      this.sender.stop();
      this.startSender().catch(e => log.warn('[NDI] startSender failed:', e));
    }

    // 拠点リストが変わった場合: 不要な receiver を切断し、新規拠点に接続
    this.reconcileReceivers();

    // Ping 対象を更新
    pingManager.updateSites(this.getPingableSites());
  }

  /** 自拠点を除いた ping 対象サイト一覧 */
  private getPingableSites(): Site[] {
    if (!this.config) return [];
    return this.config.sites.filter(s => s.id !== this.config!.selfSiteId);
  }

  /** 受信器の状態を設定と同期させる */
  private reconcileReceivers(): void {
    if (!this.config) return;
    const enabledIds = new Set(
      this.config.sites
        .filter(s => s.enabled && s.id !== this.config!.selfSiteId)
        .map(s => s.id),
    );

    // 1) 不要な receiver を切断
    for (const [id, recv] of this.receivers.entries()) {
      if (!enabledIds.has(id)) {
        log.info(`[NDI] 拠点削除/無効化により切断: ${id}`);
        recv.disconnect();
        this.receivers.delete(id);
      }
    }
    // 2) 新規拠点へ接続
    this.connectAllEnabledSites().catch(e => log.warn('reconcileReceivers:', e));
  }

  /** 自機のローカル IP アドレス一覧（IPv4 のみ） */
  private getLocalIPs(): Set<string> {
    const ips = new Set<string>();
    const ifaces = os.networkInterfaces();
    for (const addrs of Object.values(ifaces)) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) ips.add(addr.address);
      }
    }
    return ips;
  }

  /**
   * 自拠点 ID を推定:
   * 1) sites の中で vpnIp がローカル IP と一致するものを優先
   * 2) hostname と一致する name を持つサイト
   */
  private guessSelfSiteId(): string | null {
    if (!this.config) return null;
    const localIPs = this.getLocalIPs();
    for (const s of this.config.sites) {
      if (s.vpnIp?.trim() && localIPs.has(s.vpnIp.trim())) return s.id;
    }
    const host = os.hostname().toLowerCase();
    const match = this.config.sites.find(s => host.includes(s.name.toLowerCase()));
    return match?.id ?? null;
  }

  /** site が自拠点と判定されるか */
  private isSelfSite(site: Site): boolean {
    if (!this.config) return false;
    // 1) selfSiteId 明示
    if (this.config.selfSiteId && site.id === this.config.selfSiteId) return true;
    // 2) IP マッチ（フォールバック）
    const localIPs = this.getLocalIPs();
    if (site.vpnIp?.trim() && localIPs.has(site.vpnIp.trim())) return true;
    return false;
  }

  /** 全有効拠点へ直接接続（自拠点・既接続を除く） */
  private async connectAllEnabledSites(): Promise<void> {
    if (!this.config) return;
    const localIPs = this.getLocalIPs();
    log.info(`[NDI] ローカルIP: ${[...localIPs].join(', ')} / selfSiteId: ${this.config.selfSiteId}`);

    for (const site of this.config.sites) {
      if (!site.enabled) continue;
      if (this.receivers.has(site.id)) continue;
      if (this.isSelfSite(site)) {
        log.info(`[NDI] 自拠点スキップ: ${site.name} (id=${site.id})`);
        continue;
      }

      const ip = site.vpnIp?.trim();
      const name = site.ndiSourceName?.trim();
      if (!ip && !name) {
        log.info(`[NDI] スキップ (IP/NDI名 未設定): ${site.name}`);
        continue;
      }
      if (ip === '0.0.0.0' || ip === '127.0.0.1') continue;
      if (ip && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) continue;

      log.info(`[NDI] 自動接続: ${site.name} (${ip ?? name})`);
      await this.connectToSite(site).catch(e =>
        log.warn(`Auto-connect failed for ${site.name}:`, e));
    }
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /** 現在の設定から実効的な送信名を取得 */
  private getEffectiveSenderName(): string {
    return this.config ? this.getSenderNameFor(this.config) : '';
  }
  private getSenderNameFor(config: AppConfig): string {
    // selfSiteId があれば対応サイトの名前 → なければ siteName
    const selfSite = config.selfSiteId
      ? config.sites.find(s => s.id === config.selfSiteId)
      : null;
    return getSenderName(selfSite?.name ?? config.siteName);
  }

  async startSender(): Promise<void> {
    if (!this.config || !this.senderEnabled) return;
    const name = this.getEffectiveSenderName();
    log.info(`[NDI] 送信開始: name="${name}"`);
    await this.sender.start(
      name,
      this.config.video.resolution,
      this.config.video.frameRate,
    );
  }

  stopSender(): void {
    this.sender.stop();
  }

  setSenderEnabled(enabled: boolean): void {
    this.senderEnabled = enabled;
    if (!enabled) this.sender.stop();
  }

  setCameraEnabled(enabled: boolean): void { this.sender.setVideoEnabled(enabled); }
  setMicEnabled(enabled: boolean):    void { this.sender.setAudioEnabled(enabled); }

  /** 発見された NDI ソースを設定済みサイトに自動マッチ */
  private tryAutoConnect(source: NDISource): void {
    if (!this.config) return;
    const matchedSite = this.config.sites.find(s => {
      if (!s.enabled) return false;
      if (this.receivers.has(s.id)) return false;
      if (this.isSelfSite(s)) return false;

      // 1) 拠点名/NDI 名で NDI フルネームに部分一致
      if (ndiSourceMatchesSite(source.name, s)) return true;

      // 2) IP マッチ
      if (s.vpnIp?.trim() && source.urlAddress?.includes(s.vpnIp.trim())) return true;

      return false;
    });
    if (matchedSite) {
      log.info(`[NDI] AutoConnect マッチ: source="${source.name}" → site="${matchedSite.name}"`);
      this.connectToSite(matchedSite, source).catch(e =>
        log.warn(`AutoConnect failed: ${matchedSite.name}:`, e));
    }
  }

  /** UI からの明示的なソース選択 */
  async switchSiteSource(siteId: string, sourceName: string): Promise<void> {
    if (!this.config) return;
    const site = this.config.sites.find(s => s.id === siteId);
    if (!site) return;
    const source = this.discovery.getSources().find(s => s.name === sourceName);
    await this.connectToSite(
      site,
      source ?? { name: sourceName, urlAddress: site.vpnIp ? `${site.vpnIp}:5960` : '' },
    );
  }

  async connectToSite(site: Site, source?: NDISource): Promise<void> {
    if (this.isSelfSite(site)) {
      log.info(`[NDI] connectToSite skipped (self): ${site.name}`);
      return;
    }
    if (this.receivers.has(site.id)) {
      this.receivers.get(site.id)?.disconnect();
    }

    // ソース解決の優先順位:
    //   1) 引数指定 source
    //   2) Discovery で見つかった同一サイトのソース
    //   3) IP 直接接続（urlAddress のみ）
    let ndiSource: NDISource;
    if (source) {
      ndiSource = source;
    } else {
      const discovered = this.discovery.getSources().find(s => {
        if (ndiSourceMatchesSite(s.name, site)) return true;
        if (site.vpnIp?.trim() && s.urlAddress?.includes(site.vpnIp.trim())) return true;
        return false;
      });

      if (discovered) {
        ndiSource = discovered;
      } else if (site.vpnIp?.trim()) {
        // 直接 IP 接続。name はダミーで OK（NDI SDK は urlAddress を優先）
        ndiSource = {
          name: site.ndiSourceName?.trim() || site.name,
          urlAddress: `${site.vpnIp.trim()}:5960`,
        };
      } else {
        log.warn(`[NDI] connectToSite: ${site.name} は IP も NDI名も未設定`);
        return;
      }
    }

    const receiver = new NDIReceiver();
    this.receivers.set(site.id, receiver);

    // 受信帯域モード（NDI HX = 'lowest'）
    const bw = this.config?.video.receiveBandwidth ?? 'lowest';

    await receiver.connect(
      ndiSource,
      site.id,
      (data, w, h)            => this.sendVideoFrame(site.id, data, w, h),
      (samples, sr, channels) => this.sendAudioFrame(site.id, samples, sr, channels),
      bw,
    );

    this.broadcastStatus();
  }

  /** renderer から受け取ったカメラフレームを NDI Sender に転送 */
  pushVideoFrame(data: Uint8Array, width: number, height: number): void {
    this.sender.pushVideoFrame(data, width, height);
  }
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

  // ── IPC 送信ヘルパー ───────────────────────────────────────

  /** 安全な IPC 送信（破棄チェック・try/catch） */
  private send(channel: string, ...args: any[]): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.webContents.send(channel, ...args);
    } catch (e) {
      log.warn(`[IPC] send ${channel} failed:`, e);
    }
  }

  /**
   * 映像フレーム送信。
   * Worker から ArrayBuffer (transferred) で渡されたデータを
   * Uint8Array view にして webContents.send で renderer に送る。
   *
   * - data は既に独立した ArrayBuffer のため再コピー不要
   * - 連続エラーでログが埋まらないよう、レート制限付きで warn ログ
   */
  private lastVideoIpcError = 0;
  private sendVideoFrame(siteId: string, data: Uint8Array, w: number, h: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (!data || data.byteLength === 0) return;
    try {
      this.window.webContents.send(IPC.STREAM_VIDEO_FRAME, {
        siteId, width: w, height: h, data, timestamp: Date.now(),
      });
    } catch (e: any) {
      const now = Date.now();
      if (now - this.lastVideoIpcError > 3000) {
        log.warn(`[IPC] video frame send failed:`, e?.message);
        this.lastVideoIpcError = now;
      }
    }
  }

  /**
   * 音声フレーム送信。
   * NDI のデフォルトフォーマット (Float32 Separate) の Float32Array をそのまま渡す。
   */
  private sendAudioFrame(siteId: string, samples: Float32Array, sampleRate: number, channels: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (!samples || samples.length === 0) return;
    try {
      this.window.webContents.send(IPC.STREAM_AUDIO_FRAME, {
        siteId,
        data: samples,
        sampleRate,
        channels,
      });
    } catch {
      // silent
    }
  }

  private broadcastStatus(): void {
    this.send(IPC.STREAM_STATUS_UPDATE, this.getStreamStatuses());
  }

  async shutdown(): Promise<void> {
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null; }
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
