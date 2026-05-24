/**
 * VideoGrid.tsx
 *
 * 【通常モード】 ドラッグ&ドロップで位置入れ替え可能なグリッド
 * 【フォーカスモード】 逆L字型レイアウト
 *
 *  ┌──────────────────────┬──────┐
 *  │                      │ Sub  │  ← 固定幅サムネイル
 *  │   MAIN（1fr × 1fr）  ├──────┤
 *  │                      │ Sub  │
 *  ├───────┬───────┬───────┴──────┤
 *  │  Sub  │  Sub  │  Sub  │ Sub  │  ← 固定高サムネイル
 *  └───────┴───────┴───────┴──────┘
 *
 * メインエリアは 1fr で残りスペースをすべて埋める（レスポンシブ）。
 * サブセルは固定 SUB_W × SUB_H px（画面に合わせて clamp）。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCell } from './VideoCell';
import { LocalVideoCell } from './LocalVideoCell';
import { CellContextMenu, ContextMenuItem } from './CellContextMenu';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useDeviceStore } from '../stores/useDeviceStore';
import { api } from '../bridge/api';

interface VideoGridProps {
  sites: Site[];
  streamStatuses: StreamState[];
}

const LOCAL_ID = '__local__';

// ── 通常グリッドの列数・行数 ──────────────────────────────
function calcGrid(count: number): { cols: number; rows: number } {
  if (count <= 1)  return { cols: 1, rows: 1 };
  if (count <= 4)  return { cols: 2, rows: 2 };
  if (count <= 6)  return { cols: 3, rows: 2 };
  if (count <= 9)  return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

// ── 逆L字型グリッド寸法 ──────────────────────────────────
interface FocusGridDef {
  totalCols: number;
  totalRows: number;
  mainColSpan: number;
  mainRowSpan: number;
}

function getFocusGrid(subCount: number): FocusGridDef {
  const candidates: FocusGridDef[] = [
    { totalCols: 2, totalRows: 2, mainColSpan: 1, mainRowSpan: 1 },
    { totalCols: 3, totalRows: 2, mainColSpan: 2, mainRowSpan: 1 },
    { totalCols: 3, totalRows: 3, mainColSpan: 2, mainRowSpan: 2 },
    { totalCols: 4, totalRows: 3, mainColSpan: 3, mainRowSpan: 2 },
    { totalCols: 4, totalRows: 4, mainColSpan: 3, mainRowSpan: 3 },
    { totalCols: 5, totalRows: 4, mainColSpan: 4, mainRowSpan: 3 },
    { totalCols: 6, totalRows: 4, mainColSpan: 5, mainRowSpan: 3 },
    { totalCols: 5, totalRows: 5, mainColSpan: 4, mainRowSpan: 3 },
    { totalCols: 6, totalRows: 5, mainColSpan: 4, mainRowSpan: 3 },
    { totalCols: 6, totalRows: 5, mainColSpan: 4, mainRowSpan: 4 },
    { totalCols: 7, totalRows: 5, mainColSpan: 5, mainRowSpan: 4 },
    { totalCols: 7, totalRows: 6, mainColSpan: 5, mainRowSpan: 4 },
  ];
  for (const c of candidates) {
    const rightSlots  = (c.totalCols - c.mainColSpan) * c.mainRowSpan;
    const bottomSlots = c.totalCols * (c.totalRows - c.mainRowSpan);
    if (rightSlots + bottomSlots >= subCount) return c;
  }
  return { totalCols: 8, totalRows: 6, mainColSpan: 6, mainRowSpan: 4 };
}

interface CellPos { col: number; row: number; }

function buildSubPositions({ totalCols, totalRows, mainColSpan, mainRowSpan }: FocusGridDef): CellPos[] {
  const positions: CellPos[] = [];
  for (let row = 1; row <= mainRowSpan; row++) {
    for (let col = mainColSpan + 1; col <= totalCols; col++) {
      positions.push({ col, row });
    }
  }
  for (let row = mainRowSpan + 1; row <= totalRows; row++) {
    for (let col = 1; col <= totalCols; col++) {
      positions.push({ col, row });
    }
  }
  return positions;
}

// サブセルの固定サイズ（CSS clamp で画面サイズ適応）
const SUB_COL = 'clamp(140px, 16vw, 210px)';
const SUB_ROW = 'clamp(90px, 10vw, 130px)';

interface CellItem { id: string; isLocal: boolean; site?: Site; }

// ── コンテキストメニューの状態 ──────────────────────────
interface CtxMenu { x: number; y: number; id: string; isLocal: boolean; }

// ════════════════════════════════════════════════════════
export const VideoGrid: React.FC<VideoGridProps> = ({ sites, streamStatuses }) => {
  const gridLayout    = useConfigStore(s => s.config?.ui.gridLayout ?? 'auto');
  const focusOnClick  = useConfigStore(s => s.config?.ui.focusOnClick ?? true);
  const siteName      = useConfigStore(s => s.config?.siteName ?? '自拠点');
  const configSites   = useConfigStore(s => s.config?.sites ?? []);
  const setConfig     = useConfigStore(s => s.setConfig);
  const role          = useAuthStore(s => s.role);
  const isFull        = role === 'full';
  const cameraEnabled  = useDeviceStore(s => s.cameraEnabled);
  const micEnabled     = useDeviceStore(s => s.micEnabled);
  const toggleCamera   = useDeviceStore(s => s.toggleCamera);
  const toggleMic      = useDeviceStore(s => s.toggleMic);
  const storeSiteVol   = useDeviceStore(s => s.setSiteVolume);

  const enabledSites = sites.filter(s => s.enabled);
  const visibleSites = enabledSites.filter(s => !s.hidden);
  const hiddenSites  = enabledSites.filter(s =>  s.hidden);

  // ── 表示順 ──────────────────────────────────────────
  const [cellOrder, setCellOrder] = useState<string[]>(() =>
    isFull ? [LOCAL_ID, ...visibleSites.map(s => s.id)] : visibleSites.map(s => s.id)
  );
  useEffect(() => {
    const newIds = isFull
      ? [LOCAL_ID, ...visibleSites.map(s => s.id)]
      : visibleSites.map(s => s.id);
    setCellOrder(prev => {
      const kept  = prev.filter(id => newIds.includes(id));
      const added = newIds.filter(id => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [sites, isFull]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── フォーカス ──────────────────────────────────────
  const [focusedIds, setFocusedIds] = useState<string[]>([]);

  // ── 音声状態（拠点ごと）────────────────────────────
  const [siteMuted,       setSiteMuted]       = useState<Record<string, boolean>>({});
  const [siteVolumes,     setSiteVolumes]      = useState<Record<string, number>>({});    // 0–100
  const [siteVideoHidden, setSiteVideoHidden]  = useState<Record<string, boolean>>({});

  // ── コンテキストメニュー ────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // ── ドラッグ ──────────────────────────────────────
  const dragSrc  = useRef<string | null>(null);
  const dragZone = useRef<'main' | 'sub' | 'grid' | null>(null);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ハンドラー
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleHide = useCallback((id: string) => {
    if (id === LOCAL_ID) return;
    setConfig({ sites: configSites.map(s => s.id === id ? { ...s, hidden: true } : s) });
    setFocusedIds(prev => prev.filter(x => x !== id));
  }, [configSites, setConfig]);

  const handleShow = useCallback((id: string) => {
    setConfig({ sites: configSites.map(s => s.id === id ? { ...s, hidden: false } : s) });
  }, [configSites, setConfig]);

  const handleClick = useCallback((id: string) => {
    if (!focusOnClick) return;
    setFocusedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, [focusOnClick]);

  // ミュートトグル
  const handleMuteToggle = useCallback((id: string) => {
    setSiteMuted(prev => {
      const muted = !prev[id];
      const vol   = muted ? 0 : (siteVolumes[id] ?? 80);
      storeSiteVol(id, vol);
      return { ...prev, [id]: muted };
    });
  }, [siteVolumes, storeSiteVol]);

  // 音量変更
  const handleVolumeChange = useCallback((id: string, vol: number) => {
    setSiteVolumes(prev => ({ ...prev, [id]: vol }));
    storeSiteVol(id, vol);
    if (vol > 0 && siteMuted[id]) {
      setSiteMuted(prev => ({ ...prev, [id]: false }));
    }
  }, [siteMuted, storeSiteVol]);

  // 映像表示トグル
  const handleVideoToggle = useCallback((id: string) => {
    setSiteVideoHidden(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // 右クリック
  const handleContextMenu = useCallback((e: React.MouseEvent, id: string, isLocal: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id, isLocal });
  }, []);

  // ドラッグ
  const onDragStart = useCallback((id: string, zone: 'main' | 'sub' | 'grid') => {
    dragSrc.current  = id;
    dragZone.current = zone;
  }, []);

  const onDropTo = useCallback((targetId: string, targetZone: 'main' | 'sub' | 'grid') => {
    const src     = dragSrc.current;
    const srcZone = dragZone.current;
    dragSrc.current  = null;
    dragZone.current = null;
    if (!src || src === targetId) return;

    if (srcZone === 'sub'  && targetZone === 'main') {
      setFocusedIds(prev => prev.includes(src) ? prev : [...prev, src]);
    } else if (srcZone === 'main' && targetZone === 'sub') {
      setFocusedIds(prev => prev.filter(x => x !== src));
    } else {
      setCellOrder(prev => {
        const arr = [...prev];
        const si = arr.indexOf(src);
        const ti = arr.indexOf(targetId);
        if (si !== -1 && ti !== -1) [arr[si], arr[ti]] = [arr[ti], arr[si]];
        return arr;
      });
    }
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // コンテキストメニュー項目の構築
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const buildMenuItems = useCallback((id: string, isLocal: boolean): ContextMenuItem[] => {
    if (isLocal) {
      // 自拠点メニュー
      return [
        {
          type: 'toggle', icon: '📷', label: 'カメラ ON/OFF',
          checked: cameraEnabled,
          onClick: () => toggleCamera(),
        },
        {
          type: 'toggle', icon: '🎤', label: 'マイク ON/OFF',
          checked: micEnabled,
          onClick: () => toggleMic(),
        },
      ];
    }
    // リモート拠点メニュー
    const muted = siteMuted[id] ?? false;
    const vol   = siteVolumes[id] ?? 80;
    const videoHidden = siteVideoHidden[id] ?? false;
    return [
      {
        type: 'toggle', icon: muted ? '🔇' : '🔊',
        label: muted ? 'ミュート解除' : 'スピーカーミュート',
        checked: muted,
        onClick: () => handleMuteToggle(id),
      },
      {
        type: 'slider', icon: '🔊', label: '音量',
        sliderValue: vol, sliderMin: 0, sliderMax: 100,
        onSliderChange: v => handleVolumeChange(id, v),
      },
      { type: 'separator' },
      {
        type: 'toggle', icon: '🎥', label: '映像を表示',
        checked: !videoHidden,
        onClick: () => handleVideoToggle(id),
      },
      {
        type: 'action', icon: '👁️', label: 'グリッドから非表示',
        onClick: () => handleHide(id),
      },
    ];
  }, [
    cameraEnabled, micEnabled, siteMuted, siteVolumes, siteVideoHidden,
    toggleCamera, toggleMic, handleMuteToggle, handleVolumeChange,
    handleVideoToggle, handleHide,
  ]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 順序付きセル一覧
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const orderedCells: CellItem[] = cellOrder
    .map(id => {
      if (id === LOCAL_ID && isFull) return { id: LOCAL_ID, isLocal: true };
      const site = visibleSites.find(s => s.id === id);
      if (!site) return null;
      return { id, isLocal: false, site };
    })
    .filter((x): x is CellItem => x !== null);

  // ── セルレンダーヘルパー ──────────────────────────
  const renderCell = (cell: CellItem, zone: 'main' | 'sub' | 'grid') => {
    if (cell.isLocal) {
      return (
        <LocalVideoCell
          siteName={siteName}
          focused={focusedIds.includes(cell.id)}
          onClick={() => handleClick(cell.id)}
          onContextMenu={e => handleContextMenu(e, cell.id, true)}
          onDragStart={() => onDragStart(cell.id, zone)}
          onDrop={() => onDropTo(cell.id, zone)}
        />
      );
    }
    return (
      <VideoCell
        site={cell.site!}
        streamState={streamStatuses.find(s => s.siteId === cell.id)}
        focused={focusedIds.includes(cell.id)}
        muted={siteMuted[cell.id] ?? false}
        volume={siteVolumes[cell.id] ?? 80}
        videoHidden={siteVideoHidden[cell.id] ?? false}
        onClick={() => handleClick(cell.id)}
        onMuteToggle={() => handleMuteToggle(cell.id)}
        onHide={() => handleHide(cell.id)}
        onContextMenu={e => handleContextMenu(e, cell.id, false)}
        onDragStart={() => onDragStart(cell.id, zone)}
        onDrop={() => onDropTo(cell.id, zone)}
      />
    );
  };

  // ── 非表示拠点パネル ─────────────────────────────
  const hiddenPanel = hiddenSites.length > 0 && (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-wrap gap-2 justify-center pointer-events-auto">
      {hiddenSites.map(site => (
        <button
          key={site.id}
          className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white
            text-xs px-3 py-1 rounded-full border border-white/20 transition"
          onClick={() => handleShow(site.id)}
        >
          👁️ {site.name.slice(0, 8)} を表示
        </button>
      ))}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // フォーカスモード（逆L字型・メインがレスポンシブ）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (focusedIds.length > 0) {
    const focusedCells = focusedIds
      .map(id => orderedCells.find(c => c.id === id))
      .filter((x): x is CellItem => !!x);
    const subCells = orderedCells.filter(c => !focusedIds.includes(c.id));

    const gridDef = getFocusGrid(subCells.length);
    const subPositions = buildSubPositions(gridDef);
    const { mainColSpan, mainRowSpan, totalCols, totalRows } = gridDef;

    const subColCount = totalCols - mainColSpan;
    const subRowCount = totalRows - mainRowSpan;

    // メイン = 1fr（残り全部），サブ = 固定サムネイルサイズ
    const colTemplate = subColCount > 0
      ? `repeat(${mainColSpan}, 1fr) repeat(${subColCount}, ${SUB_COL})`
      : `1fr`;
    const rowTemplate = subRowCount > 0
      ? `repeat(${mainRowSpan}, 1fr) repeat(${subRowCount}, ${SUB_ROW})`
      : `1fr`;

    return (
      <div className="relative w-full h-full">
        {hiddenPanel}
        <div
          className="w-full h-full p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            gridTemplateRows: rowTemplate,
            gap: '4px',
          }}
        >
          {/* ── メインエリア（フォーカス拠点を縦積み）── */}
          <div
            style={{
              gridColumn: `1 / span ${mainColSpan}`,
              gridRow: `1 / span ${mainRowSpan}`,
              minHeight: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const src = dragSrc.current;
              if (src && dragZone.current === 'sub') {
                setFocusedIds(prev => prev.includes(src) ? prev : [...prev, src]);
                dragSrc.current  = null;
                dragZone.current = null;
              }
            }}
          >
            {focusedCells.map(cell => (
              <div key={cell.id} className="flex-1 min-h-0 min-w-0">
                {renderCell(cell, 'main')}
              </div>
            ))}
          </div>

          {/* ── サブセル（固定サムネイルサイズ）── */}
          {subCells.map((cell, i) => {
            const pos = subPositions[i];
            if (!pos) return null;
            return (
              <div
                key={cell.id}
                style={{ gridColumn: pos.col, gridRow: pos.row, minHeight: 0, minWidth: 0 }}
                className="h-full w-full"
              >
                {renderCell(cell, 'sub')}
              </div>
            );
          })}
        </div>

        {/* ── コンテキストメニュー ── */}
        {ctxMenu && (
          <CellContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={buildMenuItems(ctxMenu.id, ctxMenu.isLocal)}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 通常グリッドモード
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const totalCount = orderedCells.length;
  let cols: number, rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0]; rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(totalCount));
  }

  return (
    <div className="relative w-full h-full">
      {hiddenPanel}
      <div
        className="w-full h-full p-1"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: '4px',
        }}
      >
        {orderedCells.map(cell => (
          <div key={cell.id} className="h-full min-h-0 min-w-0">
            {renderCell(cell, 'grid')}
          </div>
        ))}
      </div>

      {/* ── コンテキストメニュー ── */}
      {ctxMenu && (
        <CellContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildMenuItems(ctxMenu.id, ctxMenu.isLocal)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
