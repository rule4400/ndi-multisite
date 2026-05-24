import { create } from 'zustand';
import { SiteNetworkStatus } from '../../shared/types';
import { api } from '../bridge/api';

interface NetworkStore {
  statuses: Map<string, SiteNetworkStatus>;
  init: () => () => void;
  getStatus: (siteId: string) => SiteNetworkStatus | undefined;
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  statuses: new Map(),

  init: () => {
    const unsub = (api as any).onNetworkStatus?.((list: SiteNetworkStatus[]) => {
      const map = new Map<string, SiteNetworkStatus>();
      list.forEach(s => map.set(s.siteId, s));
      set({ statuses: map });
    });
    return unsub ?? (() => {});
  },

  getStatus: (siteId) => get().statuses.get(siteId),
}));
