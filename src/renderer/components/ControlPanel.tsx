/**
 * ControlPanel.tsx
 *
 * 下部コントロールバー。
 * 各デバイスボタンの右に「▾」プルダウンを配置し、
 * システムが認識しているデバイスを選択できる。
 *
 *  ┌─────────┬─┐  ┌─────────┬─┐  ┌─────────┬─┐  ┌──────────────┐  ┌──────┐
 *  │📷カメラ │▾│  │🎤マイク │▾│  │🔊音声  │▾│  │音量スライダー│  │全ミュ│
 *  └─────────┴─┘  └─────────┴─┘  └─────────┴─┘  └──────────────┘  └──────┘
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore } from '../stores/useDeviceStore';
import { useAuthStore } from '../stores/useAuthStore';

const isMac = navigator.platform.includes('Mac');
const modKey = isMac ? '⌘' : 'Ctrl';

// ════════════════════════════════════════════════════════
// デバイスドロップダウン共通コンポーネント
// ════════════════════════════════════════════════════════
interface DeviceOption { deviceId: string; label: string; }

interface DeviceDropdownProps {
  devices: DeviceOption[];
  selectedId: string;
  onSelect: (deviceId: string) => void;
  /** ドロップダウンが開いているか */
  open: boolean;
  onToggle: () => void;
  /** 有効 / 無効 */
  enabled: boolean;
  emptyLabel?: string;
}

