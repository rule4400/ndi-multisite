import React, { useState, useEffect } from 'react';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { Site, MonitorInfo, UserRole } from '../../shared/types';
import { api } from '../bridge/api';
// ランダムIDはcrypto.randomUUID()で生成

interface Props {
  onClose: () => void;
}

type Tab = 'sites' | 'network' | 'video' | 'display' | 'account' | 'sync';

export const SettingsView: React.FC<Props> = ({ onClose }) => {
  const role = useAuthStore(s => s.role);
  const isFull = role === 'full';
  const [activeTab, setActiveTab] = useState<Tab>('sites');

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: 'sites', label: '拠点設定' },
    { id: 'network', label: 'ネットワーク' },
    { id: 'video', label: '映像品質' },
    { id: 'display', label: '表示設定' },
    { id: 'account', label: 'アカウント', hidden: !isFull },
    { id: 'sync', label: '設定同期', hidden: !isFull },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">設定</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-white/10">
          {tabs.filter(t => !t.hidden).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors
                ${activeTab === t.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-white/50 hover:text-white/80'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'sites' && <SitesTab readonly={!isFull} />}
          {activeTab === 'network' && <NetworkTab />}
          {activeTab === 'video' && <VideoTab />}
          {activeTab === 'display' && <DisplayTab />}
          {activeTab === 'account' && isFull && <AccountTab />}
          {activeTab === 'sync' && isFull && <SyncTab />}
        </div>
      </div>
    </div>
  );
};

