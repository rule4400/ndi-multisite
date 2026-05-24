import React, { useState } from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCell } from './VideoCell';
import { LocalVideoCell } from './LocalVideoCell';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';

interface VideoGridProps {
  sites: Site[];
  streamStatuses: StreamState[];
}

const LOCAL_ID = '__local__';

function calcGrid(count: number): { cols: number; rows: number } {
  if (count <= 1)  return { cols: 1, rows: 1 };
  if (count <= 4)  return { cols: 2, rows: 2 };
  if (count <= 6)  return { cols: 3, rows: 2 };
  if (count <= 9)  return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

export const VideoGrid: React.FC<VideoGridProps> = ({ sites, streamStatuses }) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const gridLayout = useConfigStore(s => s.config?.ui.gridLayout ?? 'auto');
  const focusOnClick = useConfigStore(s => s.config?.ui.focusOnClick ?? true);
  const siteName = useConfigStore(s => s.config?.siteName ?? '自拠点');
  const role = useAuthStore(s => s.role);
  const isFull = role === 'full';

  const enabledSites = sites.filter(s => s.enabled);
  const totalCount = isFull ? enabledSites.length + 1 : enabledSites.length;

  const handleClick = (id: string) => {
    if (!focusOnClick) return;
    setFocusedId(prev => prev === id ? null : id);
  };

  // ── フォーカスモード ──────────────────────────────
  if (focusedId) {
    const isLocal = focusedId === LOCAL_ID;
    const focusedSite = isLocal ? null : enabledSites.find(s => s.id === focusedId);
    const sidebarSites = enabledSites.filter(s => s.id !== focusedId);

    return (
      <div className="flex w-full h-full overflow-hidden">
        {/* ── メインエリア（左 2/3） ── */}
        <div className="flex-[2] min-w-0 p-1 pr-0.5">
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '16/9', maxHeight: '100%' }}>
              {isLocal ? (
                <LocalVideoCell
                  siteName={siteName}
                  focused={true}
                  onClick={() => handleClick(LOCAL_ID)}
                />
              ) : focusedSite ? (
                <VideoCell
                  site={focusedSite}
                  streamState={streamStatuses.find(s => s.siteId === focusedSite.id)}
                  focused={true}
                  onClick={() => handleClick(focusedSite.id)}
                />
              ) : null}
            </div>
          </div>
        </div>

        {/* ── サイドバー（右 1/3）縦スクロール ── */}
        <div className="flex-1 min-w-0 p-1 pl-0.5 overflow-y-auto flex flex-col gap-1">
          {/* 自拠点がフォーカスされていないときだけサイドに表示 */}
          {isFull && !isLocal && (
            <LocalVideoCell
              siteName={siteName}
              focused={false}
              onClick={() => handleClick(LOCAL_ID)}
            />
          )}
          {sidebarSites.map(site => (
            <VideoCell
              key={site.id}
              site={site}
              streamState={streamStatuses.find(s => s.siteId === site.id)}
              focused={false}
              onClick={() => handleClick(site.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── 通常グリッド ──────────────────────────────────
  let cols: number;
  let rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0];
    rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(totalCount));
  }

  return (
    <div
      className="w-full h-full p-1"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '4px',
      }}
    >
      {isFull && (
        <LocalVideoCell
          siteName={siteName}
          focused={false}
          onClick={() => handleClick(LOCAL_ID)}
        />
      )}
      {enabledSites.map(site => (
        <VideoCell
          key={site.id}
          site={site}
          streamState={streamStatuses.find(s => s.siteId === site.id)}
          focused={false}
          onClick={() => handleClick(site.id)}
        />
      ))}
    </div>
  );
};
