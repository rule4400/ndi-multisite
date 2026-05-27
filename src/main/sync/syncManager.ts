import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { ConfigManager } from '../config/configManager';
import { Site } from '../../shared/types';
import { IPC } from '../../shared/ipcChannels';

export class SyncManager {
  private server: http.Server | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private configManager: ConfigManager;
  private window: BrowserWindow | null = null;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  setWindow(win: BrowserWindow): void {
    this.window = win;
  }

  /** 現在のモードに応じてホスト/クライアントを起動 */
  async start(): Promise<void> {
    const { sync } = this.configManager.get();
    await this.stop();

    if (sync.mode === 'host') {
      await this.startHost(sync.port);
    } else if (sync.mode === 'client' && sync.hostIp) {
      this.startClient(sync.hostIp, sync.port, sync.intervalSec);
    }
  }

  /** ホストモード: HTTP サーバーで拠点設定を配信 */
  private async startHost(port: number): Promise<void> {
    this.server = http.createServer((req, res) => {
      if (req.url === '/api/sites' && req.method === 'GET') {
        const config = this.configManager.get();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
          sites: config.sites,
          siteName: config.siteName,
          updatedAt: Date.now(),
        }));
      } else if (req.url === '/api/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, '0.0.0.0', () => {
        log.info(`[Sync] ホストサーバー起動: ポート ${port}`);
        resolve();
      });
      this.server!.on('error', (err) => {
        log.error('[Sync] ホストサーバーエラー:', err);
        reject(err);
      });
    });
  }

  /** クライアントモード: ホストを定期ポーリングして設定を同期 */
  private startClient(hostIp: string, port: number, intervalSec: number): void {
    log.info(`[Sync] クライアントモード開始: ${hostIp}:${port} (${intervalSec}秒毎)`);

    const poll = async () => {
      try {
        const data = await this.fetchFromHost(hostIp, port);
        if (data) {
          this.applySites(data.sites);
        }
      } catch (err) {
        log.warn('[Sync] ポーリング失敗:', err);
      }
    };

    // 初回即時実行
    poll();
    this.pollTimer = setInterval(poll, intervalSec * 1000);
  }

  /** ホストから設定を取得 */
  private fetchFromHost(hostIp: string, port: number): Promise<{ sites: Site[]; siteName: string } | null> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${hostIp}:${port}/api/sites`, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  /** 自機のローカル IPv4 一覧 */
  private getLocalIPs(): Set<string> {
    const ips = new Set<string>();
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) ips.add(addr.address);
      }
    }
    return ips;
  }

  /**
   * 自拠点 ID を推定:
   * 1) 既に selfSiteId が設定済みで、その ID が remoteSites に存在 → そのまま使う
   * 2) remoteSites の中で vpnIp がローカル IP と一致するもの
   * 3) hostname が拠点名に含まれるもの
   */
  private resolveSelfSiteId(remoteSites: Site[], currentSelfId: string | null): string | null {
    // 1) 既存 selfSiteId が remote にもあるなら維持
    if (currentSelfId && remoteSites.some(s => s.id === currentSelfId)) {
      return currentSelfId;
    }
    // 2) IP マッチ
    const localIPs = this.getLocalIPs();
    const ipMatch = remoteSites.find(s => s.vpnIp?.trim() && localIPs.has(s.vpnIp.trim()));
    if (ipMatch) {
      log.info(`[Sync] selfSiteId 自動判定 (IP): "${ipMatch.name}" (${ipMatch.vpnIp})`);
      return ipMatch.id;
    }
    // 3) hostname マッチ
    const host = os.hostname().toLowerCase();
    const nameMatch = remoteSites.find(s => host.includes((s.name ?? '').toLowerCase()) && s.name);
    if (nameMatch) {
      log.info(`[Sync] selfSiteId 自動判定 (hostname): "${nameMatch.name}"`);
      return nameMatch.id;
    }
    return null;
  }

  /** 受信した拠点設定をローカルに適用（差分がある場合のみ） */
  private applySites(remoteSites: Site[]): void {
    const config = this.configManager.get();
    // ID と enabled/name/ip/ndi のハッシュ比較で差分検出
    const sig = (s: Site[]) => JSON.stringify(
      s.map(x => `${x.id}|${x.name}|${x.vpnIp}|${x.ndiSourceName}|${x.enabled}`).sort()
    );
    const newSelfId = this.resolveSelfSiteId(remoteSites, config.selfSiteId);

    const same = sig(config.sites) === sig(remoteSites) && config.selfSiteId === newSelfId;
    if (same) return;

    log.info(`[Sync] 拠点設定を更新: ${remoteSites.length}拠点 / selfSiteId=${newSelfId}`);
    this.configManager.set({ sites: remoteSites, selfSiteId: newSelfId });

    // NDI エンジンに反映
    try {
      const { ndiEngine } = require('../index');
      ndiEngine?.applyConfig?.(this.configManager.get());
    } catch (e) {
      log.warn('[Sync] applyConfig 呼び出し失敗:', e);
    }

    // Renderer にも通知
    if (this.window && !this.window.isDestroyed()) {
      try {
        this.window.webContents.send(IPC.CONFIG_GET, this.configManager.get());
      } catch {}
    }
  }

  /** 手動で今すぐ同期 */
  async syncNow(): Promise<{ success: boolean; message: string }> {
    const { sync } = this.configManager.get();
    if (sync.mode !== 'client' || !sync.hostIp) {
      return { success: false, message: 'クライアントモードで設定されていません' };
    }
    try {
      const data = await this.fetchFromHost(sync.hostIp, sync.port);
      if (data) {
        this.applySites(data.sites);
        return { success: true, message: `${data.sites.length}拠点を同期しました` };
      }
      return { success: false, message: 'データ取得失敗' };
    } catch (err) {
      return { success: false, message: `接続エラー: ${err}` };
    }
  }

  /** ホストIPを自動検出（同一ネットワーク内でポートスキャン） */
  async discoverHost(port: number, subnet: string): Promise<string | null> {
    const base = subnet.split('.').slice(0, 3).join('.');
    const checks = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);

    const check = (ip: string): Promise<string | null> =>
      new Promise(resolve => {
        const sock = new net.Socket();
        sock.setTimeout(300);
        sock.on('connect', () => { sock.destroy(); resolve(ip); });
        sock.on('error', () => resolve(null));
        sock.on('timeout', () => { sock.destroy(); resolve(null); });
        sock.connect(port, ip);
      });

    const results = await Promise.all(checks.map(check));
    return results.find(r => r !== null) ?? null;
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()));
      this.server = null;
      log.info('[Sync] ホストサーバー停止');
    }
  }
}
