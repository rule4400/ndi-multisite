/**
 * NdiInstallDialog.tsx
 *
 * NDI Runtime が見つからない場合にインストールを案内するダイアログ。
 * macOS: 通常は grandiose に同梱されているため表示されない
 * Windows: NDI Runtime のインストールが必要
 */
import React from 'react';

interface Props {
  onClose: () => void;
}

const NDI_TOOLS_URL = 'https://www.ndi.tv/tools/';
const NDI_RUNTIME_URL_WIN = 'https://downloads.ndi.tv/Tools/NDI%206%20Tools.exe';

const isWindows = navigator.userAgent.toLowerCase().includes('win');

export const NdiInstallDialog: React.FC<Props> = ({ onClose }) => {
  const openUrl = (url: string) => {
    (window as any).electronAPI?.openReleasePage?.();
    // openReleasePage は GitHub を開くので、別途 shell.openExternal を使う
    // preload 経由で開く
    (window as any).electronAPI?.openExternalUrl?.(url);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[400]">
      <div className="w-[500px] bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        {/* ヘッダー */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8 flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" className="text-yellow-400 shrink-0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <h2 className="text-white font-semibold text-lg">NDI Runtime が見つかりません</h2>
            <p className="text-white/50 text-sm">映像・音声の送受信に NDI Runtime が必要です</p>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-white/70 text-sm leading-relaxed">
            このアプリは <strong className="text-white">NDI® Technology</strong> を使用して映像・音声を送受信します。
            動作には <strong className="text-white">NDI Tools</strong>（無料）のインストールが必要です。
          </p>

          {/* インストール手順 */}
          <div className="bg-white/5 rounded-xl p-4 space-y-3">
            <p className="text-white/60 text-xs font-medium uppercase tracking-wide">インストール手順</p>
            <ol className="space-y-2 text-sm text-white/70">
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">1.</span>
                <span>下のボタンから <strong className="text-white">NDI Tools</strong> をダウンロード</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">2.</span>
                <span>インストーラーを実行してインストール</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">3.</span>
                <span>このアプリを<strong className="text-white">再起動</strong></span>
              </li>
            </ol>
          </div>

          <p className="text-xs text-white/40">
            NDI® は NewTek/Vizrt の登録商標です。NDI Tools は無料で提供されています。
          </p>
        </div>

        {/* フッター */}
        <div className="px-6 pb-6 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            後で
          </button>
          <div className="flex gap-3">
            <a
              href={NDI_TOOLS_URL}
              onClick={(e) => { e.preventDefault(); openUrl(NDI_TOOLS_URL); }}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            >
              ndi.tv を開く
            </a>
            {isWindows && (
              <a
                href={NDI_RUNTIME_URL_WIN}
                onClick={(e) => { e.preventDefault(); openUrl(NDI_RUNTIME_URL_WIN); }}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                NDI Tools をダウンロード
              </a>
            )}
            {!isWindows && (
              <a
                href={NDI_TOOLS_URL}
                onClick={(e) => { e.preventDefault(); openUrl(NDI_TOOLS_URL); }}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                NDI Tools をダウンロード
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
