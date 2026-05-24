import React, { useRef } from 'react';
import { Site, StreamState, SiteNetworkStatus } from '../../shared/types';
import { VideoCanvas } from './VideoCanvas';
import { SiteLabel } from './SiteLabel';
import { StatusIndicator } from './StatusIndicator';
import { useConfigStore } from '../stores/useConfigStore';
import { useNetworkStore } from '../stores/useNetworkStore';

interface VideoCellProps {
  site: Site;
  streamState: StreamState | undefined;
  focused: boolean;
  muted: boolean;
  volume: number;
  videoHidden: boolean;
  onClick: () => void;
  onMuteToggle: () => void;
  onHide: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart?: () => void;
  onDrop?: () => void;
}

export const VideoCell: React.FC<VideoCellProps> = ({
  site, streamState, focused, muted, volume, videoHidden,
  onClick, onMuteToggle, onHide, onContextMenu, onDragStart, onDrop,
}) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const showLabels = useConfigStore(s => s.config?.ui.showSiteLabels ?? true);
  const networkStatus = useNetworkStore(s => s.getStatus(site.id));
  const connected = streamState?.connected ?? false;
  const hasVideo  = streamState?.hasVideo  ?? false;
  const hasAudio  = streamState?.hasAudio  ?? false;
  const netReachable = networkStatus?.reachable ?? false;

  return (
    <div
      ref={cellRef}
      className={`group relative bg-black cursor-pointer overflow-hidden rounded
        transition-all duration-200 w-full h-full select-none
        ${focused
          ? 'ring-2 ring-blue-400'
          : 'ring-1 ring-white/10 hover:ring-white/30'}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
    >
      {/* ── 映像（16:9 letterbox）── */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {connected && !videoHidden ? (
          <VideoCanvas siteId={site.id} />
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 select-none">
            {videoHidden ? (
              <span className="text-white/40 text-sm">映像オフ</span>
            ) : (
              <>
                {/* ネットワーク状態に応じたアイコン＋メッセージ */}
                {networkStatus === undefined ? (
                  <DiagDot color="gray" label="確認中..." />
                ) : netReachable ? (
                  <DiagDot color="yellow" label="NDI待機中" sub="アプリ起動を確認" />
                ) : (
                  <DiagDot color="red" label="VPN未接続" sub={site.vpnIp ? `${site.vpnIp} に到達不可` : 'VPN IPが未設定'} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 右上：接続状態 ── */}
      <div className="absolute top-1 right-1 z-10">
        <StatusIndicator state={streamState} network={networkStatus} />
      </div>

      {/* ── 左上：非表示ボタン（ホバー時） ── */}
      <button
        className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity
          bg-black/70 hover:bg-red-600/80 text-white rounded p-1"
        title="グリッドから非表示"
        onClick={e => { e.stopPropagation(); onHide(); }}
      >
        <EyeOffIcon />
      </button>

      {/* ── 下部中央：ミュートボタン（ホバー時）── */}
      <button
        className={`absolute bottom-7 left-1/2 -translate-x-1/2 z-10
          opacity-0 group-hover:opacity-100 transition-opacity
          px-2 py-1 rounded-full text-xs flex items-center gap-1 font-medium
          ${muted
            ? 'bg-red-600/90 text-white'
            : 'bg-black/70 text-white hover:bg-black/90'}`}
        title={muted ? 'ミュート解除' : 'スピーカーミュート'}
        onClick={e => { e.stopPropagation(); onMuteToggle(); }}
      >
        {muted ? <MutedIcon /> : <SpeakerIcon />}
        <span>{muted ? 'ミュート中' : 'ミュート'}</span>
      </button>

      {/* ── 左下：拠点名 ── */}
      {showLabels && (
        <div className="absolute bottom-1 left-1 z-10">
          <SiteLabel name={site.name} />
        </div>
      )}

      {/* ── 右下：カメラ・音声OFFインジケーター ── */}
      {connected && (
        <div className="absolute bottom-1 right-1 z-10 flex gap-1">
          {muted && (
            <div className="flex items-center bg-red-600/80 text-white text-xs px-1.5 py-0.5 rounded">
              <MutedIcon />
            </div>
          )}
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

      {/* ── フォーカスバッジ ── */}
      {focused && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10
          bg-blue-500/80 text-white text-xs px-2 py-0.5 rounded">
          フォーカス中
        </div>
      )}
    </div>
  );
};

// ── 診断ドット ─────────────────────────────────────────────

const DiagDot: React.FC<{ color: 'red' | 'yellow' | 'gray'; label: string; sub?: string }> = ({ color, label, sub }) => {
  const dotClass =
    color === 'red'    ? 'bg-red-500' :
    color === 'yellow' ? 'bg-yellow-400 animate-pulse' :
    'bg-white/30 animate-pulse';
  const textClass =
    color === 'red'    ? 'text-red-400' :
    color === 'yellow' ? 'text-yellow-300' :
    'text-white/40';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-3 h-3 rounded-full ${dotClass}`} />
      <span className={`text-xs font-medium ${textClass}`}>{label}</span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  );
};

// ── アイコン ─────────────────────────────────────────────

const EyeOffIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
  </svg>
);

const MutedIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
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
