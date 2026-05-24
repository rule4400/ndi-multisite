import log from 'electron-log';

export class NDISender {
  private sender: any = null;
  private cameraEnabled = true;
  private micEnabled = true;
  private running = false;
  private frameInterval: NodeJS.Timeout | null = null;
  private grandiose: any = null;
  private width = 1280;
  private height = 720;
  private frameRate = 30;
  private lastErrorLog = 0;          // エラースロットル用
  private readonly ERROR_INTERVAL = 3000; // 3秒に1回だけログ出力

  async start(sourceName: string, resolution: string, fps: number): Promise<void> {
    this.frameRate = fps;
    const [w, h] = resolution.split('x').map(Number);
    this.width = w;
    this.height = h;

    try {
      this.grandiose = require('@stagetimerio/grandiose');
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
    this.frameInterval = setInterval(() => this.sendFrame(), Math.floor(1000 / this.frameRate));
  }

  stop(): void {
    this.running = false;
    if (this.frameInterval) { clearInterval(this.frameInterval); this.frameInterval = null; }
    if (this.sender) { try { this.sender.destroy?.(); } catch (_) {} this.sender = null; }
    log.info('NDI Sender stopped');
  }

  setVideoEnabled(enabled: boolean): void { this.cameraEnabled = enabled; }
  setAudioEnabled(enabled: boolean): void { this.micEnabled = enabled; }

  private async sendFrame(): Promise<void> {
    if (!this.sender || !this.running) return;
    try {
      // ── 映像フレーム（黒画面 BGRA）──
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

      // ── 音声フレーム（無音 planar float32）──
      const sampleRate = 48000;
      const samplesPerCh = Math.floor(sampleRate / this.frameRate);
      const channels = 2;
      const silence = new Float32Array(samplesPerCh * channels);

      await this.sender.audio({
        sampleRate,
        noChannels: channels,
        noSamples: samplesPerCh,
        channelStrideBytes: samplesPerCh * 4,  // planar: bytes per channel
        data: Buffer.from(silence.buffer),
      });
    } catch (err) {
      // 3秒に1回だけエラーログを出力（ログスパム防止）
      const now = Date.now();
      if (now - this.lastErrorLog >= this.ERROR_INTERVAL) {
        log.error('NDI send frame error:', err);
        this.lastErrorLog = now;
      }
    }
  }
}
