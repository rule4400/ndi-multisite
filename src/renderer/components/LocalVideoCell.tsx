/**
 * LocalVideoCell.tsx
 *
 * 自拠点のカメラプレビュー＋NDI送信セル。
 * - カメラ・マイクデバイスを選択可能
 * - 選択したカメラ映像をオフスクリーン canvas で RGBA 取得 → IPC → main → NDI 送信
 * - 選択したマイク音声を AudioWorklet (専用音声スレッド) で PCM 取得 → IPC → main → NDI 送信
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore } from '../stores/useDeviceStore';
import { api } from '../bridge/api';

/**
 * AudioWorkletProcessor を Blob URL として注入する。
 * 専用音声スレッドで動くためメインスレッド GC の影響を受けず、ぷつぷつ音が起きにくい。
 *
 * 1024 frames (約 21ms @ 48kHz) ごとにメインスレッドへ送信し、リアルタイム性を保つ。
 */
const MIC_WORKLET_SOURCE = `
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.target = 1024;
    this.bufL = new Float32Array(this.target);
    this.bufR = new Float32Array(this.target);
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const inL = input[0];
    const inR = input[1] || input[0];
    if (!inL) return true;
    let i = 0;
    const n = inL.length;
    while (i < n) {
      const space = this.target - this.filled;
      const copy = Math.min(space, n - i);
      this.bufL.set(inL.subarray(i, i + copy), this.filled);
      this.bufR.set(inR.subarray(i, i + copy), this.filled);
      this.filled += copy;
      i += copy;
      if (this.filled >= this.target) {
        const interleaved = new Float32Array(this.target * 2);
        for (let j = 0; j < this.target; j++) {
          interleaved[j * 2] = this.bufL[j];
          interleaved[j * 2 + 1] = this.bufR[j];
        }
        this.port.postMessage(
          { samples: interleaved, sampleRate, channels: 2 },
          [interleaved.buffer]
        );
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

interface LocalVideoCellProps {
  siteName: string;
  focused: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}

// NDI 送信用フレームレート（IPC 負荷を抑えるため 15fps）
const NDI_FPS = 15;

export const LocalVideoCell: React.FC<LocalVideoCellProps> = ({
  siteName, focused, onClick, onContextMenu, onDragStart, onDrop,
}) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workletUrlRef = useRef<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const cameraEnabled    = useDeviceStore(s => s.cameraEnabled);
  const micEnabled       = useDeviceStore(s => s.micEnabled);
  const selectedCameraId = useDeviceStore(s => s.selectedCameraId);
  const selectedMicId    = useDeviceStore(s => s.selectedMicId);

  // ── ストリーム停止 ─────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (captureTimerRef.current) { clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
    if (workletNodeRef.current)  { try { workletNodeRef.current.disconnect(); } catch (_) {} workletNodeRef.current = null; }
    if (audioCtxRef.current)     { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    if (workletUrlRef.current)   { URL.revokeObjectURL(workletUrlRef.current); workletUrlRef.current = null; }
  }, []);

  // ── ストリーム起動 ──────────────────────────────────────
  const startStream = useCallback(async () => {
    stopStream();
    setReady(false);
    setError(null);

    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
        ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : {}),
      };
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true, noiseSuppression: true, sampleRate: 48000,
        ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });
      streamRef.current = stream;

      // ── プレビュー映像 ──
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);

      // ── NDI 映像キャプチャループ（15fps）──
      const canvas = canvasRef.current;
      if (canvas) {
        captureTimerRef.current = setInterval(() => {
          const video = videoRef.current;
          if (!video || !cameraEnabled || video.readyState < 2) return;
          const w = video.videoWidth  || 1280;
          const h = video.videoHeight || 720;
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          api.sendVideoFrame(new Uint8Array(imageData.data.buffer), w, h);
        }, Math.floor(1000 / NDI_FPS));
      }

      // ── NDI 音声キャプチャ（AudioWorklet 専用音声スレッド）──
      await startAudioCapture(stream);

    } catch (err: any) {
      if (err.name === 'NotAllowedError')  setError('カメラ・マイクへのアクセスが拒否されました');
      else if (err.name === 'NotFoundError') setError('デバイスが見つかりません');
      else setError('デバイスを起動できません');
    }
  }, [selectedCameraId, selectedMicId, stopStream]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAudioCapture = async (stream: MediaStream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      audioCtxRef.current = audioCtx;

      // Worklet モジュールを Blob URL として登録
      const blob = new Blob([MIC_WORKLET_SOURCE], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      workletUrlRef.current = url;
      await audioCtx.audioWorklet.addModule(url);

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, 'mic-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e) => {
        if (!micEnabled) return;
        const { samples, sampleRate, channels } = e.data;
        // Float32Array をそのまま main プロセスへ転送
        api.sendAudioChunk(samples, sampleRate, channels);
      };

      sourceNode.connect(workletNode);
    } catch (err) {
      console.warn('音声キャプチャ起動失敗:', err);
    }
  };

  // デバイス選択が変わったら再起動
  useEffect(() => {
    startStream();
    return () => {
      stopStream();
      setReady(false);
    };
  }, [startStream, stopStream]);

  // カメラ有効/無効の切替
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = cameraEnabled; });
  }, [cameraEnabled]);

  // マイク有効/無効の切替
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  }, [micEnabled]);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
      className={`group relative bg-black cursor-pointer overflow-hidden rounded
        transition-all duration-200 w-full h-full select-none
        ${focused ? 'ring-2 ring-blue-400' : 'ring-2 ring-green-500/60 hover:ring-green-400'}`}
    >
      {/* オフスクリーン canvas（NDI 送信用） */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── 映像プレビュー ── */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full"
          style={{
            objectFit: 'contain',
            display: ready && cameraEnabled ? 'block' : 'none',
            transform: 'scaleX(-1)',
          }}
        />
        {ready && !cameraEnabled && (
          <div className="text-white/40 text-sm">カメラ OFF</div>
        )}
        {error && (
          <div className="px-4 text-red-400 text-xs text-center">{error}</div>
        )}
        {!ready && !error && (
          <div className="text-white/40 text-sm">カメラ起動中...</div>
        )}
      </div>

      {/* ── 左下：自拠点ラベル ── */}
      <div className="absolute bottom-1 left-1 z-10">
        <div className="flex items-center gap-1 bg-green-600/80 text-white text-xs px-2 py-0.5 rounded">
          <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
          {siteName.slice(0, 8)}（自拠点）
        </div>
      </div>

      {/* ── 右上：NDI 配信バッジ ── */}
      <div className="absolute top-1 right-1 z-10 bg-red-600/80 text-white text-xs px-1.5 py-0.5 rounded font-medium">
        ● NDI ON AIR
      </div>

      {/* ── フォーカスバッジ ── */}
      {focused && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10
          bg-blue-500/80 text-white text-xs px-2 py-0.5 rounded">
          フォーカス中
        </div>
      )}

      {/* ── カメラ・マイクOFF インジケーター ── */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 flex gap-1">
        {!cameraEnabled && (
          <div className="flex items-center gap-1 bg-black/70 text-red-400 text-xs px-1.5 py-0.5 rounded">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34"/>
            </svg>
            カメラOFF
          </div>
        )}
        {!micEnabled && (
          <div className="flex items-center gap-1 bg-black/70 text-red-400 text-xs px-1.5 py-0.5 rounded">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
              <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
            </svg>
            マイクOFF
          </div>
        )}
      </div>
    </div>
  );
};
