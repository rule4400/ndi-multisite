/**
 * NdiInstallDialog.tsx
 *
 * NDI Runtime / Tools が見つからない場合のインストール案内ダイアログ。
 *
 * macOS:
 *   - grandiose に libndi.dylib が同梱されているため、通常はインストール不要
 *   - HX 受信を有効化するには「NDI Tools for Mac」のインストールが推奨
 *
 * Windows:
 *   - Processing.NDI.Lib.x64.dll が同梱されていないため
 *     「NDI Tools」または「NDI Runtime」のインストールが必須
 */
import React from 'react';

interface Props { onClose: () => void; }

const NDI_TOOLS_PAGE = 'https://ndi.video/tools/download/';
const NDI_TOOLS_WIN  = 'https://downloads.ndi.tv/Tools/NDI%206%20Tools.exe';
const NDI_TOOLS_MAC  = 'https://downloads.ndi.tv/Tools/Install_NDI_Tools_Mac.pkg';

// プラットフォーム判定
function detectPlatform(): 'mac' | 'win' | 'other' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac'))  return 'mac';
  if (ua.includes('win'))  return 'win';
  return 'other';
}

export const NdiInstallDialog: React.FC<Props> = ({ onClose }) => {
  const platform = detectPlatform();

  const openUrl = (url: string) => {
    (window as any).electronAPI?.openExternalUrl?.(url);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[400] p-4">
      <div className="w-full max-w-[560px] bg-gray-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* ヘッダー */}
        <div className="px-6 pt-6 pb-4 border-b border-white/8 flex items-start gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" className="text-yellow-400 shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-lg">NDI Runtime のインストールが必要です</h2>
            <p className="text-white/50 text-sm mt-1">
              {platform === 'win'
                ? 'Windows では NDI Runtime（無料）のインストールが必須です。'
                : 'NDI 機能を利用するために NDI Tools のインストールを推奨します。'}
            </p>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-4">

          {/* プラットフォーム別の手順 */}
          {platform === 'win' && (
            <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <p className="text-blue-200 font-medium text-sm">📥 Windows のインストール手順</p>
              <ol className="space-y-2 text-sm text-white/70 list-decimal list-inside">
                <li>下の「NDI Tools をダウンロード」ボタンをクリック</li>
                <li>ダウンロードした <code className="text-blue-300 bg-black/40 px-1.5 py-0.5 rounded text-xs">NDI 6 Tools.exe</code> を実行</li>
                <li>インストーラの指示に従って完了まで進める（既定設定で OK）</li>
                <li>このアプリを<strong className="text-white">再起動</strong></li>
              </ol>
              <p className="text-xs text-white/40">
                ※ NDI Tools には NDI Runtime（DLL）と HX コーデックが含まれています。
              </p>
            </div>
          )}

          {platform === 'mac' && (
            <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <p className="text-blue-200 font-medium text-sm">📥 macOS のインストール手順</p>
              <ol className="space-y-2 text-sm text-white/70 list-decimal list-inside">
                <li>下の「NDI Tools for Mac をダウンロード」ボタンをクリック</li>
                <li>ダウンロードした <code className="text-blue-300 bg-black/40 px-1.5 py-0.5 rounded text-xs">.pkg</code> を実行</li>
                <li>インストーラの指示に従って完了まで進める</li>
                <li>このアプリを<strong className="text-white">再起動</strong></li>
              </ol>
              <p className="text-xs text-white/40">
                ※ macOS では libndi.dylib がアプリに同梱されているため、
                通常 NDI Tools のインストールなしでも動作します。<br/>
                Studio Monitor や HX コーデックなど追加機能を使いたい場合のみインストールしてください。
              </p>
            </div>
          )}

          {platform === 'other' && (
            <div className="bg-yellow-950/30 border border-yellow-500/30 rounded-xl p-4 space-y-2">
              <p className="text-yellow-200 font-medium text-sm">⚠️ お使いのプラットフォームは未対応です</p>
              <p className="text-xs text-white/60">
                Windows と macOS のみサポートしています。
              </p>
            </div>
          )}

          {/* 共通の説明 */}
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <p className="text-white/70 text-sm font-medium">NDI について</p>
            <p className="text-xs text-white/50 leading-relaxed">
              このアプリは <strong className="text-white">NDI®</strong>（Network Device Interface）を使って
              ネットワーク上で映像・音声をやり取りします。
            </p>
            <p className="text-xs text-white/50 leading-relaxed">
              <strong className="text-white">NDI Tools</strong> は NewTek/Vizrt が無償提供する
              公式ツール群で、NDI Runtime（必須コンポーネント）と
              Studio Monitor / Test Patterns などの便利ツール、HX コーデックを含みます。
            </p>
            <a
              href={NDI_TOOLS_PAGE}
              onClick={(e) => { e.preventDefault(); openUrl(NDI_TOOLS_PAGE); }}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              公式サイト: ndi.video/tools/
            </a>
          </div>
        </div>

        {/* フッター */}
        <div className="px-6 pb-6 flex justify-between items-center sticky bottom-0 bg-gray-900 pt-3">
          <button
            onClick={onClose}
            className="text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            後で
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => openUrl(NDI_TOOLS_PAGE)}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            >
              公式ページを開く
            </button>
            {platform === 'win' && (
              <button
                onClick={() => openUrl(NDI_TOOLS_WIN)}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                NDI Tools をダウンロード
              </button>
            )}
            {platform === 'mac' && (
              <button
                onClick={() => openUrl(NDI_TOOLS_MAC)}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                NDI Tools for Mac をダウンロード
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
