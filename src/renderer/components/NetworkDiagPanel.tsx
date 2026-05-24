/**
 * NetworkDiagPanel.tsx
 *
 * 全拠点の接続診断を一覧表示するフローティングパネル。
 * トップバーの「接続状態」ボタンで開閉。
 *
 * 各拠点について以下の3段階を表示:
 *   ● ネットワーク (TCP ping to VPN IP:5960)
 *   ● NDI接続     (NDIReceiver が connect 済みか)
 *   ● 映像受信     (フレームが届いているか)
 */

import React from 'react';
import { Site, StreamState, SiteNetworkStatus } from '../../shared/types';

interface Props {
  sites:          Site[];
  streamStatuses: StreamState[];
  networkStatuses: Map<string, SiteNetworkStatus>;
  onClose:        () => void;
}

export const NetworkDiagPanel: React.FC<Props> = ({
  sites, streamStatuses, networkStatuses, onClose,
}) => {
  const streamMap = new Map(streamStatuses.map(s => [s.siteId, s]));

  return (
    <div className="fixed top-10 right-4 z-[200] w-80 rounded-xl shadow-2xl
      bg-gray-950/95 border border-white/10 text-white text-xs overflow-hidden">

      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5
        border-b border-white/10 bg-white/5">
        <span className="font-semibold text-sm">接続診断</span>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/80 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 text-white/40">
        <LegendItem color="green"  label="接続中" />
        <LegendItem color="yellow" label="到達済・待機" />
        <LegendItem color="red"    label="未到達" />
        <LegendItem color="gray"   label="確認中" />
      </div>

      {/* 拠点リスト */}
      <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
        {sites.filter(s => s.enabled).map(site => {
          const net         = networkStatuses.get(site.id);
          const stream      = streamMap.get(site.id);

          const netOk  = net?.reachable     ?? null;
          const ndiOk  = stream?.connected  ?? false;
          const vidOk  = stream?.hasVideo   ?? false;
          const audOk  = stream?.hasAudio   ?? false;
          const fps    = stream?.fps        ?? 0;
          const lat    = net?.latencyMs;
          const errMsg = stream?.error;

          return (
            <div key={site.id} className="px-4 py-3">
              {/* 拠点名 */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white/80">{site.name}</span>
                {site.vpnIp && (
                  <span className="text-white/30 font-mono">{site.vpnIp}</span>
                )}
              </div>

              {/* 3段階ステータスバー */}
              <div className="flex items-center gap-1">
                {/* ① ネットワーク */}
                <StepBadge
                  label="ネットワーク"
                  ok={netOk}
                  detail={netOk === true ? `${lat}ms` : netOk === false ? '未到達' : '確認中'}
                />
                <Arrow />

                {/* ② NDI接続 */}
                <StepBadge
                  label="NDI"
                  ok={ndiOk ? true : netOk === false ? false : null}
                  detail={ndiOk ? '接続済' : netOk === false ? '到達不可' : '待機中'}
                />
                <Arrow />

                {/* ③ 映像受信 */}
                <StepBadge
                  label="映像"
                  ok={vidOk ? true : ndiOk ? false : null}
                  detail={vidOk ? `${fps}fps` : ndiOk ? 'なし' : '待機中'}
                />
              </div>

              {/* 音声ステータス（補足） */}
              {ndiOk && (
                <div className="mt-1.5 flex items-center gap-1 text-white/40">
                  <span>音声:</span>
                  <span className={audOk ? 'text-green-400' : 'text-red-400'}>
                    {audOk ? '受信中' : 'なし'}
                  </span>
                </div>
              )}

              {/* ヘルプメッセージ */}
              {errMsg?.includes('NDI SDK not available') ? (
                <p className="mt-1.5 text-red-400/80 leading-relaxed">
                  ⚠️ NDI Runtimeが未インストールです。<br />
                  <a className="underline text-red-300">ndi.video</a> からインストールしてください。
                </p>
              ) : errMsg ? (
                <p className="mt-1.5 text-red-400/80 leading-relaxed font-mono text-[10px]">
                  {errMsg}
                </p>
              ) : netOk === false ? (
                <p className="mt-1.5 text-red-400/80 leading-relaxed">
                  VPN接続を確認してください。IPアドレス設定ミスの可能性もあります。
                </p>
              ) : netOk === true && !ndiOk ? (
                <p className="mt-1.5 text-yellow-400/80 leading-relaxed">
                  対象拠点でアプリが起動しているか確認してください。
                </p>
              ) : null}
            </div>
          );
        })}

        {sites.filter(s => s.enabled).length === 0 && (
          <div className="px-4 py-6 text-center text-white/30">
            有効な拠点がありません
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="px-4 py-2 border-t border-white/5 text-white/30 bg-white/5">
        ネットワーク確認は5秒ごとに自動更新されます
      </div>
    </div>
  );
};

// ── 小コンポーネント ────────────────────────────────────────

const StepBadge: React.FC<{
  label:  string;
  ok:     boolean | null;  // true=OK, false=NG, null=unknown
  detail: string;
}> = ({ label, ok, detail }) => {
  const bg =
    ok === true  ? 'bg-green-900/60 border-green-500/40' :
    ok === false ? 'bg-red-900/60 border-red-500/40' :
    'bg-white/5 border-white/10';
  const dot =
    ok === true  ? 'bg-green-400' :
    ok === false ? 'bg-red-500' :
    'bg-white/30 animate-pulse';
  const text =
    ok === true  ? 'text-green-300' :
    ok === false ? 'text-red-300' :
    'text-white/40';

  return (
    <div className={`flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded border ${bg}`}>
      <div className="flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-white/60 font-medium">{label}</span>
      </div>
      <span className={`text-[10px] ${text}`}>{detail}</span>
    </div>
  );
};

const Arrow: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" className="text-white/20 shrink-0">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => {
  const dot =
    color === 'green'  ? 'bg-green-400' :
    color === 'yellow' ? 'bg-yellow-400' :
    color === 'red'    ? 'bg-red-500' :
    'bg-white/30';
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
};
