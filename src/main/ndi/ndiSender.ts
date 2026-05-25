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
  private lastErrorLog = 0;
  private readonly ERROR_INTERVAL = 3000;

  // 最新フレームバッファ（renderer から受け取った RGBA データ）
  private latestFrame: { data: Uint8Array; width: number; height: number } | null = null;
  private latestAudio: { data: Float32Array; sampleRate: number; channels: number } | null = null;

  // NDI 送信インターバル
  private sendInterval: NodeJS.Timeout | null = null;

  async start(sourceName: string, resolution: string, fps: number): Promise<void> {
    this.frameRate = fps;
    const [w, h] = resolution.split('x').map(Number);
    this.width = w;
    this.height = h;

    try {
      this.grandiose = requireGrandiose();
      this.sender = await this.grandiose.send({
        name: sourceName,
        clockVideo: true,
        clockAudio: false,
      });
      log.info(`NDI Sender started: ${sourceName}`);
    } catch (err) {
      log.warn('NDI Sender unavailable (NDI SDK not installed?):', err);
      return;
    }

    this.running = true;
    this.sendInterval = setInterval(() => this.sendFrame(), Math.floor(1000 / this.frameRate));
  }

  stop(): void {
    this.running = false;
    if (this.sendInterval) { clearInterval(this.sendInterval); this.sendInterval = null; }
    if (this.sender) { try { this.sender.destroy?.(); } catch (_) {} this.sender = null; }
    this.latestFrame = null;
    this.latestAudio = null;
    log.info('NDI Sender stopped');
  }

  setVideoEnabled(enabled: boolean): void { this.cameraEnabled = enabled; }
  setAudioEnabled(enabled: boolean): void { this.micEnabled = enabled; }

  /**
   * renderer から受け取った RGBA フレームを保持する。
   * 次の sendFrame() タイミングで NDI に送出する。
   */
  pushVideoFrame(data: Uint8Array, width: number, height: number): void {
    if (!this.cameraEnabled) return;
    this.latestFrame = { data, width, height };
  }

  /**
   * renderer から受け取ったインターリーブ PCM を保持する。
   */
  pushAudioChunk(data: Float32Array, sampleRate: number, channels: number): void {
    if (!this.micEnabled) return;
    this.latestAudio = { data, sampleRate, channels };
  }

  private async sendFrame(): Promise<void> {
    if (!this.sender || !this.running) return;
    try {
      // ── 映像 ───────────────────────────────────────────
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
        // カメラ無効 or フレーム未受信 → 黒フレーム
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

      // ── 音声 ───────────────────────────────────────────
      if (this.micEnabled && this.latestAudio) {
        const { data: interleaved, sampleRate, channels } = this.latestAudio;
        // インターリーブ → プラナー変換
        const samplesPerCh = Math.floor(interleaved.length / channels);
        const planar = new Float32Array(samplesPerCh * channels);
        for (let ch = 0; ch < channels; ch++) {
          for (let i = 0; i < samplesPerCh; i++) {
            planar[ch * samplesPerCh + i] = interleaved[i * channels + ch];
          }
        }
        await this.sender.audio({
          sampleRate,
          noChannels: channels,
          noSamples: samplesPerCh,
          channelStrideBytes: samplesPerCh * 4,
          data: Buffer.from(planar.buffer),
        });
        this.latestAudio = null;
      } else {
        const sampleRate = 48000;
        const samplesPerCh = Math.floor(sampleRate / this.frameRate);
        const silence = new Float32Array(samplesPerCh * 2);
        await this.sender.audio({
          sampleRate,
          noChannels: 2,
          noSamples: samplesPerCh,
          channelStrideBytes: samplesPerCh * 4,
          data: Buffer.from(silence.buffer),
        });
      }
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorLog >= this.ERROR_INTERVAL) {
        log.error('NDI send frame error:', err);
        this.lastErrorLog = now;
      }
    }
  }

  /** RGBA → BGRA（grandiose は BGRA フォーマットを期待する） */
  private rgbaToBgra(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const bgra = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const s = i * 4;
      bgra[s]     = rgba[s + 2]; // B ← R
      bgra[s + 1] = rgba[s + 1]; // G = G
      bgra[s + 2] = rgba[s];     // R ← B
      bgra[s + 3] = rgba[s + 3]; // A = A
    }
    return bgra;
  }
}
