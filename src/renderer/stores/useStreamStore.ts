import { create } from 'zustand';
import { StreamState, NDISource } from '../../shared/types';
import { api } from '../bridge/api';

interface StreamStore {
  statuses: StreamState[];
  sources: NDISource[];
  init: () => void;
}

export const useStreamStore = create<StreamStore>((set) => ({
  statuses: [],
  sources: [],

  init: () => {
    api.onStreamStatus((statuses) => {
      set({ statuses });
    });
    api.onSourceList((sources) => {
      set({ sources });
    });
  },
}));
