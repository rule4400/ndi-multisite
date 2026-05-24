/**
 * UpdateBanner.tsx
 *
 * 自動アップデートの状態をトップバーに重ねて表示するバナー。
 *
 * 状態遷移:
 *   idle → checking → available（バックグラウンドDL開始）
 *                   → not-available（何も表示しない）
 *   available → downloading（進捗バー）→ downloaded（「今すぐ再起動」ボタン）
 *   any → error（エラーメッセージ）
 */

import React, { useEffect, useState } from 'react';
import { api } from '../bridge/api';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';    version: string }
  | { status: 'downloading';  version: string; percent: number }
  | { status: 'downloaded';   version: string }
  | { status: 'error';        message: string };

export const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubs = [
      api.onUpdateChecking(() => {
        setState({ status: 'checking' });
      }),
      api.onUpdateAvailable((info) => {
        setState({ status: 'available', version: info.version });
        setDismissed(false);
      }),
      api.onUpdateNotAvailable(() => {
        setState({ status: 'idle' });
      }),
      api.onUpdateProgress((prog) => {
        setState(prev => {
          const version = prev.status === 'available' || prev.status === 'downloading'
            ? prev.version : '?';
          return { status: 'downloading', version, percent: Math.round(prog.percent ?? 0) };
        });
      }),
      api.onUpdateDownloaded((info) => {
        setState({ status: 'downloaded', version: info.version });
        setDismissed(false);
      }),
      api.onUpdateError((message) => {
        setState({ status: 'error', message });
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  // 表示が不要な状態
  if (dismissed) return null;
  if (state.status === 'idle' || state.status === 'not-available' as any) return null;
  if (state.status === 'checking') return null; // チェック中は何も出さない

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className={`flex items-center gap-3 px-4 py-2 rounded-b-xl shadow-2xl text-sm
        pointer-events-auto transition-all
        ${state.status === 'error'
          ? 'bg-red-900/95 border border-red-500/40 text-red-100'
          : state.status === 'downloaded'
          ? 'bg-green-900/95 border border-green-500/40 text-green-100'
          : 'bg-gray-900/95 border border-white/15 text-white/80'}`}
      >
        {/* アイコン */}
        {state.status === 'available' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 shrink-0">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>
              バージョン <strong className="text-white">{state.version}</strong> が利用可能です。バックグラウンドでダウンロード中...
            </span>
          </>
        )}

        {state.status === 'downloading' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 shrink-0 animate-pulse">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>ダウンロード中... <strong className="text-white">{state.percent}%</strong></span>
            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          </>
        )}

        {state.status === 'downloaded' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400 shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>
              バージョン <strong className="text-white">{state.version}</strong> の準備ができました
            </span>
            <button
              onClick={() => api.installUpdate()}
              className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-500
                text-white text-xs font-medium transition-colors whitespace-nowrap"
            >
              今すぐ再起動して更新
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-xs text-red-200 max-w-xs truncate">
              アップデートエラー: {state.message}
            </span>
          </>
        )}

        {/* 閉じるボタン */}
        {(state.status === 'available' || state.status === 'error') && (
          <button
            onClick={() => setDismissed(true)}
            className="text-white/40 hover:text-white/70 transition-colors ml-1"
            title="閉じる"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
