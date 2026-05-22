import React from 'react';
import { StreamState } from '../../shared/types';

interface Props {
  state: StreamState | undefined;
}

export const StatusIndicator: React.FC<Props> = ({ state }) => {
  const connected = state?.connected ?? false;
  const fps = state?.fps ?? 0;

  return (
    <div className="flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5 text-xs">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}
      />
      {connected && <span className="text-white/80">{fps}fps</span>}
    </div>
  );
};
