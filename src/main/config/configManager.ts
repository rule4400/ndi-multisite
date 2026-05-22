import Store from 'electron-store';
import { AppConfig } from '../../shared/types';

const DEFAULT_CONFIG: AppConfig = {
  siteName: '本部',
  ndiSourceName: 'NDI-Multisite-Local',
  discoveryServerIp: '',
  sites: [],
  video: {
    resolution: '1280x720',
    frameRate: 30,
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
    sites.push(site);
    this.store.set('sites', sites);
  }

  removeSite(siteId: string): void {
    const sites = (this.store.get('sites') as import('../../shared/types').Site[])
      .filter(s => s.id !== siteId);
    this.store.set('sites', sites);
  }
}
