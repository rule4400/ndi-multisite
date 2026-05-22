import log from 'electron-log';
import { NDISource } from '../../shared/types';

type SourceCallback = (source: NDISource) => void;

export class DiscoveryManager {
  private finder: any = null;
  private sources: NDISource[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private addedCallbacks: SourceCallback[] = [];
  private removedCallbacks: SourceCallback[] = [];

  async start(discoveryServerIp?: string): Promise<void> {
    try {
      const grandiose = require('@stagetimerio/grandiose');
      const opts: any = { showLocalSources: true };
      if (discoveryServerIp) opts.extraIps = discoveryServerIp;

      this.finder = await grandiose.find(opts);
      log.info('NDI Discovery started');
      this.pollInterval = setInterval(() => this.poll(), 2000);
    } catch (err) {
      log.warn('NDI Discovery unavailable (NDI SDK not installed?):', err);
    }
  }

  private async poll(): Promise<void> {
    if (!this.finder) return;
    try {
      const found: NDISource[] = await this.finder.sources();
      const prevNames = new Set(this.sources.map((s: NDISource) => s.name));
      const currNames = new Set(found.map((s: NDISource) => s.name));

      for (const s of found) {
        if (!prevNames.has(s.name)) this.addedCallbacks.forEach(cb => cb(s));
      }
      for (const s of this.sources) {
        if (!currNames.has(s.name)) this.removedCallbacks.forEach(cb => cb(s));
      }
      this.sources = found;
    } catch (err) {
      log.error('NDI discovery poll error:', err);
    }
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.finder) { try { this.finder.destroy?.(); } catch (_) {} this.finder = null; }
    log.info('NDI Discovery stopped');
  }

  getSources(): NDISource[] { return [...this.sources]; }
  onSourceAdded(cb: SourceCallback): void { this.addedCallbacks.push(cb); }
  onSourceRemoved(cb: SourceCallback): void { this.removedCallbacks.push(cb); }
}
