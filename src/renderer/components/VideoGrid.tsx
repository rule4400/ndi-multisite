/**
 * VideoGrid.tsx
 *
 * 【通常モード】 拠点数に応じた自動グリッド（calcGrid）
 *   - ドラッグ&ドロップで位置の入れ替え
 *   - ホバーで非表示ボタン
 *   - クリックでフォーカス追加
 *
 * 【フォーカスモード】 逆L字型レイアウト（フォーカス拠点 ≥ 1）
 *   - 左側（メインエリア）: フォーカスした拠点を縦積み
 *   - 右縦列 + 下横列: サブ拠点
 *   - フォーカス拠点へサブをドロップ → フォーカス追加
 *   - サブエリアへフォーカスをドロップ → フォーカス解除
 *   - クリックでフォーカス追加/解除
 *
 * 【非表示管理】
 *   - 各セルのホバーボタンで非表示（hidden=true）
 *   - 画面上の「非表示中」パネルから再表示
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCell } from './VideoCell';
import { LocalVideoCell } from './LocalVideoCell';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';

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
    const rightSlots = (c.totalCols - c.mainColSpan) * c.mainRowSpan;
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

// セル情報
interface CellItem { id: string; isLocal: boolean; site?: Site; }

// ────────────────────────────────────────────────────────
export const VideoGrid: React.FC<VideoGridProps> = ({ sites, streamStatuses }) => {
  const gridLayout   = useConfigStore(s => s.config?.ui.gridLayout ?? 'auto');
  const focusOnClick = useConfigStore(s => s.config?.ui.focusOnClick ?? true);
  const siteName     = useConfigStore(s => s.config?.siteName ?? '自拠点');
  const configSites  = useConfigStore(s => s.config?.sites ?? []);
  const setConfig    = useConfigStore(s => s.setConfig);
  const role         = useAuthStore(s => s.role);
  const isFull       = role === 'full';

  const enabledSites = sites.filter(s => s.enabled);
  const visibleSites = enabledSites.filter(s => !s.hidden);
  const hiddenSites  = enabledSites.filter(s => s.hidden);

  // セル表示順（ドラッグで入れ替え）
  const [cellOrder, setCellOrder] = useState<string[]>(() =>
    isFull ? [LOCAL_ID, ...visibleSites.map(s => s.id)] : visibleSites.map(s => s.id)
  );

  // sites 変化に追随
  useEffect(() => {
    const newIds = isFull
      ? [LOCAL_ID, ...visibleSites.map(s => s.id)]
      : visibleSites.map(s => s.id);
    setCellOrder(prev => {
      const kept   = prev.filter(id => newIds.includes(id));
      const added  = newIds.filter(id => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [sites, isFull]);  // eslint-disable-line react-hooks/exhaustive-deps

  // フォーカスID一覧（複数可）
  const [focusedIds, setFocusedIds] = useState<string[]>([]);

  // ドラッグ状態
  const dragSrc  = useRef<string | null>(null);
  const dragZone = useRef<'main' | 'sub' | 'grid' | null>(null);

  // ── 非表示 / 再表示 ──
  const handleHide = useCallback((id: string) => {
    if (id === LOCAL_ID) return;
    const updated = configSites.map(s => s.id === id ? { ...s, hidden: true } : s);
    setConfig({ sites: updated });
    setFocusedIds(prev => prev.filter(x => x !== id));
  }, [configSites, setConfig]);

  const handleShow = useCallback((id: string) => {
    const updated = configSites.map(s => s.id === id ? { ...s, hidden: false } : s);
    setConfig({ sites: updated });
  }, [configSites, setConfig]);

  // ── クリックでフォーカス切り替え ──
  const handleClick = useCallback((id: string) => {
    if (!focusOnClick) return;
    setFocusedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, [focusOnClick]);

  // ── ドラッグ操作 ──
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

    if (srcZone === 'sub' && targetZone === 'main') {
      // サブ → メイン: フォーカス追加
      setFocusedIds(prev => prev.includes(src) ? prev : [...prev, src]);
    } else if (srcZone === 'main' && targetZone === 'sub') {
      // メイン → サブ: フォーカス解除
      setFocusedIds(prev => prev.filter(x => x !== src));
    } else {
      // 同ゾーン or グリッド: 位置を入れ替え
      setCellOrder(prev => {
        const arr = [...prev];
        const si = arr.indexOf(src);
        const ti = arr.indexOf(targetId);
        if (si !== -1 && ti !== -1) [arr[si], arr[ti]] = [arr[ti], arr[si]];
        return arr;
      });
    }
  }, []);

  // ── 順序通りに並べたセル一覧 ──
  const orderedCells: CellItem[] = cellOrder
    .map(id => {
      if (id === LOCAL_ID && isFull) return { id: LOCAL_ID, isLocal: true };
      const site = visibleSites.find(s => s.id === id);
      if (!site) return null;
      return { id, isLocal: false, site };
    })
    .filter((x): x is CellItem => x !== null);

  // ── レンダーヘルパー ──
  const renderCell = (cell: CellItem, zone: 'main' | 'sub' | 'grid') => {
    const isFocused = focusedIds.includes(cell.id);
    if (cell.isLocal) {
      return (
        <LocalVideoCell
          siteName={siteName}
          focused={isFocused}
          onClick={() => handleClick(cell.id)}
          onDragStart={() => onDragStart(cell.id, zone)}
          onDrop={() => onDropTo(cell.id, zone)}
        />
      );
    }
    return (
      <VideoCell
        site={cell.site!}
        streamState={streamStatuses.find(s => s.siteId === cell.id)}
        focused={isFocused}
        onClick={() => handleClick(cell.id)}
        onHide={() => handleHide(cell.id)}
        onDragStart={() => onDragStart(cell.id, zone)}
        onDrop={() => onDropTo(cell.id, zone)}
      />
    );
  };

  // ── 非表示拠点パネル ──
  const hiddenPanel = hiddenSites.length > 0 && (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex flex-wrap gap-2 justify-center">
      {hiddenSites.map(site => (
        <button
          key={site.id}
          className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1 rounded-full border border-white/20 transition"
          onClick={() => handleShow(site.id)}
        >
          <EyeIcon />
          {site.name.slice(0, 8)} を表示
        </button>
      ))}
    </div>
  );

  // ════════════════════════════════════════════════════
  // フォーカスモード（逆L字型）
  // ════════════════════════════════════════════════════
  if (focusedIds.length > 0) {
    const focusedCells = focusedIds
      .map(id => orderedCells.find(c => c.id === id))
      .filter((x): x is CellItem => !!x);
    const subCells = orderedCells.filter(c => !focusedIds.includes(c.id));

    const gridDef = getFocusGrid(subCells.length);
    const subPositions = buildSubPositions(gridDef);
    const { totalCols, totalRows, mainColSpan, mainRowSpan } = gridDef;

    return (
      <div className="relative w-full h-full">
        {hiddenPanel}
        <div
          className="w-full h-full p-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
            gridTemplateRows: `repeat(${totalRows}, 1fr)`,
            gap: '4px',
          }}
        >
          {/* ── メインエリア（フォーカス拠点を縦積み）── */}
          <div
            style={{
              gridColumn: `1 / span ${mainColSpan}`,
              gridRow: `1 / span ${mainRowSpan}`,
              minHeight: 0,
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
              <div
                key={cell.id}
                className="flex-1 min-h-0"
              >
                {renderCell(cell, 'main')}
              </div>
            ))}
          </div>

          {/* ── サブセル（右縦列 → 下横列）── */}
          {subCells.map((cell, i) => {
            const pos = subPositions[i];
            if (!pos) return null;
            return (
              <div
                key={cell.id}
                style={{ gridColumn: pos.col, gridRow: pos.row, minHeight: 0 }}
                className="h-full"
              >
                {renderCell(cell, 'sub')}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // 通常グリッドモード
  // ════════════════════════════════════════════════════
  const totalCount = orderedCells.length;
  let cols: number, rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0];
    rows = parts[1];
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
          <div key={cell.id} className="h-full min-h-0">
            {renderCell(cell, 'grid')}
          </div>
        ))}
      </div>
    </div>
  );
};

const EyeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
