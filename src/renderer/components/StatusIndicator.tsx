import React from 'react';
import { StreamState, SiteNetworkStatus } from '../../shared/types';

interface Props {
  state:   StreamState | undefined;
  network: SiteNetworkStatus | undefined;
}

/**
 * 3段階の接続ステータスを表示:
 *  🔴 ネットワーク未到達 (VPN切断 / IP設定ミス)
 *  🟡 ネットワーク到達済・NDI未接続 (アプリ未起動 / NDI設定ミス)
 *  🟢 NDI接続・映像受信中
 */
export const StatusIndicator: React.FC<Props> = ({ state, network }) => {
  const ndiConnected  = state?.connected ?? false;
  const netReachable  = network?.reachable ?? false;
  const latencyMs     = network?.latencyMs ?? null;
  const fps           = state?.fps ?? 0;

  // ステータス判定
  const level: 'ndi' | 'net' | 'none' =
    ndiConnected  ? 'ndi' :
    netReachable  ? 'net' :
    'none';

  const dotColor =
    level === 'ndi'  ? 'bg-green-400' :
    level === 'net'  ? 'bg-yellow-400 animate-pulse' :
    'bg-red-500';

  const label =
    level === 'ndi'  ? `${fps}fps` :
    level === 'net'  ? `到達 ${latencyMs}ms` :
    network === undefined ? '確認中...' : 'VPN未接続';

  const tooltip =
    level === 'ndi'  ? 'NDI接続中・映像受信中' :
    level === 'net'  ? 'ネットワーク到達済・NDI待機中' :
    'ネットワーク未到達（VPN/IP設定を確認）';

  return (
    <div
      className="flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5 text-xs cursor-default"
      title={tooltip}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <span className={
        level === 'ndi'  ? 'text-white/80' :
        level === 'net'  ? 'text-yellow-300' :
        'text-red-400'
      }>
        {label}
      </span>
    </div>
  );
};
