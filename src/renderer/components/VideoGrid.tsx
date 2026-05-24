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

const LOCAL_SITE_ID = '__local__';

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

  // Full Accessのみ自拠点カメラを先頭に表示
  const totalCount = isFull ? enabledSites.length + 1 : enabledSites.length;

  let cols: number;
  let rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0];
    rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(totalCount));
  }

  const handleClick = (id: string) => {
    if (!focusOnClick) return;
    setFocusedId(prev => prev === id ? null : id);
  };

  // フォーカスモード
  if (focusedId) {
    const isLocalFocused = focusedId === LOCAL_SITE_ID;
    const focusedSite = !isLocalFocused ? enabledSites.find(s => s.id === focusedId) : null;
    const otherSites = enabledSites.filter(s => s.id !== focusedId);

    return (
      <div className="flex w-full h-full gap-1 p-1">
        {/* メイン（拡大） */}
        <div className="flex-[2] min-w-0">
          {isLocalFocused ? (
            <LocalVideoCell
              siteName={siteName}
              focused={true}
              onClick={() => handleClick(LOCAL_SITE_ID)}
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

        {/* サイドリスト */}
        <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-y-auto">
          {/* 自拠点がフォーカスされていない場合はサイドに表示 */}
          {isFull && !isLocalFocused && (
            <LocalVideoCell
              siteName={siteName}
              focused={false}
              onClick={() => handleClick(LOCAL_SITE_ID)}
            />
          )}
          {otherSites.map(site => (
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

  // 通常グリッド表示
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
      {/* 自拠点セル（先頭） */}
      {isFull && (
        <LocalVideoCell
          siteName={siteName}
          focused={focusedId === LOCAL_SITE_ID}
          onClick={() => handleClick(LOCAL_SITE_ID)}
        />
      )}

      {/* 他拠点 */}
      {enabledSites.map(site => (
        <VideoCell
          key={site.id}
          site={site}
          streamState={streamStatuses.find(s => s.siteId === site.id)}
          focused={focusedId === site.id}
          onClick={() => handleClick(site.id)}
        />
      ))}
    </div>
  );
};
