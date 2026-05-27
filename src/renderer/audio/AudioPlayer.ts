/**
 * AudioPlayer.ts
 *
 * NDI 受信音声を Web Audio API でリアルタイム再生する。
 *
 * 設計:
 *   - サイトごとに独立した GainNode で音量制御
 *   - スケジューリング: chunk が届いたら次の再生時刻に積み上げる
 *   - ジッタバッファ: 起動時とアンダーラン時に 120ms のバッファを確保
 *   - アンダーラン回復: 次の予定時刻が現在より過去ならバッファをリセット
 *                       （連鎖的な「過去にスケジュール」を防ぐ）
 */

interface AudioChunk {
  /**
   * NDI 標準フォーマット (Float32 Separate / Planar):
   *   [L0, L1, ..., Ln, R0, R1, ..., Rn]
   */
  data: Float32Array | number[];
  sampleRate: number;
  channels: number;
}

// ジッタバッファ（ms）。大きいほど安定するが、遅延が増える。
// 60-150ms が典型。ローカル NDI なら 80ms、VPN 越しなら 150ms が目安。
const JITTER_BUFFER_MS = 100;

// 静寂検出しきい値（次予定時刻が現在からこれより先なら「途切れた」とみなす）
const UNDERRUN_THRESHOLD_MS = 5;

export class AudioPlayer {
  private context: AudioContext | null = null;
  private gainNodes: Map<string, GainNode> = new Map();
  private masterGain: GainNode | null = null;
  private nextPlayTime: Map<string, number> = new Map();
  private underrunCount: Map<string, number> = new Map();

  initialize(): void {
    if (this.context) return;
    // latencyHint: 'interactive' で低レイテンシ優先
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.context.destination);
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      try { await this.context.resume(); } catch (_) {}
    }
  }

  /** 音声チャンクを受け取り即時スケジューリング再生 */
  playChunk(siteId: string, chunk: AudioChunk): void {
    if (!this.context || !this.masterGain) return;
    if (this.context.state !== 'running') {
      this.resume();
      return; // resume 完了後の chunk から再生
    }

    const { data, sampleRate, channels } = chunk;
    const samples = data instanceof Float32Array
      ? data
      : Float32Array.from(data as number[]);
    const totalSamples = samples.length;
    const framesPerChannel = Math.floor(totalSamples / channels);
    if (framesPerChannel === 0) return;

    let buffer: AudioBuffer;
    try {
      buffer = this.context.createBuffer(channels, framesPerChannel, sampleRate);
    } catch (e) {
      // sampleRate が範囲外 (3000-384000 以外) などで失敗する場合
      return;
    }

    // NDI Float32 Planar: [L0,L1,...,Ln, R0,R1,...,Rn]
    for (let ch = 0; ch < channels; ch++) {
      const channelData = buffer.getChannelData(ch);
      const offset = ch * framesPerChannel;
      channelData.set(samples.subarray(offset, offset + framesPerChannel));
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    // サイトごとの Gain ノード
    let gain = this.gainNodes.get(siteId);
    if (!gain) {
      gain = this.context.createGain();
      gain.gain.value = 1.0;
      gain.connect(this.masterGain);
      this.gainNodes.set(siteId, gain);
    }
    source.connect(gain);

    // ── スケジューリング（ジッタバッファ + アンダーラン回復）──
    const now = this.context.currentTime;
    let scheduled = this.nextPlayTime.get(siteId);

    // 初回 or アンダーラン: ジッタバッファ込みでリセット
    const underrunThreshold = UNDERRUN_THRESHOLD_MS / 1000;
    if (scheduled === undefined || scheduled < now + underrunThreshold) {
      scheduled = now + JITTER_BUFFER_MS / 1000;
      // アンダーランカウント（過剰なら次回バッファを大きくする等の発展可）
      const prev = this.underrunCount.get(siteId) ?? 0;
      this.underrunCount.set(siteId, prev + 1);
    }

    try {
      source.start(scheduled);
    } catch (_) {
      // 既に start 済みエラーなどは無視
      return;
    }
    this.nextPlayTime.set(siteId, scheduled + buffer.duration);

    // メモリリーク防止: 再生終了時にノードを解放
    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
    };
  }

  /** サイト音量 (0.0 – 1.0) */
  setSiteVolume(siteId: string, volume: number): void {
    if (!this.context || !this.masterGain) return;
    if (!this.gainNodes.has(siteId)) {
      const gain = this.context.createGain();
      gain.gain.value = volume;
      gain.connect(this.masterGain);
      this.gainNodes.set(siteId, gain);
      return;
    }
    const gain = this.gainNodes.get(siteId)!;
    gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.01);
  }

  /** マスター音量 (0.0 – 1.0) */
  setMasterVolume(volume: number): void {
    if (!this.masterGain || !this.context) return;
    this.masterGain.gain.setTargetAtTime(volume, this.context.currentTime, 0.01);
  }

  /** デバッグ用: アンダーラン回数を取得 */
  getUnderrunCount(siteId: string): number {
    return this.underrunCount.get(siteId) ?? 0;
  }

  dispose(): void {
    this.context?.close();
    this.context = null;
    this.gainNodes.clear();
    this.nextPlayTime.clear();
    this.underrunCount.clear();
  }
}

export const audioPlayer = new AudioPlayer();
