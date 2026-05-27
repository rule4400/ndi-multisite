/**
 * NDIReceiver
 *
 * Worker Thread を起動して 1 拠点の NDI 映像/音声を受信する。
 * Worker からは ArrayBuffer (transfer) でフレームが届く。
 * メインプロセス側でフォーマット変換などはしない（高効率パススルー）。
 */
import { Worker } from 'worker_threads';
import * as path from 'path';
import log from 'electron-log';
import { NDISource, StreamState } from '../../shared/types';

export type Bandwidth = 'highest' | 'lowest';

export type VideoCallback = (data: Uint8Array, w: number, h: number) => void;
export type AudioCallback = (samples: Float32Array, sampleRate: number, channels: number) => void;

export class NDIReceiver {
  private worker: Worker | null = null;
  private siteId = '';
  private running = false;
  private fps = 0;
  private connected = false;
  private hasVideo = false;
  private hasAudio = false;
  private lastFrameAt = 0;
  private lastError: string | null = null;

  async connect(
    source: NDISource,
    siteId: string,
    onFrame: VideoCallback,
    onAudio: AudioCallback,
    bandwidth: Bandwidth = 'lowest',
  ): Promise<void> {
    this.siteId = siteId;
    this.running = true;
    this.lastError = null;
    this.connected = false;

    try {
      // asar 内では Worker は動かないため app.asar.unpacked パスへ書き換え
      const workerPath = path.join(__dirname, 'receiverWorker.js')
        .replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');

      this.worker = new Worker(workerPath, {
        workerData: { source, siteId, bandwidth },
      });

      this.worker.on('message', (msg: any) => {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case 'video': {
            try {
              this.hasVideo = true;
              this.connected = true;
              this.lastFrameAt = Date.now();
              if (typeof msg.fps === 'number') this.fps = msg.fps;
              const view = new Uint8Array(msg.buffer);
              onFrame(view, msg.width, msg.height);
            } finally {
              // フレーム処理完了を Worker に通知（バックプレッシャー解放）
              this.worker?.postMessage({ type: 'ack' });
            }
            break;
          }
          case 'audio': {
            this.hasAudio = true;
            this.connected = true;
            const view = new Float32Array(msg.buffer);
            onAudio(view, msg.sampleRate, msg.channels);
            break;
          }
          case 'ready':
            log.info(`[NDI Receiver][${siteId}] worker ready -> ${source.name}`);
            break;
          case 'log':
            log.info(`[NDI Receiver][${siteId}] ${msg.message}`);
            break;
          case 'error':
            log.warn(`[NDI Receiver][${siteId}] ${msg.error}`);
            this.lastError = msg.error;
            break;
        }
      });

      this.worker.on('error', (err) => {
        log.error(`[NDI Receiver][${siteId}] worker error:`, err);
        this.lastError = err.message;
        this.connected = false;
      });

      this.worker.on('exit', (code) => {
        log.info(`[NDI Receiver][${siteId}] worker exited (code=${code})`);
        this.connected = false;
        this.running = false;
      });

      log.info(`[NDI Receiver][${siteId}] worker spawned for "${source.name}" (${source.urlAddress ?? '-'}) bandwidth=${bandwidth}`);
    } catch (err: any) {
      log.error(`[NDI Receiver][${siteId}] failed to spawn worker:`, err);
      this.lastError = err.message;
      this.connected = false;
    }
  }

  disconnect(): void {
    this.running = false;
    this.connected = false;
    if (this.worker) {
      try { this.worker.postMessage({ type: 'stop' }); } catch (_) {}
      this.worker.terminate().catch(() => {});
      this.worker = null;
    }
    log.info(`[NDI Receiver][${this.siteId}] disconnected`);
  }

  getStatus(): StreamState {
    // 5 秒以上フレームが無ければ stale
    const stale = this.connected && this.lastFrameAt > 0
      && (Date.now() - this.lastFrameAt) > 5000;
    if (stale) {
      this.connected = false;
      this.hasVideo = false;
      this.fps = 0;
    }
    return {
      siteId:    this.siteId,
      connected: this.connected,
      hasVideo:  this.hasVideo,
      hasAudio:  this.hasAudio,
      fps:       this.fps,
      error:     this.lastError ?? undefined,
    };
  }
}
