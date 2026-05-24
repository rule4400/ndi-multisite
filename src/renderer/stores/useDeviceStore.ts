import { create } from 'zustand';
import { api } from '../bridge/api';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface MicDevice {
  deviceId: string;
  label: string;
}

interface DeviceStore {
  cameraEnabled: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  masterVolume: number;
  siteVolumes: Record<string, number>;

  // カメラ・マイクデバイス一覧と選択中デバイス
  cameraDevices: CameraDevice[];
  micDevices: MicDevice[];
  selectedCameraId: string;   // '' = デフォルト
  selectedMicId: string;      // '' = デフォルト

  toggleCamera: () => void;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  setMasterVolume: (vol: number) => void;
  setSiteVolume: (siteId: string, vol: number) => void;
  muteAll: () => void;
  setSelectedCamera: (deviceId: string) => void;
  setSelectedMic: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  init: () => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  cameraEnabled: true,
  micEnabled: true,
  speakerEnabled: true,
  masterVolume: 1.0,
  siteVolumes: {},
  cameraDevices: [],
  micDevices: [],
  selectedCameraId: '',
  selectedMicId: '',

  init: async () => {
    const state = await api.getDeviceState();
    set(state);
    await get().refreshDevices();
  },

  refreshDevices: async () => {
    try {
      // getUserMedia を一度呼んでラベルの権限を取得
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (_) {}
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameraDevices: CameraDevice[] = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `カメラ ${i + 1}` }));
      const micDevices: MicDevice[] = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `マイク ${i + 1}` }));
      set({ cameraDevices, micDevices });
    } catch (err) {
      console.warn('デバイス一覧の取得に失敗:', err);
    }
  },

  setSelectedCamera: (deviceId: string) => {
    set({ selectedCameraId: deviceId });
  },

  setSelectedMic: (deviceId: string) => {
    set({ selectedMicId: deviceId });
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
