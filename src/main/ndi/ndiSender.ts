/**
 * NDISender
 *
 * 自拠点のカメラ映像とマイク音声を NDI として送信する。
 *
 * 設計方針:
 *   - 映像: renderer からのフレームを最新値で保持し、フレームレート間隔で送出
 *           （カメラ無効・未受信時は黒フレームを送り続けて他拠点に「無映像」状態を伝える）
 *   - 音声: renderer からチャンクが届いたら即座に NDI に渡す（キューイングしない）
 *           grandiose の clockAudio=false 設定でリアルタイム送信
 *
 * 重要:
 *   - grandiose.send.audio() は fourCC が必須。
 *     プラナー Float32 (FLTp) で送る。
 *   - サンプルレートは renderer の AudioContext 実測値を使用。
 */
import log from 'electron-log';
import { requireGrandiose } from './requireNative';

export class NDISender {
  private sender: any = null;
  private cameraEnabled = true;
  private micEnabled = true;
  private running = false;
  private grandiose: any = null;
  private width = 1280;
  private height = 720;
  private frameRate = 30;

  private lastVideoErrorLog = 0;
  private lastAudioErrorLog = 0;
  private readonly ERROR_INTERVAL = 3000;

  // 最新映像フレーム（renderer から）
  private latestFrame: { data: Uint8Array; width: number; height: number } | null = null;

  // 映像送信用インターバル（音声は即時送信のためインターバル不要）
  private videoInterval: NodeJS.Timeout | null = null;

  // 音声送信時の二重実行ガード
  private audioBusy = false;

  async start(sourceName: string, resolution: string, fps: number): Promise<void> {
    if (this.running) this.stop();

    this.frameRate = fps;
    const [w, h] = resolution.split('x').map(Number);
    this.width = w;
    this.height = h;

    try {
      this.grandiose = requireGrandiose();
      this.sender = await this.grandiose.send({
        name: sourceName,
        clockVideo: true,    // 映像はフレームレートで自動クロック
        clockAudio: false,   // 音声は即時送信
      });
      log.info(`[NDI Sender] started: name="${sourceName}" ${w}x${h}@${fps}`);
    } catch (err) {
      log.warn('[NDI Sender] unavailable (NDI SDK not installed?):', err);
      return;
    }

    this.running = true;
    // 映像のみインターバルで送信
    this.videoInterval = setInterval(() => {
      this.sendVideoFrame().catch(e => {
        const now = Date.now();
        if (now - this.lastVideoErrorLog >= this.ERROR_INTERVAL) {
          log.error('[NDI Sender] video send error:', e);
          this.lastVideoErrorLog = now;
        }
      });
    }, Math.floor(1000 / this.frameRate));
  }

  stop(): void {
    this.running = false;
    if (this.videoInterval) { clearInterval(this.videoInterval); this.videoInterval = null; }
    if (this.sender) { try { this.sender.destroy?.(); } catch (_) {} this.sender = null; }
    this.latestFrame = null;
    log.info('[NDI Sender] stopped');
  }

  setVideoEnabled(enabled: boolean): void { this.cameraEnabled = enabled; }
  setAudioEnabled(enabled: boolean): void { this.micEnabled = enabled; }

  /** renderer からの RGBA フレームを最新値として保持 */
  pushVideoFrame(data: Uint8Array, width: number, height: number): void {
    if (!this.cameraEnabled) return;
    this.latestFrame = { data, width, height };
  }

  /**
   * renderer からのインターリーブ PCM をプラナーに変換して
   * 即座に NDI に送出する。
   * 1秒間に約 24 回呼ばれるため、ここでキューイングは行わない。
   */
  pushAudioChunk(data: Float32Array, sampleRate: number, channels: number): void {
    if (!this.running || !this.sender || !this.micEnabled) return;
    if (!data || data.length === 0 || channels < 1) return;
    if (this.audioBusy) return; // 前回送信中ならドロップ（バックプレッシャー）
    this.audioBusy = true;

    try {
      const samplesPerCh = Math.floor(data.length / channels);
      if (samplesPerCh === 0) { this.audioBusy = false; return; }

      // インターリーブ [L0,R0,L1,R1,...] → プラナー [L0,L1,...,Ln, R0,R1,...,Rn]
      const planar = new Float32Array(samplesPerCh * channels);
      for (let ch = 0; ch < channels; ch++) {
        for (let i = 0; i < samplesPerCh; i++) {
          planar[ch * samplesPerCh + i] = data[i * channels + ch];
        }
      }

      // NDI に送出（fourCC=FLTp = Float Planar が必須）
      this.sender.audio({
        sampleRate,
        noChannels: channels,
        noSamples: samplesPerCh,
        channelStrideBytes: samplesPerCh * 4, // Float32 = 4 bytes
        fourCC: this.grandiose.FOURCC_FLTp,
        data: Buffer.from(planar.buffer),
      })
      .catch((err: any) => {
        const now = Date.now();
        if (now - this.lastAudioErrorLog >= this.ERROR_INTERVAL) {
          log.error('[NDI Sender] audio send error:', err?.message);
          this.lastAudioErrorLog = now;
        }
      })
      .finally(() => { this.audioBusy = false; });
    } catch (err: any) {
      this.audioBusy = false;
      const now = Date.now();
      if (now - this.lastAudioErrorLog >= this.ERROR_INTERVAL) {
        log.error('[NDI Sender] audio prep error:', err?.message);
        this.lastAudioErrorLog = now;
      }
    }
  }

  /** 映像フレーム送信（インターバルから呼ばれる） */
  private async sendVideoFrame(): Promise<void> {
    if (!this.sender || !this.running) return;

    if (this.cameraEnabled && this.latestFrame) {
      const { data: rgba, width, height } = this.latestFrame;
      const bgra = this.rgbaToBgra(rgba, width, height);
      await this.sender.video({
        xres: width,
        yres: height,
        frameRateN: this.frameRate * 1000,
        frameRateD: 1000,
        fourCC: this.grandiose.FOURCC_BGRA,
        pictureAspectRatio: width / height,
        frameFormatType: this.grandiose.FORMAT_TYPE_PROGRESSIVE,
        data: Buffer.from(bgra.buffer),
        lineStrideBytes: width * 4,
      });
    } else {
      // カメラ無効 or 未受信 → 黒フレーム（受信側で「カメラOFF」状態を識別可能）
      const data = new Uint8Array(this.width * this.height * 4);
      await this.sender.video({
        xres: this.width,
        yres: this.height,
        frameRateN: this.frameRate * 1000,
        frameRateD: 1000,
        fourCC: this.grandiose.FOURCC_BGRA,
        pictureAspectRatio: this.width / this.height,
        frameFormatType: this.grandiose.FORMAT_TYPE_PROGRESSIVE,
        data: Buffer.from(data.buffer),
        lineStrideBytes: this.width * 4,
      });
    }
  }

  /** RGBA → BGRA */
  private rgbaToBgra(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const bgra = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const s = i * 4;
      bgra[s]     = rgba[s + 2];
      bgra[s + 1] = rgba[s + 1];
      bgra[s + 2] = rgba[s];
      bgra[s + 3] = rgba[s + 3];
    }
    return bgra;
  }
}
