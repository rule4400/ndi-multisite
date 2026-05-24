/**
 * AudioPlayer.ts
 *
 * NDI受信音声をWeb Audio APIでリアルタイム再生するクラス。
 * サイトごとに独立した音量制御が可能。
 */

interface AudioChunk {
  data: number[];       // Float32 PCM samples (planar interleaved)
  sampleRate: number;
  channels: number;
}

export class AudioPlayer {
  private context: AudioContext | null = null;
  private gainNodes: Map<string, GainNode> = new Map();
  private masterGain: GainNode | null = null;
  private nextPlayTime: Map<string, number> = new Map();

  initialize(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  /** 音声チャンクを受け取り即時スケジューリング再生 */
  playChunk(siteId: string, chunk: AudioChunk): void {
    if (!this.context || !this.masterGain) return;

    const { data, sampleRate, channels } = chunk;
    const totalSamples = data.length;
    const framesPerChannel = Math.floor(totalSamples / channels);
    if (framesPerChannel === 0) return;

    const buffer = this.context.createBuffer(channels, framesPerChannel, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < framesPerChannel; i++) {
        // grandiose audio: interleaved format [L0,R0,L1,R1,...]
        channelData[i] = data[i * channels + ch] ?? 0;
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    // サイトごとのGainNode
    if (!this.gainNodes.has(siteId)) {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.gainNodes.set(siteId, gain);
    }
    source.connect(this.gainNodes.get(siteId)!);

    // スケジューリング: 連続再生のため次の再生時刻を追跡
    const now = this.context.currentTime;
    const scheduled = this.nextPlayTime.get(siteId) ?? now;
    const startTime = Math.max(now + 0.05, scheduled); // 50ms バッファ
    source.start(startTime);
    this.nextPlayTime.set(siteId, startTime + buffer.duration);
  }

  /** サイト音量 (0.0 – 1.0) */
  setSiteVolume(siteId: string, volume: number): void {
    if (!this.gainNodes.has(siteId) && this.context && this.masterGain) {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.gainNodes.set(siteId, gain);
    }
    const gain = this.gainNodes.get(siteId);
    if (gain) gain.gain.setTargetAtTime(volume, this.context!.currentTime, 0.01);
  }

  /** マスター音量 (0.0 – 1.0) */
  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(volume, this.context!.currentTime, 0.01);
    }
  }

  dispose(): void {
    this.context?.close();
    this.context = null;
    this.gainNodes.clear();
    this.nextPlayTime.clear();
  }
}

export const audioPlayer = new AudioPlayer();
