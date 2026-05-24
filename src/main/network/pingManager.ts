/**
 * pingManager.ts
 *
 * 各拠点の VPN IP に TCP 接続を試みてネットワーク到達性を定期チェックする。
 * NDI は TCP ポート 5960 を使うため、同ポートへの接続可否で判断する。
 */

import * as net from 'net';
import log from 'electron-log';
import { Site } from '../../shared/types';

export interface SiteNetworkStatus {
  siteId:    string;
  reachable: boolean;
  latencyMs: number | null;
  checkedAt: number;
}

type StatusCallback = (statuses: SiteNetworkStatus[]) => void;

const NDI_TCP_PORT = 5960;
const INTERVAL_MS  = 5000;  // 5秒ごとに確認
const TIMEOUT_MS   = 2000;  // 2秒でタイムアウト

export class PingManager {
  private sites: Site[] = [];
  private statuses: Map<string, SiteNetworkStatus> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callbacks: StatusCallback[] = [];

  start(sites: Site[]): void {
    this.sites = sites;
    this.stop();
    this.runChecks(); // 即時1回
    this.timer = setInterval(() => this.runChecks(), INTERVAL_MS);
  }

  updateSites(sites: Site[]): void {
    this.sites = sites;
    this.runChecks();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onStatusChange(cb: StatusCallback): void {
    this.callbacks.push(cb);
  }

  getStatuses(): SiteNetworkStatus[] {
    return Array.from(this.statuses.values());
  }

  private async runChecks(): Promise<void> {
    const targets = this.sites.filter(s => s.enabled && s.vpnIp?.trim());
    if (targets.length === 0) return;

    const results = await Promise.all(targets.map(s => this.checkSite(s)));
    results.forEach(r => this.statuses.set(r.siteId, r));

    this.callbacks.forEach(cb => cb(this.getStatuses()));
  }

  private checkSite(site: Site): Promise<SiteNetworkStatus> {
    return new Promise(resolve => {
      const start = Date.now();
      const socket = new net.Socket();
      let settled = false;

      const done = (reachable: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({
          siteId:    site.id,
          reachable,
          latencyMs: reachable ? Date.now() - start : null,
          checkedAt: Date.now(),
        });
      };

      socket.setTimeout(TIMEOUT_MS);
      socket.on('connect', () => done(true));
      socket.on('error',   () => done(false));
      socket.on('timeout', () => done(false));

      try {
        socket.connect(NDI_TCP_PORT, site.vpnIp!.trim());
      } catch {
        done(false);
      }
    });
  }
}

export const pingManager = new PingManager();
