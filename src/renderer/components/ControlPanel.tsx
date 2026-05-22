import React, { useEffect } from 'react';
import { useDeviceStore } from '../stores/useDeviceStore';
import { useAuthStore } from '../stores/useAuthStore';

const isMac = navigator.platform.includes('Mac');
const modKey = isMac ? '⌘' : 'Ctrl';

interface IconButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({ active, onClick, title, children, hidden }) => {
  if (hidden) return null;
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-lg text-xs font-medium transition-colors
        ${active
          ? 'bg-blue-600 text-white'
          : 'bg-white/10 text-white/50 hover:bg-white/20'
        }`}
    >
      {children}
    </button>
  );
};

export const ControlPanel: React.FC = () => {
  const {
    cameraEnabled, micEnabled, speakerEnabled, masterVolume,
    toggleCamera, toggleMic, toggleSpeaker, setMasterVolume, muteAll,
  } = useDeviceStore();
  const role = useAuthStore(s => s.role);
  const isFull = role === 'full';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      switch (e.key.toLowerCase()) {
        case 'v': if (isFull) toggleCamera(); break;
        case 'm': if (isFull) toggleMic(); break;
        case 's': toggleSpeaker(); break;
        case 'a': muteAll(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFull, toggleCamera, toggleMic, toggleSpeaker, muteAll]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-black/80 border-t border-white/10">
      <IconButton
        active={cameraEnabled}
        onClick={toggleCamera}
        title={`カメラ ON/OFF (${modKey}+Shift+V)`}
        hidden={!isFull}
      >
        <CameraIcon on={cameraEnabled} />
        <span>カメラ</span>
      </IconButton>

      <IconButton
        active={micEnabled}
        onClick={toggleMic}
        title={`マイク ON/OFF (${modKey}+Shift+M)`}
        hidden={!isFull}
      >
        <MicIcon on={micEnabled} />
        <span>マイク</span>
      </IconButton>

      <IconButton
        active={speakerEnabled}
        onClick={toggleSpeaker}
        title={`スピーカー ON/OFF (${modKey}+Shift+S)`}
      >
        <SpeakerIcon on={speakerEnabled} />
        <span>音声</span>
      </IconButton>

      <div className="flex flex-col gap-1 ml-2">
        <label className="text-white/60 text-xs">音量</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={e => setMasterVolume(parseFloat(e.target.value))}
          className="w-28 accent-blue-500"
        />
      </div>

      <button
        onClick={muteAll}
        title={`全ミュート (${modKey}+Shift+A)`}
        className="ml-2 px-3 h-10 rounded-lg bg-red-700/60 hover:bg-red-600 text-white text-xs font-medium transition-colors"
      >
        全ミュート
      </button>

      <div className="ml-auto text-white/30 text-xs text-right">
        <div>{modKey}+Shift+V カメラ</div>
        <div>{modKey}+Shift+M マイク</div>
        <div>{modKey}+Shift+S スピーカー</div>
        <div>{modKey}+Shift+A 全ミュート</div>
      </div>
    </div>
  );
};

const CameraIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </>
    ) : (
      <>
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h4a2 2 0 012 2v9.34m-7.72-2.06A4 4 0 1112 8" />
      </>
    )}
  </svg>
);

const MicIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
      </>
    ) : (
      <>
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
        <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
      </>
    )}
  </svg>
);

const SpeakerIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {on ? (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
      </>
    ) : (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    )}
  </svg>
);
