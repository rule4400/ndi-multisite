import React, { useEffect, useRef, useState } from 'react';
import { SiteLabel } from './SiteLabel';
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
        if (err.name === 'NotAllowedError') {
          setError('カメラへのアクセスが拒否されました');
        } else if (err.name === 'NotFoundError') {
          setError('カメラが見つかりません');
        } else {
          setError('カメラを起動できません');
        }
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

  // カメラON/OFF連動
  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach(t => {
      t.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-black cursor-pointer overflow-hidden rounded transition-all duration-200
        ${focused ? 'ring-2 ring-blue-400' : 'ring-2 ring-green-500/60 hover:ring-green-400'}`}
      style={{ aspectRatio: '16/9' }}
    >
      {/* カメラ映像 */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{ display: ready && cameraEnabled ? 'block' : 'none', transform: 'scaleX(-1)' }}
      />

      {/* カメラOFF時：黒画面 */}
      {ready && !cameraEnabled && (
        <div className="flex items-center justify-center w-full h-full text-white/40 text-sm">
          カメラ OFF
        </div>
      )}

      {/* エラー時 */}
      {error && (
        <div className="flex flex-col items-center justify-center w-full h-full gap-2 px-4">
          <span className="text-red-400 text-xs text-center">{error}</span>
        </div>
      )}

      {/* 未起動 */}
      {!ready && !error && (
        <div className="flex items-center justify-center w-full h-full text-white/40 text-sm">
          カメラ起動中...
        </div>
      )}

      {/* 自拠点ラベル（緑色バッジ） */}
      <div className="absolute bottom-1 left-1 flex items-center gap-1">
        <div className="flex items-center gap-1 bg-green-600/80 text-white text-xs px-2 py-0.5 rounded">
          <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
          {siteName}（自拠点）
        </div>
      </div>

      {/* ミラー表示インジケーター */}
      <div className="absolute top-1 right-1 bg-black/60 text-white/60 text-xs px-1.5 py-0.5 rounded">
        LIVE
      </div>
    </div>
  );
};
