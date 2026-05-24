import React, { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../stores/useDeviceStore';

interface LocalVideoCellProps {
  siteName: string;
  focused: boolean;
  onClick: () => void;
}

export const LocalVideoCell: React.FC<LocalVideoCellProps> = ({ siteName, focused, onClick }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraEnabled = useDeviceStore(s => s.cameraEnabled);
  const micEnabled = useDeviceStore(s => s.micEnabled);

  useEffect(() => {
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
        setError(null);
      } catch (err: any) {
        if (!active) return;
        if (err.name === 'NotAllowedError') setError('カメラへのアクセスが拒否されました');
        else if (err.name === 'NotFoundError') setError('カメラが見つかりません');
        else setError('カメラを起動できません');
      }
    }
    startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = cameraEnabled; });
  }, [cameraEnabled]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-black cursor-pointer overflow-hidden rounded transition-all duration-200
        ${focused ? 'ring-2 ring-blue-400' : 'ring-2 ring-green-500/60 hover:ring-green-400'}`}
    >
      {/* 16:9 映像エリア */}
      <div className="w-full" style={{ paddingBottom: '56.25%', position: 'relative' }}>
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ display: ready && cameraEnabled ? 'block' : 'none', transform: 'scaleX(-1)' }}
          />
          {ready && !cameraEnabled && (
            <div className="flex items-center justify-center w-full h-full text-white/40 text-sm">
              カメラ OFF
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center w-full h-full px-4">
              <span className="text-red-400 text-xs text-center">{error}</span>
            </div>
          )}
          {!ready && !error && (
            <div className="flex items-center justify-center w-full h-full text-white/40 text-sm">
              カメラ起動中...
            </div>
          )}
        </div>
      </div>

      {/* 左下：自拠点ラベル */}
      <div className="absolute bottom-1 left-1">
        <div className="flex items-center gap-1 bg-green-600/80 text-white text-xs px-2 py-0.5 rounded">
          <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
          {siteName.slice(0, 8)}（自拠点）
        </div>
      </div>

      {/* 右上：LIVEバッジ */}
      <div className="absolute top-1 right-1 bg-black/60 text-white/60 text-xs px-1.5 py-0.5 rounded">
        LIVE
      </div>

      {/* 右下：カメラ・マイクOFFインジケーター */}
      <div className="absolute bottom-1 right-1 flex gap-1">
        {!cameraEnabled && (
          <div className="flex items-center bg-black/70 text-red-400 px-1.5 py-0.5 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34" />
            </svg>
          </div>
        )}
        {!micEnabled && (
          <div className="flex items-center bg-black/70 text-red-400 px-1.5 py-0.5 rounded">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
              <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
