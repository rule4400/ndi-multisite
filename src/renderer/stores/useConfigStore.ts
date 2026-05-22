import { create } from 'zustand';
import { AppConfig, Site } from '../../shared/types';
import { api } from '../bridge/api';

interface ConfigStore {
  config: AppConfig | null;
  init: () => Promise<void>;
  setConfig: (partial: Partial<AppConfig>) => Promise<void>;
  addSite: (site: Site) => Promise<void>;
  removeSite: (siteId: string) => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,

  init: async () => {
    const config = await api.getConfig();
    set({ config });
    api.onConfigUpdate((updated) => {
      set({ config: updated });
    });
  },

  setConfig: async (partial) => {
    await api.setConfig(partial);
    const config = await api.getConfig();
    set({ config });
  },

  addSite: async (site) => {
    await api.addSite(site);
    const config = await api.getConfig();
    set({ config });
  },

  removeSite: async (siteId) => {
    await api.removeSite(siteId);
    const config = await api.getConfig();
    set({ config });
  },
}));
