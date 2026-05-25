import React, { useState, useEffect } from 'react';
import { VideoGrid } from '../components/VideoGrid';
import { ControlPanel } from '../components/ControlPanel';
import { SettingsView } from './SettingsView';
import { UpdateDialog } from '../components/UpdateDialog';
import { NetworkDiagPanel } from '../components/NetworkDiagPanel';
import { NdiInstallDialog } from '../components/NdiInstallDialog';
import { useStreamStore } from '../stores/useStreamStore';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useDeviceStore } from '../stores/useDeviceStore';
import { useNetworkStore } from '../stores/useNetworkStore';
import { audioPlayer } from '../audio/AudioPlayer';
import { api } from '../bridge/api';

export const MainView: React.FC = () => {
  const [showSettings,    setShowSettings]    = useState(false);
  const [showDiag,        setShowDiag]        = useState(false);
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const [showNdiInstall,  setShowNdiInstall]  = useState(false);

  const { statuses, init: initStream } = useStreamStore();
  const { config, init: initConfig }   = useConfigStore();
  const { init: initDevice }           = useDeviceStore();
  const { role, logout }               = useAuthStore();
  const { init: initNetwork, statuses: networkStatuses } = useNetworkStore();
  const isFull = role === 'full';

  useEffect(() => {
    initConfig();
    initStream();
    initDevice();
    const unsubNetwork = initNetwork();

    // NDI SDK 利用可否チェック
    const unsubNdi = (api as any).onNdiSdkStatus?.((status: { available: boolean; error?: string }) => {
      if (!status.available) setShowNdiInstall(true);
    });

    // AudioPlayer初期化 + NDI受信音声をリアルタイム再生
    audioPlayer.initialize();
    const unsubAudio = (api as any).onAudioFrame?.((frame: {
      siteId: string; data: number[]; sampleRate: number; channels: number;
    }) => {
      audioPlayer.resume();
      audioPlayer.playChunk(frame.siteId, frame);
    });

    return () => {
      unsubNetwork?.();
      unsubAudio?.();
      unsubNdi?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // マスター音量をAudioPlayerに反映
  const { masterVolume, siteVolumes } = useDeviceStore();
  useEffect(() => {
    audioPlayer.setMasterVolume(masterVolume);
  }, [masterVolume]);
  useEffect(() => {
    Object.entries(siteVolumes).forEach(([siteId, vol]) => {
      audioPlayer.setSiteVolume(siteId, vol);
    });
  }, [siteVolumes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') setIsFullscreen(prev => !prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sites = config?.sites ?? [];
  const enabledSites = sites.filter(s => s.enabled);

  // 接続状況サマリー（トップバー用）
  const ndiConnected = statuses.filter(s => s.connected).length;
  const netReachable = Array.from(networkStatuses.values()).filter(s => s.reachable).length;

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-950 border-b border-white/10 shrink-0">
        <span className="text-white/70 text-sm font-semibold">NDI Multisite</span>
        <div className="flex items-center gap-2">
          {/* 接続状態サマリーボタン */}
          <button
            onClick={() => setShowDiag(d => !d)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
              ${showDiag
                ? 'bg-blue-600/60 text-blue-200 border border-blue-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white/60 border border-transparent'}`}
            title="接続診断パネルを開く"
          >
            <ConnectionDots ndi={ndiConnected} net={netReachable} total={enabledSites.length} />
            接続状態
          </button>

          <span className="text-white/40 text-xs">
            {role === 'full' ? 'Full Access' : 'View Only'} · {enabledSites.length}拠点
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
            ⛶
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

      {/* 起動時アップデートダイアログ（自動チェックモード） */}
      <UpdateDialog autoMode={true} />

      {/* 接続診断パネル */}
      {showDiag && (
        <NetworkDiagPanel
          sites={enabledSites}
          streamStatuses={statuses}
          networkStatuses={networkStatuses}
          onClose={() => setShowDiag(false)}
        />
      )}

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}

      {/* NDI Runtime 未インストール案内 */}
      {showNdiInstall && <NdiInstallDialog onClose={() => setShowNdiInstall(false)} />}
    </div>
  );
};

// ── トップバー用の接続状態ドット ────────────────────────────

const ConnectionDots: React.FC<{ ndi: number; net: number; total: number }> = ({
  ndi, net, total,
}) => {
  // 全接続済み → 緑、一部 → 黄、0 → 赤
  const color =
    total === 0   ? 'bg-white/30' :
    ndi === total ? 'bg-green-400' :
    ndi > 0       ? 'bg-yellow-400 animate-pulse' :
    net > 0       ? 'bg-yellow-600 animate-pulse' :
    'bg-red-500';

  return <div className={`w-2 h-2 rounded-full ${color}`} />;
};
