/**
 * LocalVideoCell.tsx
 *
 * 自拠点のカメラプレビュー＋NDI送信セル。
 * - カメラ・マイクデバイスを選択可能
 * - 選択したカメラ映像をオフスクリーン canvas で RGBA 取得 → IPC → main → NDI 送信
 * - 選択したマイク音声を ScriptProcessor で PCM 取得 → IPC → main → NDI 送信
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore } from '../stores/useDeviceStore';
import { api } from '../bridge/api';

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
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const cameraEnabled    = useDeviceStore(s => s.cameraEnabled);
  const micEnabled       = useDeviceStore(s => s.micEnabled);
  const selectedCameraId = useDeviceStore(s => s.selectedCameraId);
  const selectedMicId    = useDeviceStore(s => s.selectedMicId);
  const cameraDevices    = useDeviceStore(s => s.cameraDevices);
  const micDevices       = useDeviceStore(s => s.micDevices);
  const setSelectedCamera = useDeviceStore(s => s.setSelectedCamera);
  const setSelectedMic    = useDeviceStore(s => s.setSelectedMic);

  // ── ストリーム起動 ──────────────────────────────────────
  const startStream = useCallback(async () => {
    // 既存ストリームを停止
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (captureTimerRef.current) clearInterval(captureTimerRef.current);
    audioCtxRef.current?.close();
    processorRef.current = null;

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

      // ── NDI 音声キャプチャ（ScriptProcessorNode）──
      startAudioCapture(stream);

    } catch (err: any) {
      if (err.name === 'NotAllowedError')  setError('カメラ・マイクへのアクセスが拒否されました');
      else if (err.name === 'NotFoundError') setError('デバイスが見つかりません');
      else setError('デバイスを起動できません');
    }
  }, [selectedCameraId, selectedMicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAudioCapture = (stream: MediaStream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 2, 2);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!micEnabled) return;
        const L = e.inputBuffer.getChannelData(0);
        const R = e.inputBuffer.getChannelData(1);
        // インターリーブ: L0,R0,L1,R1,...
        const interleaved = new Float32Array(L.length * 2);
        for (let i = 0; i < L.length; i++) {
          interleaved[i * 2]     = L[i];
          interleaved[i * 2 + 1] = R[i];
        }
        api.sendAudioChunk(interleaved, audioCtx.sampleRate, 2);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.warn('音声キャプチャ起動失敗:', err);
    }
  };

  // デバイス選択が変わったら再起動
  useEffect(() => {
    startStream();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      audioCtxRef.current?.close();
      setReady(false);
    };
  }, [startStream]);

  // カメラ有効/無効の切替
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = cameraEnabled; });
  }, [cameraEnabled]);

  // マイク有効/無効の切替
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  }, [micEnabled]);

  // ── デバイスセレクタ UI ──────────────────────────────
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDeviceMenu(false);
      }
    };
    if (showDeviceMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDeviceMenu]);

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

      {/* ── デバイス切替ボタン（ホバー時） ── */}
      <div
        className="absolute bottom-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
        ref={menuRef}
      >
        <button
          onClick={e => { e.stopPropagation(); setShowDeviceMenu(v => !v); }}
          className="flex items-center gap-1 bg-black/70 hover:bg-black/90 text-white/70 hover:text-white text-xs px-2 py-1 rounded transition-colors"
          title="カメラ・マイクを切替"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
          </svg>
          デバイス
        </button>

        {showDeviceMenu && (
          <div
            className="absolute bottom-full right-0 mb-1 w-64 bg-gray-900 border border-white/15
              rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* カメラ選択 */}
            <div className="px-3 py-2 border-b border-white/10">
              <div className="text-xs text-white/40 mb-1.5">📷 カメラ</div>
              {cameraDevices.length === 0 ? (
                <div className="text-xs text-white/30">検出されていません</div>
              ) : (
                <div className="space-y-1">
                  {cameraDevices.map(dev => (
                    <button
                      key={dev.deviceId}
                      onClick={() => { setSelectedCamera(dev.deviceId); setShowDeviceMenu(false); }}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate
                        ${selectedCameraId === dev.deviceId || (!selectedCameraId && dev.deviceId === cameraDevices[0]?.deviceId)
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-white/60 hover:bg-white/10'}`}
                    >
                      {selectedCameraId === dev.deviceId || (!selectedCameraId && dev.deviceId === cameraDevices[0]?.deviceId)
                        ? '✓ ' : '　'}{dev.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* マイク選択 */}
            <div className="px-3 py-2">
              <div className="text-xs text-white/40 mb-1.5">🎤 マイク</div>
              {micDevices.length === 0 ? (
                <div className="text-xs text-white/30">検出されていません</div>
              ) : (
                <div className="space-y-1">
                  {micDevices.map(dev => (
                    <button
                      key={dev.deviceId}
                      onClick={() => { setSelectedMic(dev.deviceId); setShowDeviceMenu(false); }}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate
                        ${selectedMicId === dev.deviceId || (!selectedMicId && dev.deviceId === micDevices[0]?.deviceId)
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-white/60 hover:bg-white/10'}`}
                    >
                      {selectedMicId === dev.deviceId || (!selectedMicId && dev.deviceId === micDevices[0]?.deviceId)
                        ? '✓ ' : '　'}{dev.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
