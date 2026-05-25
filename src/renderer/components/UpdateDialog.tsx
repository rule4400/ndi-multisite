/**
 * UpdateDialog.tsx
 *
 * 状態遷移:
 *   checking → available → downloading → downloaded → (再起動)
 *   checking → not-available
 *   any      → error
 *
 * autoDownload=false のため、ユーザーが「今すぐ更新」を押したときにダウンロード開始。
 * ダウンロード失敗 or macOS不可の場合は GitHub リリースページへ誘導。
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../bridge/api';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available';   version: string; releaseNotes?: string }
  | { status: 'downloading'; version: string; percent: number; bytesPerSecond?: number }
  | { status: 'downloaded';  version: string }
  | { status: 'not-available'; version: string }
  | { status: 'error';       message: string };

interface Props {
  /** trueの場合は自動表示（起動時）、falseの場合は手動チェック（設定タブ） */
  autoMode: boolean;
  onClose?: () => void;
}

export const UpdateDialog: React.FC<Props> = ({ autoMode, onClose }) => {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsubs = [
      (api as any).onUpdateChecking?.(() => {
        setState({ status: 'checking' });
        if (!autoMode) setVisible(true);
      }),
      (api as any).onUpdateAvailable?.((info: any) => {
        setState({ status: 'available', version: info.version, releaseNotes: info.releaseNotes });
        setVisible(true);
      }),
      (api as any).onUpdateNotAvailable?.((info: any) => {
        setState({ status: 'not-available', version: info.version });
        if (!autoMode) setVisible(true);
      }),
      (api as any).onUpdateProgress?.((prog: any) => {
        setState(prev => ({
          status: 'downloading',
          version: (prev as any).version ?? '?',
          percent: Math.round(prog.percent ?? 0),
          bytesPerSecond: prog.bytesPerSecond,
        }));
        setVisible(true);
      }),
      (api as any).onUpdateDownloaded?.((info: any) => {
        setState({ status: 'downloaded', version: info.version });
        setVisible(true);
      }),
      (api as any).onUpdateError?.((message: string) => {
        setState({ status: 'error', message });
        setVisible(true);
      }),
    ].filter(Boolean);

    return () => unsubs.forEach((fn: any) => fn?.());
  }, [autoMode]);

  const close = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  const startDownload = useCallback(() => {
    (api as any).downloadUpdate?.();
    setState(prev => ({
      status: 'downloading',
      version: (prev as any).version ?? '?',
      percent: 0,
    }));
  }, []);

  const openReleasePage = useCallback(() => {
    (api as any).openReleasePage?.();
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300]">
      <div className="w-[460px] bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        {/* ヘッダー */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <UpdateIcon state={state.status} />
            <h2 className="text-white font-semibold text-lg">
              {state.status === 'checking'       && 'アップデートを確認中...'}
              {state.status === 'available'       && '新しいバージョンがあります'}
              {state.status === 'downloading'     && 'ダウンロード中...'}
              {state.status === 'downloaded'      && 'インストール準備完了'}
              {state.status === 'not-available'   && '最新版を使用中'}
              {state.status === 'error'           && 'アップデートエラー'}
            </h2>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-4">

          {/* checking */}
          {state.status === 'checking' && (
            <div className="flex items-center gap-3 text-white/60">
              <div className="w-4 h-4 border-2 border-white/30 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-sm">GitHubを確認しています...</span>
            </div>
          )}

          {/* available */}
          {state.status === 'available' && (
            <>
              <p className="text-white/70 text-sm">
                バージョン <span className="text-white font-semibold">{state.version}</span> が利用可能です。
              </p>
              {state.releaseNotes && typeof state.releaseNotes === 'string' && (
                <div className="bg-white/5 rounded-lg p-3 text-xs text-white/50 max-h-24 overflow-y-auto">
                  {state.releaseNotes.replace(/<[^>]+>/g, '').trim()}
                </div>
              )}
              <p className="text-xs text-white/40">
                「今すぐ更新」でダウンロードを開始します。ダウンロードできない場合は「GitHubで開く」から手動でインストーラーを入手してください。
              </p>
            </>
          )}

          {/* downloading */}
          {state.status === 'downloading' && (
            <>
              <p className="text-white/70 text-sm">
                バージョン <span className="text-white font-semibold">{state.version}</span> をダウンロード中
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-white/50">
                  <span>{state.percent}%</span>
                  {state.bytesPerSecond && (
                    <span>{(state.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
                  )}
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${state.percent}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {/* downloaded */}
          {state.status === 'downloaded' && (
            <p className="text-white/70 text-sm">
              バージョン <span className="text-white font-semibold">{state.version}</span> のダウンロードが完了しました。
              アプリを再起動してインストールします。
            </p>
          )}

          {/* not-available */}
          {state.status === 'not-available' && (
            <p className="text-white/70 text-sm">
              現在のバージョン <span className="text-white font-semibold">{state.version}</span> は最新版です。
            </p>
          )}

          {/* error */}
          {state.status === 'error' && (
            <div className="space-y-3">
              <p className="text-white/70 text-sm">アップデートの取得中にエラーが発生しました。</p>
              <p className="text-xs text-red-400/80 font-mono bg-red-950/40 rounded px-3 py-2 break-all">
                {state.message}
              </p>
              <p className="text-xs text-white/40">
                「GitHubで開く」から最新版のインストーラーを手動でダウンロードできます。
              </p>
            </div>
          )}
        </div>

        {/* フッターボタン */}
        <div className="px-6 pb-6 flex justify-between items-center">

          {/* 左: GitHubフォールバック（エラー時・available時） */}
          <div>
            {(state.status === 'available' || state.status === 'error' || state.status === 'not-available') && (
              <button
                onClick={openReleasePage}
                className="text-xs text-white/40 hover:text-white/70 underline transition-colors"
              >
                GitHubで開く
              </button>
            )}
          </div>

          {/* 右: アクションボタン */}
          <div className="flex gap-3">

            {state.status === 'available' && (
              <>
                <button
                  onClick={close}
                  className="px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  後で
                </button>
                <button
                  onClick={startDownload}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  今すぐ更新
                </button>
              </>
            )}

            {state.status === 'downloading' && (
              <button
                onClick={close}
                className="px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
              >
                バックグラウンドで続行
              </button>
            )}

            {state.status === 'downloaded' && (
              <>
                <button
                  onClick={close}
                  className="px-4 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  後で再起動
                </button>
                <button
                  onClick={() => (api as any).installUpdate?.()}
                  className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
                >
                  今すぐ再起動して更新
                </button>
              </>
            )}

            {(state.status === 'not-available' || state.status === 'error' || state.status === 'checking') && (
              <button
                onClick={close}
                className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── アイコン ────────────────────────────────────────────────
const UpdateIcon: React.FC<{ state: UpdateState['status'] }> = ({ state }) => {
  if (state === 'checking') {
    return <div className="w-8 h-8 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />;
  }
  if (state === 'available' || state === 'downloading') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" className="text-blue-400 shrink-0">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    );
  }
  if (state === 'downloaded') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" className="text-green-400 shrink-0">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    );
  }
  if (state === 'not-available') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" className="text-green-400 shrink-0">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="16 8 10 14 8 12"/>
      </svg>
    );
  }
  if (state === 'error') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" className="text-red-400 shrink-0">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    );
  }
  return null;
};