const SitesTab: React.FC<{ readonly: boolean }> = ({ readonly }) => {
  const { config, addSite, removeSite } = useConfigStore();
  const [newName, setNewName] = useState('');
  const [newNdi, setNewNdi] = useState('');
  const [newIp, setNewIp] = useState('');

  const handleAdd = async () => {
    if (!newName || !newNdi) return;
    const site: Site = {
      id: crypto.randomUUID(),
      name: newName,
      ndiSourceName: newNdi,
      vpnIp: newIp,
      enabled: true,
    };
    await addSite(site);
    setNewName(''); setNewNdi(''); setNewIp('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {config?.sites.map(site => (
          <div key={site.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium truncate">{site.name}</div>
              <div className="text-white/50 text-xs truncate">{site.ndiSourceName} · {site.vpnIp}</div>
            </div>
            {!readonly && (
              <button
                onClick={() => removeSite(site.id)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>

      {!readonly && (
        <div className="border border-white/10 rounded-lg p-4 space-y-3">
          <h3 className="text-white/70 text-sm font-medium">拠点を追加</h3>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="拠点名（例: 本部）"
            className="w-full px-3 py-2 rounded bg-gray-800 text-white text-sm border border-white/10 outline-none focus:border-blue-500"
          />
          <input
            value={newNdi}
            onChange={e => setNewNdi(e.target.value)}
            placeholder="NDIソース名（例: HQ-Camera）"
            className="w-full px-3 py-2 rounded bg-gray-800 text-white text-sm border border-white/10 outline-none focus:border-blue-500"
          />
          <input
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            placeholder="VPN IPアドレス（例: 10.0.0.1）"
            className="w-full px-3 py-2 rounded bg-gray-800 text-white text-sm border border-white/10 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAdd}
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            追加
          </button>
        </div>
      )}
    </div>
  );
};

const NetworkTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();
  const [ip, setIp] = useState(config?.discoveryServerIp ?? '');
  const [ndiName, setNdiName] = useState(config?.ndiSourceName ?? '');
  const [siteName, setSiteName] = useState(config?.siteName ?? '');

  return (
    <div className="space-y-4">
      <Field label="自拠点名（グリッドに表示される名前）">
        <input
          value={siteName}
          onChange={e => setSiteName(e.target.value)}
          onBlur={() => setConfig({ siteName })}
          placeholder="例: 本部"
          className="input"
        />
      </Field>
      <Field label="Discovery Server IP">
        <input
          value={ip}
          onChange={e => setIp(e.target.value)}
          onBlur={() => setConfig({ discoveryServerIp: ip })}
          placeholder="例: 10.0.0.100"
          className="input"
        />
      </Field>
      <Field label="自拠点 NDI ソース名">
        <input
          value={ndiName}
          onChange={e => setNdiName(e.target.value)}
          onBlur={() => setConfig({ ndiSourceName: ndiName })}
          placeholder="例: NDI-Multisite-Local"
          className="input"
        />
      </Field>
    </div>
  );
};

const VideoTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();

  return (
    <div className="space-y-4">
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
  );
};

const DisplayTab: React.FC = () => {
  const { config, setConfig } = useConfigStore();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    api.getMonitors().then(setMonitors);
  }, []);

  return (
    <div className="space-y-4">
      <Field label="グリッドレイアウト">
        <select
          value={config?.ui.gridLayout}
          onChange={e => setConfig({ ui: { ...config!.ui, gridLayout: e.target.value as any } })}
          className="input"
        >
          <option value="auto">自動</option>
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
      <label className="flex items-center gap-3 text-white/70">
        <input
          type="checkbox"
          checked={config?.ui.startFullscreen}
          onChange={e => setConfig({ ui: { ...config!.ui, startFullscreen: e.target.checked } })}
          className="w-4 h-4 accent-blue-500"
        />
        起動時フルスクリーン
      </label>
      <label className="flex items-center gap-3 text-white/70">
        <input
          type="checkbox"
          checked={config?.ui.showSiteLabels}
          onChange={e => setConfig({ ui: { ...config!.ui, showSiteLabels: e.target.checked } })}
          className="w-4 h-4 accent-blue-500"
        />
        拠点名を表示
      </label>
      <label className="flex items-center gap-3 text-white/70">
        <input
          type="checkbox"
          checked={config?.ui.focusOnClick}
          onChange={e => setConfig({ ui: { ...config!.ui, focusOnClick: e.target.checked } })}
          className="w-4 h-4 accent-blue-500"
        />
        クリックでフォーカス拡大
      </label>
    </div>
  );
};

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
    <div className="space-y-4">
      <Field label="Full Access パスワード変更">
        <input
          type="password"
          value={fullPw}
          onChange={e => setFullPw(e.target.value)}
          placeholder="新しいパスワード"
          className="input"
        />
      </Field>
      <Field label="View Only パスワード変更">
        <input
          type="password"
          value={viewPw}
          onChange={e => setViewPw(e.target.value)}
          placeholder="新しいパスワード"
          className="input"
        />
      </Field>
      <button
        onClick={handleSave}
        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
      >
        {saved ? '保存しました' : '保存'}
      </button>
    </div>
  );
};

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
    if (found) {
      setHostIp(found);
      setStatus(`ホストを発見: ${found}`);
    } else {
      setStatus('ホストが見つかりませんでした');
    }
  };

  return (
    <div className="space-y-5">
      {/* モード選択 */}
      <div>
        <label className="block text-sm text-white/60 mb-2">同期モード</label>
        <div className="flex gap-2">
          {(['none', 'host', 'client'] as const).map(m => (
            <button
              key={m}
              onClick={() => save({ mode: m })}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors
                ${sync.mode === m ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
            >
              {m === 'none' ? '同期なし' : m === 'host' ? 'ホスト（配信）' : 'クライアント（受信）'}
            </button>
          ))}
        </div>
      </div>

      {/* ホストモードの説明 */}
      {sync.mode === 'host' && (
        <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200 space-y-1">
          <p className="font-medium">📡 ホストモード（配信中）</p>
          <p>このPCが拠点設定を配信します。他のPCはこのPCのIPアドレスを「クライアント」に設定してください。</p>
          <p className="text-blue-300">ポート {sync.port} で待機中</p>
        </div>
      )}

      {/* クライアントモードの設定 */}
      {sync.mode === 'client' && (
        <div className="space-y-3">
          <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 text-sm text-green-200">
            <p className="font-medium">📥 クライアントモード</p>
            <p>ホストPCのIPアドレスを入力してください。{sync.intervalSec}秒ごとに自動同期します。</p>
          </div>

          <Field label="ホストのIPアドレス">
            <div className="flex gap-2">
              <input
                value={hostIp}
                onChange={e => setHostIp(e.target.value)}
                onBlur={() => save({ hostIp })}
                placeholder="例: 192.168.1.100"
                className="input flex-1"
              />
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white/70 text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {discovering ? '検索中...' : '自動検出'}
              </button>
            </div>
          </Field>

          <div className="flex gap-3">
            <Field label="ポート番号">
              <input
                value={port}
                onChange={e => setPort(e.target.value)}
                onBlur={() => save({ port: Number(port) })}
                className="input w-28"
                type="number"
              />
            </Field>
            <Field label="同期間隔（秒）">
              <input
                value={interval}
                onChange={e => setInterval_(e.target.value)}
                onBlur={() => save({ intervalSec: Number(interval) })}
                className="input w-28"
                type="number"
                min="10"
              />
            </Field>
          </div>

          <button
            onClick={handleSyncNow}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
          >
            今すぐ同期
          </button>
        </div>
      )}

      {/* ポート設定（ホストのみ） */}
      {sync.mode === 'host' && (
        <Field label="ポート番号">
          <input
            value={port}
            onChange={e => setPort(e.target.value)}
            onBlur={() => save({ port: Number(port) })}
            className="input w-28"
            type="number"
          />
        </Field>
      )}

      {/* ステータス */}
      {status && (
        <p className="text-sm text-white/60 bg-white/5 rounded px-3 py-2">{status}</p>
      )}

      {/* 使い方ガイド */}
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

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="block text-sm text-white/60">{label}</label>
    {children}
  </div>
);
