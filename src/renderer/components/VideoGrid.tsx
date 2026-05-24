/**
 * VideoGrid.tsx
 *
 * すべてのセルを 16:9 で厳密に描画する。
 *
 * 【通常モード】
 *   ResizeObserver でコンテナサイズを実測し、
 *   cols×rows の 16:9 セルが収まる最大サイズを計算。
 *   グリッドはコンテナ中央に配置（余白は黒）。
 *
 * 【フォーカスモード】
 *   ┌──────────────────────┬──────┐
 *   │  MAIN  │  MAIN(opt) │ Sub  │  ← 固定 SUB_W×SUB_H (16:9)
 *   │ (16:9) │            │ Sub  │
 *   │        │            │ Sub  │
 *   └──────────────────────┴──────┘
 *   メインは残り幅を 16:9 で最大化。サブは右側に列で並ぶ。
 *   フォーカス 2 拠点は横並び（各 16:9）。
 */

import React, {
  useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo,
} from 'react';
import { Site, StreamState } from '../../shared/types';
import { VideoCell } from './VideoCell';
import { LocalVideoCell } from './LocalVideoCell';
import { CellContextMenu, ContextMenuItem } from './CellContextMenu';
import { useConfigStore } from '../stores/useConfigStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useDeviceStore } from '../stores/useDeviceStore';

interface VideoGridProps {
  sites: Site[];
  streamStatuses: StreamState[];
}

const LOCAL_ID  = '__local__';
const GAP       = 4;    // セル間のギャップ (px)
const SUB_W     = 192;  // サブセル幅 (px)  ← 16:9
const SUB_H     = 108;  // サブセル高 (px)  ← 16:9  (192*9/16=108)
const MAX_FOCUS = 2;    // フォーカス最大数

// 通常グリッドの列・行数
function calcGrid(n: number): { cols: number; rows: number } {
  if (n <= 1)  return { cols: 1, rows: 1 };
  if (n <= 4)  return { cols: 2, rows: 2 };
  if (n <= 6)  return { cols: 3, rows: 2 };
  if (n <= 9)  return { cols: 3, rows: 3 };
  if (n <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: 4 };
}

// 16:9 セルサイズを計算（コンテナに収まる最大サイズ）
function calc16x9Cell(
  containerW: number, containerH: number,
  cols: number, rows: number,
): { cellW: number; cellH: number } {
  if (containerW <= 0 || containerH <= 0) return { cellW: 0, cellH: 0 };
  // 幅基準
  const wByW = (containerW - GAP * (cols - 1)) / cols;
  const hByW = wByW * 9 / 16;
  if (hByW * rows + GAP * (rows - 1) <= containerH) {
    return { cellW: wByW, cellH: hByW };
  }
  // 高さ基準
  const hByH = (containerH - GAP * (rows - 1)) / rows;
  return { cellW: hByH * 16 / 9, cellH: hByH };
}

interface CellItem { id: string; isLocal: boolean; site?: Site; }
interface CtxMenu  { x: number; y: number; id: string; isLocal: boolean; }

