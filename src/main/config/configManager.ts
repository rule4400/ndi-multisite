import Store from 'electron-store';
import { AppConfig } from '../../shared/types';

const DEFAULT_CONFIG: AppConfig = {
  siteName: '本部',
  ndiSourceName: 'NDI-Multisite-Local',
  discoveryServerIp: '',
  selfSiteId: null,
  sites: [],
  sync: {
    mode: 'none',
    hostIp: '',
    port: 34567,
    intervalSec: 30,
  },
  video: {
    resolution: '1280x720',
    frameRate: 30,
    receiveBandwidth: 'lowest',  // 既定で NDI HX (プロキシ) モード
  },
  ui: {
    gridLayout: 'auto',
    startFullscreen: false,
    targetMonitorIndex: 0,
    showSiteLabels: true,
    focusOnClick: true,
  },
};

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'config',
      defaults: DEFAULT_CONFIG,
    });
  }

  get(): AppConfig {
    return this.store.store as AppConfig;
  }

  set(config: Partial<AppConfig>): void {
    Object.entries(config).forEach(([key, value]) => {
      this.store.set(key as keyof AppConfig, value as any);
    });
  }

  addSite(site: import('../../shared/types').Site): void {
    const sites = this.store.get('sites') as import('../../shared/types').Site[];
    // 重複チェック: 同じ ID は上書き、同じ IP/名前のサイトがあれば追加せず更新
    const sameId = sites.findIndex(s => s.id === site.id);
    if (sameId !== -1) {
      sites[sameId] = site;
    } else {
      sites.push(site);
    }
    this.store.set('sites', sites);
  }

  removeSite(siteId: string): void {
    const sites = (this.store.get('sites') as import('../../shared/types').Site[])
      .filter(s => s.id !== siteId);
    this.store.set('sites', sites);
    // 削除したサイトが selfSiteId だった場合はクリア
    const selfId = this.store.get('selfSiteId') as string | null;
    if (selfId === siteId) this.store.set('selfSiteId', null);
  }
}
