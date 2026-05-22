import { Worker } from 'worker_threads';
import * as path from 'path';
import log from 'electron-log';
import { NDISource, StreamState } from '../../shared/types';

export class NDIReceiver {
  private worker: Worker | null = null;
  private siteId: string = '';
  private running = false;
  private fps = 0;
  private connected = false;
  private hasVideo = false;
  private hasAudio = false;
  private frameCallback: ((frame: Buffer, w: number, h: number) => void) | null = null;
  private audioCallback: ((samples: Float32Array, sampleRate: number, channels: number) => void) | null = null;

  async connect(
    source: NDISource,
    siteId: string,
    onFrame: (frame: Buffer, w: number, h: number) => void,
    onAudio: (samples: Float32Array, sampleRate: number, channels: number) => void,
  ): Promise<void> {
    this.siteId = siteId;
    this.frameCallback = onFrame;
    this.audioCallback = onAudio;
    this.running = true;

    try {
      this.worker = new Worker(path.join(__dirname, 'receiverWorker.js'), {
        workerData: { source, siteId },
      });

      this.worker.on('message', (msg: any) => {
        if (msg.type === 'video') {
          this.hasVideo = true;
          this.connected = true;
          this.fps = msg.fps ?? this.fps;
          this.frameCallback?.(msg.data, msg.width, msg.height);
        } else if (msg.type === 'audio') {
          this.hasAudio = true;
          this.audioCallback?.(new Float32Array(msg.data), msg.sampleRate, msg.channels);
        } else if (msg.type === 'error') {
          log.error(`NDI Receiver [${siteId}] error:`, msg.error);
          this.connected = false;
        }
      });

      this.worker.on('error', (err) => {
        log.error(`NDI Receiver [${siteId}] worker error:`, err);
        this.connected = false;
      });

      this.worker.on('exit', () => {
        this.connected = false;
        this.running = false;
      });

      this.connected = true;
      log.info(`NDI Receiver connected: ${source.name} -> ${siteId}`);
    } catch (err) {
      log.error(`Failed to start NDI Receiver worker for ${siteId}:`, err);
      this.connected = false;
    }
  }

  disconnect(): void {
    this.running = false;
    this.connected = false;
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    log.info(`NDI Receiver disconnected: ${this.siteId}`);
  }

  setVolume(_vol: number): void {
    // Volume control is handled in AudioEngine
  }

  getStatus(): StreamState {
    return {
      siteId: this.siteId,
      connected: this.connected,
      hasVideo: this.hasVideo,
      hasAudio: this.hasAudio,
      fps: this.fps,
    };
  }
}