const DeviceDropdown: React.FC<DeviceDropdownProps> = ({
  devices, selectedId, onSelect, open, onToggle, enabled, emptyLabel = 'デバイスなし',
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    // 次のループで登録（自分を開いたクリックを拾わないよう）
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler); };
  }, [open, onToggle]);

  const selectedLabel = devices.find(d => d.deviceId === selectedId)?.label
    ?? (devices[0]?.label ?? 'デフォルト');

  return (
    <div ref={ref} className="relative">
      {/* ▾ ボタン */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        title="デバイスを選択"
        className={`h-full px-1.5 flex items-center justify-center border-l transition-colors
          ${enabled
            ? 'border-white/15 text-white/50 hover:text-white hover:bg-white/10'
            : 'border-white/8 text-white/20 cursor-default'}`}
        disabled={!enabled}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* ドロップダウンメニュー */}
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          w-60 bg-gray-900 border border-white/15 rounded-xl shadow-2xl py-1 z-50
          max-h-64 overflow-y-auto">
          {/* 現在選択中のデバイス表示 */}
          <div className="px-3 py-1.5 border-b border-white/8 mb-1">
            <span className="text-xs text-white/35 block truncate">{selectedLabel}</span>
          </div>

          {devices.length === 0 ? (
            <div className="px-3 py-3 text-xs text-white/30 text-center">{emptyLabel}</div>
          ) : (
            devices.map(dev => {
              const isSelected = selectedId
                ? dev.deviceId === selectedId
                : dev.deviceId === devices[0]?.deviceId;
              return (
                <button
                  key={dev.deviceId}
                  onClick={() => { onSelect(dev.deviceId); onToggle(); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors
                    ${isSelected
                      ? 'text-blue-300 bg-blue-600/15'
                      : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                >
                  <span className="w-3 shrink-0 text-blue-400">
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="2 6 5 9 10 3"/>
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{dev.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// デバイスボタングループ（トグル + プルダウン）
// ════════════════════════════════════════════════════════
interface DeviceButtonGroupProps {
  /** ボタンのラベル */
  label: string;
  /** ON/OFF 状態 */
  enabled: boolean;
  /** ON/OFF 切替 */
  onToggle: () => void;
  /** アイコン */
  icon: React.ReactNode;
  /** ショートカットヒント */
  shortcut?: string;
  /** 非表示 */
  hidden?: boolean;
  /** デバイス一覧 */
  devices: DeviceOption[];
  selectedId: string;
  onSelectDevice: (id: string) => void;
}

const DeviceButtonGroup: React.FC<DeviceButtonGroupProps> = ({
  label, enabled, onToggle, icon, shortcut, hidden,
  devices, selectedId, onSelectDevice,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const toggleDropdown = useCallback(() => setDropdownOpen(v => !v), []);

  if (hidden) return null;

  return (
    <div
      className={`flex items-stretch rounded-lg overflow-visible h-14 transition-colors
        ${enabled ? 'bg-blue-600' : 'bg-white/10'}`}
      title={shortcut}
    >
      {/* メインボタン（ON/OFF） */}
      <button
        onClick={onToggle}
        className={`flex flex-col items-center justify-center gap-1 px-3 text-xs font-medium
          transition-colors min-w-[52px]
          ${enabled ? 'text-white' : 'text-white/50 hover:text-white/80'}`}
      >
        {icon}
        <span>{label}</span>
      </button>

      {/* デバイス選択 ▾ */}
      <DeviceDropdown
        devices={devices}
        selectedId={selectedId}
        onSelect={onSelectDevice}
        open={dropdownOpen}
        onToggle={toggleDropdown}
        enabled={true}
      />
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ControlPanel 本体
// ════════════════════════════════════════════════════════
export const ControlPanel: React.FC = () => {
  const {
    cameraEnabled, micEnabled, speakerEnabled, masterVolume,
    cameraDevices, micDevices, speakerDevices,
    selectedCameraId, selectedMicId, selectedSpeakerId,
    toggleCamera, toggleMic, toggleSpeaker,
    setMasterVolume, muteAll,
    setSelectedCamera, setSelectedMic, setSelectedSpeaker,
  } = useDeviceStore();

  const role   = useAuthStore(s => s.role);
  const isFull = role === 'full';

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      switch (e.key.toLowerCase()) {
        case 'v': if (isFull) toggleCamera();  break;
        case 'm': if (isFull) toggleMic();     break;
        case 's': toggleSpeaker(); break;
        case 'a': muteAll();       break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFull, toggleCamera, toggleMic, toggleSpeaker, muteAll]);

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-black/80 border-t border-white/10 min-h-[72px]">

      {/* ── カメラ ── */}
      <DeviceButtonGroup
        label="カメラ"
        enabled={cameraEnabled}
        onToggle={toggleCamera}
        icon={<CameraIcon on={cameraEnabled} />}
        shortcut={`カメラ ON/OFF (${modKey}+Shift+V)`}
        hidden={!isFull}
        devices={cameraDevices}
        selectedId={selectedCameraId}
        onSelectDevice={setSelectedCamera}
      />

      {/* ── マイク ── */}
      <DeviceButtonGroup
        label="マイク"
        enabled={micEnabled}
        onToggle={toggleMic}
        icon={<MicIcon on={micEnabled} />}
        shortcut={`マイク ON/OFF (${modKey}+Shift+M)`}
        hidden={!isFull}
        devices={micDevices}
        selectedId={selectedMicId}
        onSelectDevice={setSelectedMic}
      />

      {/* ── スピーカー（音声出力）── */}
      <DeviceButtonGroup
        label="音声出力"
        enabled={speakerEnabled}
        onToggle={toggleSpeaker}
        icon={<SpeakerIcon on={speakerEnabled} />}
        shortcut={`スピーカー ON/OFF (${modKey}+Shift+S)`}
        devices={speakerDevices}
        selectedId={selectedSpeakerId}
        onSelectDevice={setSelectedSpeaker}
      />

      {/* 区切り */}
      <div className="w-px h-10 bg-white/10 mx-1" />

      {/* ── 音量スライダー ── */}
      <div className="flex flex-col gap-1 min-w-[120px]">
        <div className="flex items-center justify-between">
          <label className="text-white/50 text-xs">マスター音量</label>
          <span className="text-white/40 text-xs font-mono">{Math.round(masterVolume * 100)}%</span>
        </div>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={masterVolume}
          onChange={e => setMasterVolume(parseFloat(e.target.value))}
          className="w-full accent-blue-500 h-1.5 cursor-pointer"
        />
      </div>

      {/* ── 全ミュート ── */}
      <button
        onClick={muteAll}
        title={`全ミュート (${modKey}+Shift+A)`}
        className="ml-1 px-3 h-10 rounded-lg bg-red-700/60 hover:bg-red-600
          text-white text-xs font-medium transition-colors whitespace-nowrap"
      >
        全ミュート
      </button>

      {/* ── ショートカットヒント ── */}
      <div className="ml-auto text-white/20 text-xs text-right leading-relaxed hidden xl:block">
        {isFull && <div>{modKey}+Shift+V　カメラ</div>}
        {isFull && <div>{modKey}+Shift+M　マイク</div>}
        <div>{modKey}+Shift+S　スピーカー</div>
        <div>{modKey}+Shift+A　全ミュート</div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// アイコン
// ════════════════════════════════════════════════════════
const CameraIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </>
    ) : (
      <>
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34m-7.72-2.06A4 4 0 1112 8"/>
      </>
    )}
  </svg>
);

const MicIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
      </>
    ) : (
      <>
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
        <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/>
      </>
    )}
  </svg>
);

const SpeakerIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>
      </>
    ) : (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </>
    )}
  </svg>
);
