import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  type: 'action' | 'toggle' | 'slider' | 'separator';
  label?: string;
  icon?: string;
  checked?: boolean;
  disabled?: boolean;
  sliderValue?: number;
  sliderMin?: number;
  sliderMax?: number;
  onClick?: () => void;
  onSliderChange?: (value: number) => void;
}

interface CellContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // ビューポート内に収まるよう位置補正
  const menuW = 220;
  const menuH = items.reduce((h, item) =>
    h + (item.type === 'separator' ? 9 : item.type === 'slider' ? 56 : 38), 8
  );
  const left = Math.min(x, window.innerWidth  - menuW - 8);
  const top  = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // 次のイベントループでリスナー登録（自分を開いたクリックに反応しないよう）
    const tid = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-gray-900/96 backdrop-blur border border-white/15
        rounded-xl shadow-2xl py-1 select-none"
      style={{ left, top, width: menuW }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} className="my-1 border-t border-white/10" />;
        }
        if (item.type === 'slider') {
          return (
            <div key={i} className="px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/60 text-xs flex items-center gap-1.5">
                  <span>{item.icon}</span>{item.label}
                </span>
                <span className="text-white/60 text-xs font-mono">
                  {item.sliderValue ?? 80}
                </span>
              </div>
              <input
                type="range"
                min={item.sliderMin ?? 0}
                max={item.sliderMax ?? 100}
                value={item.sliderValue ?? 80}
                className="w-full h-1 accent-blue-500 cursor-pointer"
                onChange={e => item.onSliderChange?.(Number(e.target.value))}
              />
            </div>
          );
        }
        // action / toggle
        return (
          <button
            key={i}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
              ${item.disabled
                ? 'text-white/25 cursor-not-allowed'
                : 'text-white hover:bg-white/10 active:bg-white/20 cursor-pointer'}`}
            onClick={() => { if (!item.disabled) { item.onClick?.(); onClose(); } }}
          >
            <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.type === 'toggle' && (
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                ${item.checked
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-white/30'}`}
              >
                {item.checked && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M8.5 2L4 7.5 1.5 5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
