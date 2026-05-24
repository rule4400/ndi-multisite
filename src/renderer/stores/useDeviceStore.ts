import { create } from 'zustand';
import { api } from '../bridge/api';

export interface CameraDevice  { deviceId: string; label: string; }
export interface MicDevice     { deviceId: string; label: string; }
export interface SpeakerDevice { deviceId: string; label: string; }

interface DeviceStore {
  cameraEnabled: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  masterVolume: number;
  siteVolumes: Record<string, number>;

  // デバイス一覧
  cameraDevices:  CameraDevice[];
  micDevices:     MicDevice[];
  speakerDevices: SpeakerDevice[];

  // 選択中デバイスID（'' = システムデフォルト）
  selectedCameraId:  string;
  selectedMicId:     string;
  selectedSpeakerId: string;

  toggleCamera:   () => void;
  toggleMic:      () => void;
  toggleSpeaker:  () => void;
  setMasterVolume:(vol: number) => void;
  setSiteVolume:  (siteId: string, vol: number) => void;
  muteAll:        () => void;
  setSelectedCamera:  (deviceId: string) => void;
  setSelectedMic:     (deviceId: string) => void;
  setSelectedSpeaker: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  init:           () => Promise<void>;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  cameraEnabled:  true,
  micEnabled:     true,
  speakerEnabled: true,
  masterVolume:   1.0,
  siteVolumes:    {},
  cameraDevices:  [],
  micDevices:     [],
  speakerDevices: [],
  selectedCameraId:  '',
  selectedMicId:     '',
  selectedSpeakerId: '',

  init: async () => {
    const state = await api.getDeviceState();
    set(state);
    await get().refreshDevices();
    // デバイス変更を監視
    navigator.mediaDevices.addEventListener('devicechange', () => get().refreshDevices());
  },

  refreshDevices: async () => {
    // 権限取得のため一度 getUserMedia を呼ぶ
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch (_) {}

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameraDevices: CameraDevice[] = all
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `カメラ ${i + 1}` }));
      const micDevices: MicDevice[] = all
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `マイク ${i + 1}` }));
      const speakerDevices: SpeakerDevice[] = all
        .filter(d => d.kind === 'audiooutput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `スピーカー ${i + 1}` }));
      set({ cameraDevices, micDevices, speakerDevices });
    } catch (err) {
      console.warn('デバイス一覧の取得に失敗:', err);
    }
  },

  setSelectedCamera: (deviceId) => set({ selectedCameraId: deviceId }),
  setSelectedMic:    (deviceId) => set({ selectedMicId: deviceId }),

  setSelectedSpeaker: (deviceId) => {
    set({ selectedSpeakerId: deviceId });
    // すべての <audio>/<video> 要素にスピーカーを適用
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(el => {
      if ('setSinkId' in el) {
        (el as any).setSinkId(deviceId).catch((e: any) =>
          console.warn('setSinkId failed:', e)
        );
      }
    });
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

  setMasterVolume: (vol) => {
    set({ masterVolume: vol });
    api.setVolume(vol);
  },

  setSiteVolume: (siteId, vol) => {
    set(s => ({ siteVolumes: { ...s.siteVolumes, [siteId]: vol } }));
    api.setSiteVolume(siteId, vol);
  },

  muteAll: () => {
    const { speakerEnabled } = get();
    if (speakerEnabled) { set({ speakerEnabled: false }); api.setSpeaker(false); }
    set({ micEnabled: false, cameraEnabled: false });
    api.setMic(false);
    api.setCamera(false);
  },
}));
