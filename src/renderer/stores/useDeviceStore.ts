import { create } from 'zustand';
import { api } from '../bridge/api';

interface DeviceStore {
  cameraEnabled: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  masterVolume: number;
  siteVolumes: Record<string, number>;
  toggleCamera: () => void;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  setMasterVolume: (vol: number) => void;
  setSiteVolume: (siteId: string, vol: number) => void;
  muteAll: () => void;
  init: () => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  cameraEnabled: true,
  micEnabled: true,
  speakerEnabled: true,
  masterVolume: 1.0,
  siteVolumes: {},

  init: async () => {
    const state = await api.getDeviceState();
    set(state);
  },

  toggleCamera: () => {
    const next = !get().cameraEnabled;
    set({ cameraEnabled: next });
    api.setCamera(next);
  },

  toggleMic: () => {
    const next = !get().micEnabled;
    set({ micEnabled: next });
    api.setMic(next);
  },

  toggleSpeaker: () => {
    const next = !get().speakerEnabled;
    set({ speakerEnabled: next });
    api.setSpeaker(next);
  },

  setMasterVolume: (vol: number) => {
    set({ masterVolume: vol });
    api.setVolume(vol);
  },

  setSiteVolume: (siteId: string, vol: number) => {
    set(s => ({ siteVolumes: { ...s.siteVolumes, [siteId]: vol } }));
    api.setSiteVolume(siteId, vol);
  },

  muteAll: () => {
    const { speakerEnabled } = get();
    if (speakerEnabled) {
      set({ speakerEnabled: false });
      api.setSpeaker(false);
    }
    set({ micEnabled: false, cameraEnabled: false });
    api.setMic(false);
    api.setCamera(false);
  },
}));
