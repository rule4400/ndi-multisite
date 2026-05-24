/**
 * VideoGrid.tsx
 *
 * 【通常モード】 拠点数に応じた自動グリッド（calcGrid）
 * 【フォーカスモード】 逆L字型レイアウト
 *
 *  ┌──────────────┬───┐
 *  │              │ R1│  ← 右縦列（mainRowSpan 行）
 *  │    MAIN      ├───┤
 *  │              │ R2│
 *  ├──────┬───────┴───┤
 *  │ B1   │ B2   │ B3 │  ← 下横列（bottomRows 行 × totalCols 列）
 *  └──────┴───────┴───┘
 *
 * グリッド次元の決定ロジック（getFocusGrid）:
 *   - subCount に応じて totalCols/totalRows/mainColSpan/mainRowSpan を返す
 *   - 右縦列スロット = (totalCols - mainColSpan) × mainRowSpan
 *   - 下横列スロット = totalCols × (totalRows - mainRowSpan)
 *   - 合計スロット ≥ subCount を保証しつつ、
 *     メインセルが幅 ~75%・高さ ~60–75% を占めるよう調整
 */

import React, { useState } from 'react';
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

// ── 通常グリッドの列数・行数計算 ──────────────────────────
function calcGrid(count: number): { cols: number; rows: number } {
  if (count <= 1)  return { cols: 1, rows: 1 };
  if (count <= 4)  return { cols: 2, rows: 2 };
  if (count <= 6)  return { cols: 3, rows: 2 };
  if (count <= 9)  return { cols: 3, rows: 3 };
  if (count <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

// ── 逆L字型グリッド寸法の計算 ────────────────────────────
interface FocusGridDef {
  totalCols: number;
  totalRows: number;
  mainColSpan: number;  // メインが占める列数
  mainRowSpan: number;  // メインが占める行数
}

function getFocusGrid(subCount: number): FocusGridDef {
  // 各設定の subs 収容可能数:
  //   rightSlots = (totalCols - mainColSpan) × mainRowSpan
  //   bottomSlots = totalCols × (totalRows - mainRowSpan)
  //   total = rightSlots + bottomSlots
  const candidates: FocusGridDef[] = [
    { totalCols: 2, totalRows: 2, mainColSpan: 1, mainRowSpan: 1 }, // max 1+2=3
    { totalCols: 3, totalRows: 2, mainColSpan: 2, mainRowSpan: 1 }, // 1+3=4
    { totalCols: 3, totalRows: 3, mainColSpan: 2, mainRowSpan: 2 }, // 2+3=5
    { totalCols: 4, totalRows: 3, mainColSpan: 3, mainRowSpan: 2 }, // 2+4=6
    { totalCols: 4, totalRows: 4, mainColSpan: 3, mainRowSpan: 3 }, // 3+4=7
    { totalCols: 5, totalRows: 4, mainColSpan: 4, mainRowSpan: 3 }, // 3+5=8
    { totalCols: 6, totalRows: 4, mainColSpan: 5, mainRowSpan: 3 }, // 3+6=9
    { totalCols: 5, totalRows: 5, mainColSpan: 4, mainRowSpan: 3 }, // 3+10=13 → 12拠点対応
    { totalCols: 6, totalRows: 5, mainColSpan: 4, mainRowSpan: 3 }, // 3+12=15
    { totalCols: 6, totalRows: 5, mainColSpan: 4, mainRowSpan: 4 }, // 4+12=16
    { totalCols: 7, totalRows: 5, mainColSpan: 5, mainRowSpan: 4 }, // 4+14=18
    { totalCols: 7, totalRows: 6, mainColSpan: 5, mainRowSpan: 4 }, // 4+14=18 → 20拠点対応
  ];

  for (const c of candidates) {
    const rightSlots = (c.totalCols - c.mainColSpan) * c.mainRowSpan;
    const bottomSlots = c.totalCols * (c.totalRows - c.mainRowSpan);
    if (rightSlots + bottomSlots >= subCount) return c;
  }

  // フォールバック
  return { totalCols: 8, totalRows: 6, mainColSpan: 6, mainRowSpan: 4 };
}

// ── 逆L字型のサブセル配置位置を生成 ────────────────────
interface CellPos {
  col: number;  // 1-indexed
  row: number;
}

function buildSubPositions({ totalCols, totalRows, mainColSpan, mainRowSpan }: FocusGridDef): CellPos[] {
  const positions: CellPos[] = [];

  // 右縦列（col = mainColSpan+1..totalCols, row = 1..mainRowSpan）
  for (let row = 1; row <= mainRowSpan; row++) {
    for (let col = mainColSpan + 1; col <= totalCols; col++) {
      positions.push({ col, row });
    }
  }

  // 下横列（col = 1..totalCols, row = mainRowSpan+1..totalRows）
  for (let row = mainRowSpan + 1; row <= totalRows; row++) {
    for (let col = 1; col <= totalCols; col++) {
      positions.push({ col, row });
    }
  }

  return positions;
}

// ────────────────────────────────────────────────────────
export const VideoGrid: React.FC<VideoGridProps> = ({ sites, streamStatuses }) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const gridLayout = useConfigStore(s => s.config?.ui.gridLayout ?? 'auto');
  const focusOnClick = useConfigStore(s => s.config?.ui.focusOnClick ?? true);
  const siteName = useConfigStore(s => s.config?.siteName ?? '自拠点');
  const role = useAuthStore(s => s.role);
  const isFull = role === 'full';

  const enabledSites = sites.filter(s => s.enabled);
  const totalCount = isFull ? enabledSites.length + 1 : enabledSites.length;

  const handleClick = (id: string) => {
    if (!focusOnClick) return;
    setFocusedId(prev => prev === id ? null : id);
  };

  // ── フォーカスモード（逆L字型） ─────────────────────────
  if (focusedId) {
    const isLocal = focusedId === LOCAL_ID;
    const focusedSite = isLocal ? null : enabledSites.find(s => s.id === focusedId);

    // サブセル一覧（自拠点 → 他拠点の順）
    const subItems: { id: string; isLocal: boolean; site?: Site }[] = [];
    if (isFull && !isLocal) subItems.push({ id: LOCAL_ID, isLocal: true });
    enabledSites
      .filter(s => s.id !== focusedId)
      .forEach(s => subItems.push({ id: s.id, isLocal: false, site: s }));

    const gridDef = getFocusGrid(subItems.length);
    const subPositions = buildSubPositions(gridDef);
    const { totalCols, totalRows, mainColSpan, mainRowSpan } = gridDef;

    return (
      <div
        className="w-full h-full p-1"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
          gridTemplateRows: `repeat(${totalRows}, 1fr)`,
          gap: '4px',
        }}
      >
        {/* ── メインセル（左上を大きく占有） ── */}
        <div
          style={{
            gridColumn: `1 / span ${mainColSpan}`,
            gridRow: `1 / span ${mainRowSpan}`,
            minHeight: 0,
          }}
          className="h-full"
        >
          {isLocal ? (
            <LocalVideoCell
              siteName={siteName}
              focused={true}
              onClick={() => handleClick(LOCAL_ID)}
            />
          ) : focusedSite ? (
            <VideoCell
              site={focusedSite}
              streamState={streamStatuses.find(s => s.siteId === focusedSite.id)}
              focused={true}
              onClick={() => handleClick(focusedSite.id)}
            />
          ) : null}
        </div>

        {/* ── サブセル（右縦列 → 下横列の順に自動配置） ── */}
        {subItems.map((item, i) => {
          const pos = subPositions[i];
          if (!pos) return null;
          return (
            <div
              key={item.id}
              className="h-full"
              style={{
                gridColumn: pos.col,
                gridRow: pos.row,
                minHeight: 0,
              }}
            >
              {item.isLocal ? (
                <LocalVideoCell
                  siteName={siteName}
                  focused={false}
                  onClick={() => handleClick(LOCAL_ID)}
                />
              ) : (
                <VideoCell
                  site={item.site!}
                  streamState={streamStatuses.find(s => s.siteId === item.id)}
                  focused={false}
                  onClick={() => handleClick(item.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── 通常グリッドモード ────────────────────────────────
  let cols: number;
  let rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0];
    rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(totalCount));
  }

  return (
    <div
      className="w-full h-full p-1"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '4px',
      }}
    >
      {isFull && (
        <LocalVideoCell
          siteName={siteName}
          focused={false}
          onClick={() => handleClick(LOCAL_ID)}
        />
      )}
      {enabledSites.map(site => (
        <VideoCell
          key={site.id}
          site={site}
          streamState={streamStatuses.find(s => s.siteId === site.id)}
          focused={false}
          onClick={() => handleClick(site.id)}
        />
      ))}
    </div>
  );
};
