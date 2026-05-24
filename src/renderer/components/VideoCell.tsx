import React, { useRef } from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCanvas } from './VideoCanvas';
import { SiteLabel } from './SiteLabel';
import { StatusIndicator } from './StatusIndicator';
import { useConfigStore } from '../stores/useConfigStore';

interface VideoCellProps {
  site: Site;
  streamState: StreamState | undefined;
  focused: boolean;
  onClick: () => void;
  onHide?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}

export const VideoCell: React.FC<VideoCellProps> = ({
  site, streamState, focused, onClick, onHide, onDragStart, onDragOver, onDrop,
}) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const showLabels = useConfigStore(s => s.config?.ui.showSiteLabels ?? true);
  const connected = streamState?.connected ?? false;
  const hasVideo = streamState?.hasVideo ?? false;
  const hasAudio = streamState?.hasAudio ?? false;

  return (
    <div
      ref={cellRef}
      className={`group relative bg-black cursor-pointer overflow-hidden rounded transition-all duration-200 w-full h-full
        ${focused ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
      onClick={onClick}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
    >
      {/* 映像エリア：16:9 でレターボックス表示 */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {connected ? (
          <VideoCanvas siteId={site.id} />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-white/40 text-sm select-none">
            接続待機中...
          </div>
        )}
      </div>

      {/* 左下：拠点名 */}
      {showLabels && (
        <div className="absolute bottom-1 left-1 z-10">
          <SiteLabel name={site.name} />
        </div>
      )}

      {/* 右上：接続状態・FPS */}
      <div className="absolute top-1 right-1 z-10">
        <StatusIndicator state={streamState} />
      </div>

      {/* 左上：非表示ボタン（ホバー時のみ表示） */}
      {onHide && (
        <button
          className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity
            bg-black/70 hover:bg-red-600/80 text-white rounded p-1"
          title="この拠点を非表示"
          onClick={e => { e.stopPropagation(); onHide(); }}
        >
          <EyeOffIcon />
        </button>
      )}

      {/* 右下：カメラ・音声OFFインジケーター（接続中のみ） */}
      {connected && (
        <div className="absolute bottom-1 right-1 z-10 flex gap-1">
          {!hasVideo && (
            <div className="flex items-center gap-0.5 bg-black/70 text-red-400 text-xs px-1.5 py-0.5 rounded">
              <CameraOffIcon />
            </div>
          )}
          {!hasAudio && (
            <div className="flex items-center gap-0.5 bg-black/70 text-red-400 text-xs px-1.5 py-0.5 rounded">
              <MicOffIcon />
            </div>
          )}
        </div>
      )}

      {/* フォーカス中バッジ */}
      {focused && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 bg-blue-500/80 text-white text-xs px-2 py-0.5 rounded">
          フォーカス中
        </div>
      )}
    </div>
  );
};

const EyeOffIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const CameraOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34" />
  </svg>
);

const MicOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
    <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
  </svg>
);