// ════════════════════════════════════════════════════════
export const VideoGrid: React.FC<VideoGridProps> = ({ sites, streamStatuses }) => {
  const gridLayout    = useConfigStore(s => s.config?.ui.gridLayout ?? 'auto');
  const focusOnClick  = useConfigStore(s => s.config?.ui.focusOnClick ?? true);
  const siteName      = useConfigStore(s => s.config?.siteName ?? '自拠点');
  const configSites   = useConfigStore(s => s.config?.sites ?? []);
  const setConfig     = useConfigStore(s => s.setConfig);
  const role          = useAuthStore(s => s.role);
  const isFull        = role === 'full';
  const cameraEnabled = useDeviceStore(s => s.cameraEnabled);
  const micEnabled    = useDeviceStore(s => s.micEnabled);
  const toggleCamera  = useDeviceStore(s => s.toggleCamera);
  const toggleMic     = useDeviceStore(s => s.toggleMic);
  const storeSiteVol  = useDeviceStore(s => s.setSiteVolume);

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
  }, [sites, isFull]); // eslint-disable-line

  // ── フォーカス（最大 MAX_FOCUS 件）──────────────────
  const [focusedIds, setFocusedIds] = useState<string[]>([]);

  // ── 音声・映像状態 ───────────────────────────────────
  const [siteMuted,       setSiteMuted]      = useState<Record<string, boolean>>({});
  const [siteVolumes,     setSiteVolumes]     = useState<Record<string, number>>({});
  const [siteVideoHidden, setSiteVideoHidden] = useState<Record<string, boolean>>({});

  // ── コンテキストメニュー ────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // ── ドラッグ ──────────────────────────────────────
  const dragSrc  = useRef<string | null>(null);
  const dragZone = useRef<'main' | 'sub' | 'grid' | null>(null);

  // ── コンテナサイズ（ResizeObserver）────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [cW, setCW] = useState(0);
  const [cH, setCH] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCW(r.width);
      setCH(r.height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    setFocusedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_FOCUS) return prev;
      return [...prev, id];
    });
  }, [focusOnClick]);

  const handleMuteToggle = useCallback((id: string) => {
    setSiteMuted(prev => {
      const muted = !prev[id];
      storeSiteVol(id, muted ? 0 : (siteVolumes[id] ?? 80));
      return { ...prev, [id]: muted };
    });
  }, [siteVolumes, storeSiteVol]);

  const handleVolumeChange = useCallback((id: string, vol: number) => {
    setSiteVolumes(prev => ({ ...prev, [id]: vol }));
    storeSiteVol(id, vol);
    if (vol > 0) setSiteMuted(prev => ({ ...prev, [id]: false }));
  }, [storeSiteVol]);

  const handleVideoToggle = useCallback((id: string) => {
    setSiteVideoHidden(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string, isLocal: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id, isLocal });
  }, []);

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
      setFocusedIds(prev => prev.length < MAX_FOCUS && !prev.includes(src) ? [...prev, src] : prev);
    } else if (srcZone === 'main' && targetZone === 'sub') {
      setFocusedIds(prev => prev.filter(x => x !== src));
    } else {
      setCellOrder(prev => {
        const a = [...prev], si = a.indexOf(src), ti = a.indexOf(targetId);
        if (si !== -1 && ti !== -1) [a[si], a[ti]] = [a[ti], a[si]];
        return a;
      });
    }
  }, []);

  // ── コンテキストメニュー項目 ────────────────────────
  const buildMenuItems = useCallback((id: string, isLocal: boolean): ContextMenuItem[] => {
    if (isLocal) {
      return [
        { type: 'toggle', icon: '📷', label: 'カメラ ON/OFF', checked: cameraEnabled, onClick: () => toggleCamera() },
        { type: 'toggle', icon: '🎤', label: 'マイク ON/OFF',  checked: micEnabled,    onClick: () => toggleMic()    },
      ];
    }
    const muted = siteMuted[id] ?? false;
    const vol   = siteVolumes[id] ?? 80;
    const videoHidden = siteVideoHidden[id] ?? false;
    return [
      { type: 'toggle', icon: muted ? '🔇' : '🔊', label: muted ? 'ミュート解除' : 'スピーカーミュート',
        checked: muted, onClick: () => handleMuteToggle(id) },
      { type: 'slider', icon: '🔊', label: '音量', sliderValue: vol, sliderMin: 0, sliderMax: 100,
        onSliderChange: v => handleVolumeChange(id, v) },
      { type: 'separator' },
      { type: 'toggle', icon: '🎥', label: '映像を表示', checked: !videoHidden, onClick: () => handleVideoToggle(id) },
      { type: 'action', icon: '👁️', label: 'グリッドから非表示', onClick: () => handleHide(id) },
    ];
  }, [cameraEnabled, micEnabled, siteMuted, siteVolumes, siteVideoHidden,
      toggleCamera, toggleMic, handleMuteToggle, handleVolumeChange, handleVideoToggle, handleHide]);

  // ── 順序付きセル一覧 ─────────────────────────────────
  const orderedCells = useMemo<CellItem[]>(() =>
    cellOrder
      .map(id => {
        if (id === LOCAL_ID && isFull) return { id: LOCAL_ID, isLocal: true };
        const site = visibleSites.find(s => s.id === id);
        return site ? { id, isLocal: false, site } : null;
      })
      .filter((x): x is CellItem => x !== null),
    [cellOrder, isFull, visibleSites]
  );

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
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20
      flex flex-wrap gap-2 justify-center pointer-events-auto">
      {hiddenSites.map(site => (
        <button key={site.id}
          className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white
            text-xs px-3 py-1 rounded-full border border-white/20 transition"
          onClick={() => handleShow(site.id)}>
          👁️ {site.name.slice(0, 8)} を表示
        </button>
      ))}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // フォーカスモード
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (focusedIds.length > 0) {
    const focusedCells = focusedIds
      .map(id => orderedCells.find(c => c.id === id))
      .filter((x): x is CellItem => !!x);
    const subCells = orderedCells.filter(c => !focusedIds.includes(c.id));
    const focusCount = focusedCells.length; // 1 or 2

    // サブセルが縦に何行入るか
    const subRowsPerCol = Math.max(1, Math.floor((cH + GAP) / (SUB_H + GAP)));
    const subColsNeeded = subCells.length > 0
      ? Math.ceil(subCells.length / subRowsPerCol)
      : 0;

    // サブエリアの幅（サブがある場合のみ gap 含む）
    const subAreaW = subColsNeeded > 0
      ? subColsNeeded * SUB_W + (subColsNeeded - 1) * GAP + GAP  // +GAP = main との間
      : 0;

    // メインエリアの利用可能幅・高さ
    const availW = Math.max(0, cW - subAreaW);
    const availH = cH;

    // メインセルの 16:9 サイズを計算
    let mainCellW: number, mainCellH: number;
    if (focusCount === 2) {
      // 横並び 2 分割
      const eachW = (availW - GAP) / 2;
      const eachHbyW = eachW * 9 / 16;
      if (eachHbyW <= availH) {
        mainCellW = eachW;
        mainCellH = eachHbyW;
      } else {
        mainCellH = availH;
        mainCellW = mainCellH * 16 / 9;
      }
    } else {
      // 1 セル
      const hByW = availW * 9 / 16;
      if (hByW <= availH) {
        mainCellW = availW;
        mainCellH = hByW;
      } else {
        mainCellH = availH;
        mainCellW = mainCellH * 16 / 9;
      }
    }

    // メインエリア全体の幅
    const mainAreaW = focusCount === 2 ? mainCellW * 2 + GAP : mainCellW;

    return (
      <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
        {hiddenPanel}

        {/* ── 外側フレックス（メイン左 + サブ右）── */}
        <div
          className="w-full h-full flex items-center justify-start gap-1 p-0"
          style={{ gap: GAP }}
        >
          {/* ── メインエリア ── */}
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: mainAreaW, height: cH }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const src = dragSrc.current;
              if (src && dragZone.current === 'sub') {
                setFocusedIds(prev =>
                  prev.length < MAX_FOCUS && !prev.includes(src) ? [...prev, src] : prev
                );
                dragSrc.current = null; dragZone.current = null;
              }
            }}
          >
            <div
              className="flex items-center"
              style={{
                gap: GAP,
                width: mainAreaW,
                height: mainCellH,
              }}
            >
              {focusedCells.map(cell => (
                <div
                  key={cell.id}
                  style={{ width: mainCellW, height: mainCellH, flexShrink: 0 }}
                >
                  {renderCell(cell, 'main')}
                </div>
              ))}
            </div>
          </div>

          {/* ── サブエリア（右側・列方向）── */}
          {subColsNeeded > 0 && (
            <div
              className="flex-shrink-0 self-center"
              style={{
                display: 'grid',
                gridTemplateRows: `repeat(${subRowsPerCol}, ${SUB_H}px)`,
                gridAutoFlow: 'column',
                gridAutoColumns: `${SUB_W}px`,
                gap: GAP,
                maxHeight: cH,
                overflow: 'hidden',
              }}
            >
              {subCells.map(cell => (
                <div
                  key={cell.id}
                  style={{ width: SUB_W, height: SUB_H }}
                >
                  {renderCell(cell, 'sub')}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── コンテキストメニュー ── */}
        {ctxMenu && (
          <CellContextMenu
            x={ctxMenu.x} y={ctxMenu.y}
            items={buildMenuItems(ctxMenu.id, ctxMenu.isLocal)}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 通常グリッドモード（16:9 セルを計算してセンタリング）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const totalCount = orderedCells.length;
  let cols: number, rows: number;
  if (gridLayout !== 'auto') {
    const parts = gridLayout.split('x').map(Number);
    cols = parts[0]; rows = parts[1];
  } else {
    ({ cols, rows } = calcGrid(totalCount));
  }

  const { cellW, cellH } = calc16x9Cell(cW, cH, cols, rows);
  const gridW = cellW * cols + GAP * (cols - 1);
  const gridH = cellH * rows + GAP * (rows - 1);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden
      flex items-center justify-center">
      {hiddenPanel}

      {/* 16:9 で計算したグリッド（コンテナ中央配置）*/}
      {cellW > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
            gap: GAP,
            width: gridW,
            height: gridH,
          }}
        >
          {orderedCells.map(cell => (
            <div key={cell.id} style={{ width: cellW, height: cellH }}>
              {renderCell(cell, 'grid')}
            </div>
          ))}
        </div>
      )}

      {/* ── コンテキストメニュー ── */}
      {ctxMenu && (
        <CellContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          items={buildMenuItems(ctxMenu.id, ctxMenu.isLocal)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
