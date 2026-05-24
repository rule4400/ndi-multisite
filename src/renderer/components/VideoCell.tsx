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
}

export const VideoCell: React.FC<VideoCellProps> = ({ site, streamState, focused, onClick }) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const showLabels = useConfigStore(s => s.config?.ui.showSiteLabels ?? true);
  const connected = streamState?.connected ?? false;
  const hasVideo = streamState?.hasVideo ?? false;
  const hasAudio = streamState?.hasAudio ?? false;

  return (
    <div
      ref={cellRef}
      onClick={onClick}
      className={`relative bg-black cursor-pointer overflow-hidden rounded transition-all duration-200 w-full h-full
        ${focused ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
    >
      {/* 映像エリア（グリッドセル全体を埋める） */}
      <div className="absolute inset-0">
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
        <div className="absolute bottom-1 left-1">
          <SiteLabel name={site.name} />
        </div>
      )}

      {/* 右上：接続状態・FPS */}
      <div className="absolute top-1 right-1">
        <StatusIndicator state={streamState} />
      </div>

      {/* 右下：カメラ・音声OFFインジケーター（接続中のみ表示） */}
      {connected && (
        <div className="absolute bottom-1 right-1 flex gap-1">
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
    </div>
  );
};

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
