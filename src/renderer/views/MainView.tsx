import React, { useState, useEffect } from 'react';
import { VideoGrid } from '../components/VideoGrid';
import { ControlPanel } from '../components/ControlPanel';
import { SettingsView } from './SettingsView';
import { useStreamStore } from '../stores/useStreamStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useDeviceStore } from '../stores/useDeviceStore';

export const MainView: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { statuses, init: initStream } = useStreamStore();
  const { config, init: initConfig } = useConfigStore();
  const { init: initDevice } = useDeviceStore();
  const { role, logout } = useAuthStore();
  const isFull = role === 'full';

  useEffect(() => {
    initConfig();
    initStream();
    initDevice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        setIsFullscreen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sites = config?.sites ?? [];

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-950 border-b border-white/10 shrink-0">
        <span className="text-white/70 text-sm font-semibold">NDI Multisite</span>
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs">
            {role === 'full' ? 'Full Access' : 'View Only'} · {sites.filter(s => s.enabled).length}拠点
          </span>
          {isFull && (
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
            >
              設定
            </button>
          )}
          <button
            onClick={logout}
            className="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white/50 transition-colors"
          >
            ログアウト
          </button>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="px-3 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white/50 transition-colors"
            title="フルスクリーン (F11)"
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 min-h-0">
        <VideoGrid sites={sites} streamStatuses={statuses} />
      </div>

      {/* Control panel */}
      <div className="shrink-0">
        <ControlPanel />
      </div>

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </div>
  );
};
