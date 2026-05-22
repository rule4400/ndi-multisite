import React, { useState } from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCell } from './VideoCell';
import { useConfigStore } from '../stores/useConfigStore';

interface VideoGridProps {
  sites: Site[];
  streamStatuses: StreamState[];
}

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

  const enabledSites = sites.filter(s => s.enabled);

  let cols: number;
  let rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0];
    rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(enabledSites.length));
  }

  const handleCellClick = (siteId: string) => {
    if (!focusOnClick) return;
    setFocusedId(prev => prev === siteId ? null : siteId);
  };

  if (focusedId) {
    const focusedSite = enabledSites.find(s => s.id === focusedId);
    const others = enabledSites.filter(s => s.id !== focusedId);

    return (
      <div className="flex w-full h-full gap-1 p-1">
        <div className="flex-[2] min-w-0">
          {focusedSite && (
            <VideoCell
              site={focusedSite}
              streamState={streamStatuses.find(s => s.siteId === focusedSite.id)}
              focused={true}
              onClick={() => handleCellClick(focusedSite.id)}
            />
          )}
        </div>
        <div
          className="flex-1 min-w-0 grid gap-1 content-start"
          style={{
            gridTemplateColumns: 'repeat(1, 1fr)',
            overflowY: 'auto',
          }}
        >
          {others.map(site => (
            <VideoCell
              key={site.id}
              site={site}
              streamState={streamStatuses.find(s => s.siteId === site.id)}
              focused={false}
              onClick={() => handleCellClick(site.id)}
            />
          ))}
        </div>
      </div>
    );
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
      {enabledSites.map(site => (
        <VideoCell
          key={site.id}
          site={site}
          streamState={streamStatuses.find(s => s.siteId === site.id)}
          focused={false}
          onClick={() => handleCellClick(site.id)}
        />
      ))}
    </div>
  );
};
