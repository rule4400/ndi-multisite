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

  return (
    <div
      ref={cellRef}
      onClick={onClick}
      className={`relative bg-black cursor-pointer overflow-hidden rounded transition-all duration-200
        ${focused ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
      style={{ aspectRatio: '16/9' }}
    >
      {connected ? (
        <VideoCanvas siteId={site.id} />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-white/40 text-sm select-none">
          接続待機中...
        </div>
      )}

      {showLabels && (
        <div className="absolute bottom-1 left-1">
          <SiteLabel name={site.name} />
        </div>
      )}

      <div className="absolute top-1 right-1">
        <StatusIndicator state={streamState} />
      </div>
    </div>
  );
};
