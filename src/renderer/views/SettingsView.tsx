import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useStreamStore } from '../stores/useStreamStore';
import { Site, MonitorInfo, UserRole, NDISource } from '../../shared/types';
import { api } from '../bridge/api';

interface Props {
  onClose: () => void;
}

type Tab = 'sites' | 'network' | 'video' | 'display' | 'account' | 'sync';

// ── タブ定義 ──────────────────────────────────────────────
const TAB_LABELS: Record<Tab, { icon: string; label: string }> = {
  sites:   { icon: '📡', label: '拠点設定' },
  network: { icon: '🌐', label: 'ネットワーク' },
  video:   { icon: '🎥', label: '映像品質' },
  display: { icon: '🖥️', label: '表示設定' },
  account: { icon: '🔑', label: 'アカウント' },
  sync:    { icon: '🔄', label: '設定同期' },
};

// ════════════════════════════════════════════════════════
export const SettingsView: React.FC<Props> = ({ onClose }) => {
  const role = useAuthStore(s => s.role);
  const isFull = role === 'full';
  const [activeTab, setActiveTab] = useState<Tab>('sites');

  const visibleTabs: Tab[] = isFull
    ? ['sites', 'network', 'video', 'display', 'account', 'sync']
    : ['sites', 'network', 'video', 'display'];

  // Esc キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* モーダル本体：固定サイズ */}
      <div className="w-[800px] h-[560px] bg-gray-900 rounded-2xl shadow-2xl flex overflow-hidden">

        {/* ── 左サイドバー ── */}
        <aside className="w-44 bg-gray-950/60 flex flex-col py-4 shrink-0 border-r border-white/8">
          <div className="px-4 mb-5">
            <h2 className="text-white font-semibold text-base">設定</h2>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {visibleTabs.map(tab => {
              const { icon, label } = TAB_LABELS[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors
                    ${activeTab === tab
                      ? 'bg-blue-600/25 text-blue-300 font-medium'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
                >
                  <span className="text-base w-5 text-center">{icon}</span>
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="px-4 pt-2 border-t border-white/8 mt-2">
            <button
              onClick={onClose}
              className="w-full py-2 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              閉じる（Esc）
            </button>
          </div>
        </aside>

        {/* ── 右コンテンツエリア（固定高さ・スクロール） ── */}
        <main className="flex-1 overflow-y-auto p-6 min-w-0">
          {activeTab === 'sites'   && <SitesTab readonly={!isFull} />}
          {activeTab === 'network' && <NetworkTab />}
          {activeTab === 'video'   && <VideoTab />}
          {activeTab === 'display' && <DisplayTab />}
          {activeTab === 'account' && isFull && <AccountTab />}
          {activeTab === 'sync'    && isFull && <SyncTab />}
        </main>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// 拠点設定タブ
// ════════════════════════════════════════════════════════

interface SiteFormValues {
  name: string;
  ndiSourceName: string;
  vpnIp: string;
  enabled: boolean;
}
const EMPTY_FORM: SiteFormValues = { name: '', ndiSourceName: '', vpnIp: '', enabled: true };

// ── フォーム（追加・編集共通）──────────────────────────
const SiteForm: React.FC<{
  initial?: SiteFormValues;
  onSave: (v: SiteFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}> = ({ initial = EMPTY_FORM, onSave, onCancel, submitLabel }) => {
  const [v, setV] = useState<SiteFormValues>(initial);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const inputCls = 'w-full px-3 py-2 rounded bg-gray-800 text-white text-sm border border-white/10 outline-none focus:border-blue-500 transition-colors';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-white/50 mb-1">拠点名 <span className="text-red-400">*</span></label>
          <input ref={nameRef} value={v.name}
            onChange={e => setV(p => ({ ...p, name: e.target.value }))}
            placeholder="例: 本部" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">VPN IPアドレス</label>
          <input value={v.vpnIp}
            onChange={e => setV(p => ({ ...p, vpnIp: e.target.value }))}
            placeholder="例: 10.0.0.1" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-white/50 mb-1">
          NDIソース名
          <span className="ml-1.5 text-white/30 font-normal">（空欄の場合はVPN IPから自動検出）</span>
        </label>
        <input value={v.ndiSourceName}
          onChange={e => setV(p => ({ ...p, ndiSourceName: e.target.value }))}
          placeholder="例: HQ-Camera（省略可）" className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer select-none">
        <input type="checkbox" checked={v.enabled}
          onChange={e => setV(p => ({ ...p, enabled: e.target.checked }))}
          className="w-4 h-4 accent-blue-500" />
        接続を有効にする
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { if (v.name) onSave(v); }}
          disabled={!v.name}
          className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  );
};

// ── NDIソース選択ドロップダウン ──────────────────────────
const SourceSelector: React.FC<{
  site: Site;
  sources: NDISource[];
  currentStatus?: { connected: boolean };
  onConnect: (sourceName: string) => void;
  onDisconnect: () => void;
}> = ({ site, sources, currentStatus, onConnect, onDisconnect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // サイトに関連しそうなソースを優先表示（VPN IPを含むもの）
  const siteRelated = sources.filter(s =>
    site.vpnIp ? s.urlAddress?.includes(site.vpnIp) : false
  );
  const others = sources.filter(s =>
    !siteRelated.some(r => r.name === s.name)
  );
  const sortedSources = [...siteRelated, ...others];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isConnected = currentStatus?.connected ?? false;
  const dotCls = isConnected ? 'bg-green-400 animate-pulse' : 'bg-white/20';

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
        <button
          onClick={() => setOpen(o => !o)}
          className={`text-xs px-2 py-1 rounded border transition-colors
            ${isConnected
              ? 'border-green-600/40 bg-green-900/20 text-green-300 hover:bg-green-900/40'
              : 'border-white/15 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}
        >
          {isConnected ? '接続中 ▾' : 'ソース選択 ▾'}
        </button>
        {isConnected && (
          <button
            onClick={onDisconnect}
            className="text-xs px-1.5 py-1 rounded border border-red-600/30 bg-red-900/10 text-red-400 hover:bg-red-900/30 transition-colors"
            title="切断"
          >
            切断
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-white/15 rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
          {sortedSources.length === 0 ? (
            <div className="px-3 py-4 text-xs text-white/40 text-center">
              NDIソースが見つかりません<br />
              <span className="text-white/25">ネットワーク上の配信を待機中...</span>
            </div>
          ) : (
            <>
              {siteRelated.length > 0 && (
                <div className="px-3 py-1 text-xs text-white/30 font-medium">この拠点のIP ({site.vpnIp})</div>
              )}
              {siteRelated.map(src => (
                <button key={src.name}
                  onClick={() => { onConnect(src.name); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors">
                  <div className="font-medium truncate">{src.name}</div>
                  <div className="text-xs text-white/35 truncate">{src.urlAddress}</div>
                </button>
              ))}
              {others.length > 0 && siteRelated.length > 0 && (
                <div className="border-t border-white/10 my-1" />
              )}
              {others.length > 0 && (
                <div className="px-3 py-1 text-xs text-white/30 font-medium">その他のソース</div>
              )}
              {others.map(src => (
                <button key={src.name}
                  onClick={() => { onConnect(src.name); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors">
                  <div className="truncate">{src.name}</div>
                  <div className="text-xs text-white/30 truncate">{src.urlAddress}</div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── 拠点行 ──────────────────────────────────────────────
const SiteRow: React.FC<{
  site: Site;
  readonly: boolean;
  sources: NDISource[];
  streamStatus?: { connected: boolean };
  onUpdate: (patch: Partial<Omit<Site, 'id'>>) => void;
  onRemove: () => void;
  onConnect: (sourceName: string) => void;
  onDisconnect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}> = ({ site, readonly, sources, streamStatus, onUpdate, onRemove, onConnect, onDisconnect,
        onDragStart, onDragOver, onDrop }) => {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (editing) {
    return (
      <div className="bg-blue-950/40 border border-blue-500/40 rounded-lg px-4 py-3">
        <div className="text-xs text-blue-300 font-medium mb-3">✏️ 「{site.name}」を編集</div>
        <SiteForm
          initial={{ name: site.name, ndiSourceName: site.ndiSourceName, vpnIp: site.vpnIp, enabled: site.enabled }}
          onSave={v => { onUpdate(v); setEditing(false); }}
          onCancel={() => setEditing(false)}
          submitLabel="保存"
        />
      </div>
    );
  }

  return (
    <div
      draggable={!readonly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group flex items-center gap-2.5 bg-white/5 hover:bg-white/8 rounded-lg px-3 py-2.5 transition-colors"
    >
      {/* ドラッグハンドル */}
      {!readonly && (
        <div className="text-white/20 group-hover:text-white/40 cursor-grab active:cursor-grabbing select-none shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
          </svg>
        </div>
      )}

      {/* 有効/無効トグル */}
      {!readonly && (
        <button
          onClick={() => onUpdate({ enabled: !site.enabled })}
          title={site.enabled ? '無効にする' : '有効にする'}
          className={`w-8 h-5 rounded-full transition-colors shrink-0 relative ${site.enabled ? 'bg-blue-600' : 'bg-white/20'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
            ${site.enabled ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      )}

      {/* 情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${site.enabled ? 'text-white' : 'text-white/40'}`}>
            {site.name}
          </span>
          {!site.enabled && (
            <span className="text-xs text-white/30 bg-white/10 px-1.5 py-0.5 rounded shrink-0">無効</span>
          )}
        </div>
        <div className="text-xs text-white/35 truncate">
          {site.vpnIp && <span>{site.vpnIp}</span>}
          {site.ndiSourceName && <span className="ml-1.5 text-white/25">· {site.ndiSourceName}</span>}
          {!site.vpnIp && !site.ndiSourceName && <span className="text-white/20">未設定</span>}
        </div>
      </div>

      {/* NDIソース選択 */}
      {site.enabled && (
        <SourceSelector
          site={site}
          sources={sources}
          currentStatus={streamStatus}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      )}

      {/* 操作ボタン */}
      {!readonly && (
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            title="編集"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={() => { onRemove(); setConfirmDelete(false); }}
                className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
              >
                削除確認
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/60 text-xs transition-colors"
              >
                戻る
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded hover:bg-red-600/20 text-white/50 hover:text-red-400 transition-colors"
              title="削除"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── 拠点タブ本体 ─────────────────────────────────────────
const SitesTab: React.FC<{ readonly: boolean }> = ({ readonly }) => {
  const { config, addSite, removeSite, updateSite, reorderSites } = useConfigStore();
  const { statuses, sources } = useStreamStore();
  const [showAdd, setShowAdd] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sites = config?.sites ?? [];

  const handleAdd = async (v: SiteFormValues) => {
    const site: Site = { id: crypto.randomUUID(), ...v };
    await addSite(site);
    setShowAdd(false);
  };

  const handleDrop = useCallback((targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const arr = [...sites];
    const si = arr.findIndex(s => s.id === draggingId);
    const ti = arr.findIndex(s => s.id === targetId);
    if (si === -1 || ti === -1) return;
    const [item] = arr.splice(si, 1);
    arr.splice(ti, 0, item);
    reorderSites(arr);
    setDraggingId(null);
  }, [draggingId, sites, reorderSites]);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="接続拠点"
        description="各拠点のNDIストリームを管理します。VPN IPを設定すると映像を自動検出します。"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-white/35">
          {sites.length} 拠点 · 検出中ソース {sources.length} 件
          {!readonly && ' · ドラッグで並び替え'}
        </span>
        {!readonly && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            拠点を追加
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {sites.map(site => (
          <SiteRow
            key={site.id}
            site={site}
            readonly={readonly}
            sources={sources}
            streamStatus={statuses.find(s => s.siteId === site.id)}
            onUpdate={patch => updateSite(site.id, patch)}
            onRemove={() => removeSite(site.id)}
            onConnect={sourceName => api.connectSite(site.id, sourceName)}
            onDisconnect={() => api.disconnectSite(site.id)}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(site.id); }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleDrop(site.id); }}
          />
        ))}
        {sites.length === 0 && (
          <div className="text-center py-10 text-white/25 text-sm">
            拠点が登録されていません
          </div>
        )}
      </div>

      {!readonly && showAdd && (
        <div className="border border-white/10 rounded-lg p-4">
          <div className="text-xs text-white/50 font-medium mb-3">➕ 新しい拠点を追加</div>
          <SiteForm onSave={handleAdd} onCancel={() => setShowAdd(false)} submitLabel="追加" />
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ネットワークタブ
// ════════════════════════════════════════════════════════
const NetworkTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();
  const [siteName, setSiteName] = useState(config?.siteName ?? '');
  const [ip, setIp] = useState(config?.discoveryServerIp ?? '');
  const [ndiName, setNdiName] = useState(config?.ndiSourceName ?? '');

  return (
    <div className="space-y-5">
      <SectionHeader title="ネットワーク設定" description="自拠点の配信名・NDI Discovery サーバーの設定を行います。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="自拠点名">
          <input value={siteName} onChange={e => setSiteName(e.target.value)}
            onBlur={() => setConfig({ siteName })}
            placeholder="例: 本部" className="input" />
        </Field>
        <Field label="自拠点 NDI ソース名">
          <input value={ndiName} onChange={e => setNdiName(e.target.value)}
            onBlur={() => setConfig({ ndiSourceName: ndiName })}
            placeholder="例: NDI-Multisite-Local" className="input" />
        </Field>
      </div>
      <Field label="NDI Discovery Server IP">
        <input value={ip} onChange={e => setIp(e.target.value)}
          onBlur={() => setConfig({ discoveryServerIp: ip })}
          placeholder="例: 10.0.0.100（省略可）" className="input" />
        <p className="text-xs text-white/30 mt-1">
          Discovery Server を使わない場合は空欄のままにしてください。
        </p>
      </Field>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// 映像品質タブ
// ════════════════════════════════════════════════════════
const VideoTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();

  return (
    <div className="space-y-5">
      <SectionHeader title="映像品質" description="自拠点から送信する映像の解像度とフレームレートを設定します。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="解像度">
          <select
            value={config?.video.resolution}
            onChange={e => setConfig({ video: { ...config!.video, resolution: e.target.value as any } })}
            className="input"
          >
            <option value="1280x720">720p (1280×720)</option>
            <option value="1920x1080">1080p (1920×1080)</option>
          </select>
        </Field>
        <Field label="フレームレート">
          <select
            value={config?.video.frameRate}
            onChange={e => setConfig({ video: { ...config!.video, frameRate: Number(e.target.value) as any } })}
            className="input"
          >
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </Field>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// 表示設定タブ
// ════════════════════════════════════════════════════════
const DisplayTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => { api.getMonitors().then(setMonitors); }, []);

  return (
    <div className="space-y-5">
      <SectionHeader title="表示設定" description="グリッドレイアウトや表示モニターを設定します。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="グリッドレイアウト">
          <select
            value={config?.ui.gridLayout}
            onChange={e => setConfig({ ui: { ...config!.ui, gridLayout: e.target.value as any } })}
            className="input"
          >
            <option value="auto">自動（ウィンドウに最適化）</option>
            <option value="2x2">2×2</option>
            <option value="3x3">3×3</option>
            <option value="4x4">4×4</option>
          </select>
        </Field>
        <Field label="表示モニター">
          <select
            value={config?.ui.targetMonitorIndex}
            onChange={e => setConfig({ ui: { ...config!.ui, targetMonitorIndex: Number(e.target.value) } })}
            className="input"
          >
            {monitors.map(m => (
              <option key={m.index} value={m.index}>{m.label}{m.isPrimary ? ' (メイン)' : ''}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="space-y-3">
        <Toggle
          label="起動時フルスクリーン"
          checked={config?.ui.startFullscreen ?? false}
          onChange={v => setConfig({ ui: { ...config!.ui, startFullscreen: v } })}
        />
        <Toggle
          label="拠点名ラベルを表示"
          checked={config?.ui.showSiteLabels ?? true}
          onChange={v => setConfig({ ui: { ...config!.ui, showSiteLabels: v } })}
        />
        <Toggle
          label="クリックでフォーカス拡大"
          checked={config?.ui.focusOnClick ?? true}
          onChange={v => setConfig({ ui: { ...config!.ui, focusOnClick: v } })}
        />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// アカウントタブ
// ════════════════════════════════════════════════════════
const AccountTab: React.FC = () => {
  const { setPassword } = useAuthStore();
  const [fullPw, setFullPw] = useState('');
  const [viewPw, setViewPw] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (fullPw) await setPassword('full' as UserRole, fullPw);
    if (viewPw) await setPassword('viewonly' as UserRole, viewPw);
    setFullPw(''); setViewPw('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="アカウント" description="ログインパスワードを変更します。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full Access パスワード">
          <input type="password" value={fullPw} onChange={e => setFullPw(e.target.value)}
            placeholder="新しいパスワード" className="input" />
        </Field>
        <Field label="View Only パスワード">
          <input type="password" value={viewPw} onChange={e => setViewPw(e.target.value)}
            placeholder="新しいパスワード" className="input" />
        </Field>
      </div>
      <button
        onClick={handleSave}
        className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        {saved ? '✓ 保存しました' : '保存'}
      </button>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// 設定同期タブ
// ════════════════════════════════════════════════════════
const SyncTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();
  const sync = config?.sync ?? { mode: 'none', hostIp: '', port: 34567, intervalSec: 30 };
  const [hostIp, setHostIp] = useState(sync.hostIp);
  const [port, setPort] = useState(String(sync.port));
  const [interval, setInterval_] = useState(String(sync.intervalSec));
  const [status, setStatus] = useState('');
  const [discovering, setDiscovering] = useState(false);

  const save = (patch: Partial<typeof sync>) => {
    setConfig({ sync: { ...sync, ...patch, port: Number(port), intervalSec: Number(interval) } });
  };

  const handleSyncNow = async () => {
    setStatus('同期中...');
    const result = await api.syncNow();
    setStatus(result.message);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setStatus('ホストを検索中...');
    const found = await api.discoverHost(Number(port), hostIp || '192.168.1.1');
    setDiscovering(false);
    if (found) { setHostIp(found); setStatus(`ホストを発見: ${found}`); }
    else setStatus('ホストが見つかりませんでした');
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="設定同期" description="複数PCで拠点設定を自動共有します。" />

      <div>
        <label className="block text-sm text-white/60 mb-2">同期モード</label>
        <div className="flex gap-2">
          {(['none', 'host', 'client'] as const).map(m => (
            <button key={m} onClick={() => save({ mode: m })}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors
                ${sync.mode === m ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
            >
              {m === 'none' ? '同期なし' : m === 'host' ? 'ホスト（配信）' : 'クライアント（受信）'}
            </button>
          ))}
        </div>
      </div>

      {sync.mode === 'host' && (
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200 space-y-1">
          <p className="font-medium">📡 ホストモード（配信中）</p>
          <p>他のPCはこのPCのIPアドレスを「クライアント」に設定してください。</p>
          <p className="text-blue-300">ポート {sync.port} で待機中</p>
        </div>
      )}

      {sync.mode === 'client' && (
        <div className="space-y-3">
          <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 text-sm text-green-200">
            <p className="font-medium">📥 クライアントモード</p>
            <p>ホストPCのIPアドレスを入力してください。{sync.intervalSec}秒ごとに自動同期します。</p>
          </div>
          <Field label="ホストのIPアドレス">
            <div className="flex gap-2">
              <input value={hostIp} onChange={e => setHostIp(e.target.value)}
                onBlur={() => save({ hostIp })} placeholder="例: 192.168.1.100"
                className="input flex-1" />
              <button onClick={handleDiscover} disabled={discovering}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm disabled:opacity-50 whitespace-nowrap">
                {discovering ? '検索中...' : '自動検出'}
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ポート番号">
              <input value={port} onChange={e => setPort(e.target.value)}
                onBlur={() => save({ port: Number(port) })} className="input" type="number" />
            </Field>
            <Field label="同期間隔（秒）">
              <input value={interval} onChange={e => setInterval_(e.target.value)}
                onBlur={() => save({ intervalSec: Number(interval) })} className="input" type="number" min="10" />
            </Field>
          </div>
          <button onClick={handleSyncNow}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            今すぐ同期
          </button>
        </div>
      )}

      {sync.mode === 'host' && (
        <Field label="ポート番号">
          <input value={port} onChange={e => setPort(e.target.value)}
            onBlur={() => save({ port: Number(port) })} className="input w-32" type="number" />
        </Field>
      )}

      {status && <p className="text-sm text-white/60 bg-white/5 rounded px-3 py-2">{status}</p>}

      <div className="border border-white/10 rounded-lg p-4 text-xs text-white/40 space-y-1">
        <p className="text-white/60 font-medium mb-2">使い方</p>
        <p>1. ホストPC（本部など）でモードを <span className="text-white/70">「ホスト（配信）」</span> に設定</p>
        <p>2. 各拠点PCでモードを <span className="text-white/70">「クライアント（受信）」</span> に設定</p>
        <p>3. クライアント側にホストPCのIPアドレスを入力</p>
        <p>4. 設定を保存すると自動的に拠点設定が同期されます</p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// 共通コンポーネント
// ════════════════════════════════════════════════════════

const SectionHeader: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-white font-semibold text-base">{title}</h3>
    {description && <p className="text-white/40 text-xs mt-1">{description}</p>}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="block text-sm text-white/60">{label}</label>
    {children}
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between py-2 border-b border-white/5 cursor-pointer group">
    <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">{label}</span>
    <div
      onClick={() => onChange(!checked)}
      className={`w-10 h-5.5 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-blue-600' : 'bg-white/20'}`}
      style={{ height: '22px' }}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
    </div>
  </label>
);
