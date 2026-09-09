/**
 * ============ 连线渲染层（SVG） ============
 *  · 渲染全部连线：贝塞尔曲线、单向/双向箭头、选中高亮、颜色按分区
 *  · 命中检测（靠近曲线可选中/删除），虚线表示进行中连线
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 连线层（SVG）============
import { memo, useMemo, useRef } from 'react';
import type { Card, CardGroup, Edge, Viewport } from '../types';
import { useStudio } from '../store';
import { edgeGeometry, edgeMidOffset, segIntersectsRect } from '../utils/geometry';

interface Props {
  edges: Edge[];
  cards: Record<string, Card>;
  groups: Record<string, CardGroup>;
  selected: string[];
  sectionFilter: string;
  cardSelection: string[];
  vp: Viewport;
  onSelectEdge: (id: string) => void;
  onBranchStart: (e: React.PointerEvent, edge: Edge) => void;
  onEdgeContextMenu: (e: React.MouseEvent | { clientX: number; clientY: number }, edge: Edge) => void;
  onLeftMenu: (e: { clientX: number; clientY: number }) => void;
}

export default memo(EdgesLayerInner, (a, b) => {
  // 连线层只在 连线/卡片几何/视口/选中 变化时重渲染（打字时不触发，避免每键重建整个 SVG）
  return (
    a.edges === b.edges &&
    a.cards === b.cards &&
    a.groups === b.groups &&
    a.selected === b.selected &&
    a.sectionFilter === b.sectionFilter &&
    a.cardSelection === b.cardSelection &&
    a.vp === b.vp
  );
});

function EdgesLayerInner({ edges, cards, groups, selected, sectionFilter, cardSelection, vp, onSelectEdge, onBranchStart, onEdgeContextMenu, onLeftMenu }: Props) {
  const updateEdge = useStudio((s) => s.updateEdge);
  // 编组也作为可连线节点：解析连线端点（卡片 id 或编组 id）为几何盒
  const groupBoxOf = (gid: string) => {
    const g = groups[gid];
    if (!g) return null;
    const list = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === gid);
    if (list.length < 2) return null;
    const minX = Math.min(...list.map((c) => c.x)) - 14;
    const minY = Math.min(...list.map((c) => c.y)) - 14;
    const maxX = Math.max(...list.map((c) => c.x + c.w)) + 14;
    const maxY = Math.max(...list.map((c) => c.y + c.h)) + 14;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
  // 把节点 id（卡片或编组）统一为 CardViewBox 几何
  const nodeBox = (id: string): Card | null => {
    if (cards[id]) return cards[id];
    const b = groupBoxOf(id);
    if (b) return { id, x: b.x, y: b.y, w: b.w, h: b.h, groupId: id } as Card;
    return null;
  };
  const strokeW = (e: Edge) => (e.width ?? 2.2) / vp.zoom;
  const markerW = 9 / vp.zoom;
  const midR = 6 / vp.zoom;

  const visible = useMemo(() => {
    // 视口裁剪：只渲染至少一端在视野内、或连线穿过视野的边（选中的边始终保留）
    const margin = 300;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x0 = -vp.x / vp.zoom - margin;
    const y0 = -vp.y / vp.zoom - margin;
    const x1 = (w - vp.x) / vp.zoom + margin;
    const y1 = (h - vp.y) / vp.zoom + margin;
    const selSet = new Set(selected);
    const cardSel = new Set(cardSelection);
    return edges.filter((e) => {
      const ca = nodeBox(e.from);
      const cb = nodeBox(e.to);
      if (!ca || !cb || ca.writingOnly || cb.writingOnly) return false;
      if (selSet.has(e.id)) return true;
      // 分区筛选：任一端卡片不在当前分区 → 连线一并隐藏（与卡片同步；选中卡片/选中连线的连线保留）
      if (sectionFilter !== 'all' && (ca.sectionId !== sectionFilter || cb.sectionId !== sectionFilter)
        && !cardSel.has(ca.id) && !cardSel.has(cb.id)) return false;
      const aOut = ca.x > x1 || ca.x + ca.w < x0 || ca.y > y1 || ca.y + ca.h < y0;
      const bOut = cb.x > x1 || cb.x + cb.w < x0 || cb.y > y1 || cb.y + cb.h < y0;
      if (aOut && bOut) {
        // 两端都出视野：仅当连线穿过视野矩形时保留
        const ax = ca.x + ca.w / 2, ay = ca.y + ca.h / 2;
        const bx = cb.x + cb.w / 2, by = cb.y + cb.h / 2;
        return segIntersectsRect(ax, ay, bx, by, x0, y0, x1, y1);
      }
      return true;
    });
  }, [edges, cards, vp, selected]);
    
      
      
        
    
    const cardRects = useMemo(
      () => Object.values(cards).filter((c) => !c.writingOnly).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
      [cards]
    );

  const edgeMenu = (ev: { clientX: number; clientY: number; stopPropagation?: () => void }, e: Edge) => {
    ev.stopPropagation?.();
    onEdgeContextMenu({ clientX: ev.clientX, clientY: ev.clientY }, e);
  };

  return (
    <>
      {/* 视觉层（在卡片下方） */}
      <div className="edges-layer">
        <svg className="edges-svg" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            <marker id="arrow" markerWidth={markerW} markerHeight={markerW} refX={markerW * 0.9} refY={markerW / 2} orient="auto" markerUnits="userSpaceOnUse">
              <path d={`M0,0 L${markerW},${markerW / 2} L0,${markerW} z`} fill="currentColor" />
            </marker>
            <marker id="arrow-back" markerWidth={markerW} markerHeight={markerW} refX={markerW * 0.1} refY={markerW / 2} orient="auto" markerUnits="userSpaceOnUse">
              <path d={`M${markerW},0 L0,${markerW / 2} L${markerW},${markerW} z`} fill="currentColor" />
            </marker>
          </defs>
          <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
            {visible.map((e) => {
              const geo = edgeGeometry(e, nodeBox(e.from)!, nodeBox(e.to)!);
              const sel = selected.includes(e.id);
              const color = e.color || '#8e8ea0';
              const arrow = e.arrow ?? 'end';
              return (
                <path
                  key={e.id}
                  d={geo.path}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeW(e) * (sel ? 1.7 : 1)}
                  strokeDasharray={e.dashed ? `${6 / vp.zoom} ${4 / vp.zoom}` : undefined}
                  markerEnd={arrow === 'end' || arrow === 'both' ? 'url(#arrow)' : undefined}
                  markerStart={arrow === 'start' || arrow === 'both' ? 'url(#arrow-back)' : undefined}
                  className={`edge-path ${sel ? 'selected' : ''} ${Date.now() - e.createdAt < 2500 ? 'edge-new' : ''}`}
                />
              );
            })}
          </g>
        </svg>
      </div>
      {/* 交互层（在卡片上方）：宽命中区 + 标签 + 中段拖拽点（最顶层） */}
      <div className="edges-hit">
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
            {visible.map((e) => {
              const geo = edgeGeometry(e, nodeBox(e.from)!, nodeBox(e.to)!);
              return (
                <path
                  key={e.id}
                  d={geo.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(10 / vp.zoom, 6)}
                  className="edge-hit-path"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    onSelectEdge(e.id);
                  }}
                  onDoubleClick={async (ev) => {
                    ev.stopPropagation();
                    const label = await csPrompt('连线标签（如：师徒 / 敌对 / 线索→）', e.label || '', undefined, true);
                    if (label !== null) updateEdge(e.id, { label });
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    edgeMenu(ev, e);
                  }}
                />
              );
            })}
          </g>
        </svg>
        {visible.map((e) => {
          const geo = edgeGeometry(e, nodeBox(e.from)!, nodeBox(e.to)!);
          const sx = geo.mid.x * vp.zoom + vp.x;
          const sy = geo.mid.y * vp.zoom + vp.y;
          const sel = selected.includes(e.id);
          return (
            <div
              key={`lbl-${e.id}`}
              className={`edge-label ${sel ? 'selected' : ''} ${e.label ? '' : 'empty'}`}
              style={{ left: sx, top: sy - 26 }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelectEdge(e.id);
              }}
              onDoubleClick={async (ev) => {
                ev.stopPropagation();
                const label = await csPrompt('连线标签：', e.label || '', undefined, true);
                if (label !== null) updateEdge(e.id, { label });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                edgeMenu(ev, e);
              }}
            >
              <span>{e.label || '连线'}</span>
            </div>
          );
        })}
        {/* 中段单按钮：拖动拉出分支线 / 长按弹新建分支模板 / 点击弹连线设置 */}
        {visible.map((e) => {
          const geo = edgeGeometry(e, nodeBox(e.from)!, nodeBox(e.to)!);
          const off = edgeMidOffset(e.id);
          // 中段点若落在某张卡片内部则不渲染（避免挡住卡片操作）
          const inCard = cardRects.some(
            (c) => geo.mid.x >= c.x && geo.mid.x <= c.x + c.w && geo.mid.y + off >= c.y && geo.mid.y + off <= c.y + c.h
          );
          if (inCard) return null;
          const sx = geo.mid.x * vp.zoom + vp.x;
          const sy = geo.mid.y * vp.zoom + vp.y + off;
          const S = 18;
          return (
            <EdgeMidButton
              key={`mid-${e.id}`}
              e={e}
              sx={sx}
              sy={sy}
              S={S}
              onBranchStart={onBranchStart}
              onEdgeContextMenu={onEdgeContextMenu}
              onLeftMenu={onLeftMenu}
            />
          );
        })}
      </div>
    </>
  );
}


// ============ 连线中段单按钮：拖动=拉分支线，长按=新建分支模板，点击=连线设置 ============
function EdgeMidButton({
  e, sx, sy, S, onBranchStart, onEdgeContextMenu, onLeftMenu,
}: {
  e: Edge;
  sx: number;
  sy: number;
  S: number;
  onBranchStart: (ev: React.PointerEvent, edge: Edge) => void;
  onEdgeContextMenu: (ev: { clientX: number; clientY: number }, edge: Edge) => void;
  onLeftMenu: (ev: { clientX: number; clientY: number }) => void;
}) {
  const longPress = useRef<{ t: number; x: number; y: number; fired: boolean; moved: boolean } | null>(null);
  const clear = () => {
    if (longPress.current) {
      clearTimeout(longPress.current.t);
      longPress.current = null;
    }
  };

  const start = (ev: React.PointerEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.button !== 0) return;
    clear();
    // 指针捕获：移动过程中事件始终派发到按钮
    try {
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    } catch { /* ignore */ }
    const x = ev.clientX;
    const y = ev.clientY;
    longPress.current = {
      x,
      y,
      moved: false,
      fired: false,
      t: window.setTimeout(() => {
        if (!longPress.current) return;
        longPress.current.fired = true;
        longPress.current = null;
        // 长按：弹新建分支模板菜单
        onLeftMenu({ clientX: x, clientY: y });
      }, 450),
    };
  };
  const move = (ev: React.PointerEvent) => {
    ev.stopPropagation();
    const lp = longPress.current;
    if (!lp) return;
    const dx = ev.clientX - lp.x;
    const dy = ev.clientY - lp.y;
    if (dx * dx + dy * dy > 64) {
      lp.moved = true;
      clear();
      // 拖动：拉出分支线
      onBranchStart(ev, e);
    }
  };
  const up = (ev: React.PointerEvent) => {
    // 阻止冒泡：+按钮的 pointerup 不能计入空白 tap，避免紧接的空白点击被误判为双击新建卡片
    ev.stopPropagation();
    const lp = longPress.current;
    clear();
    // 点击（未长按、未拖动）：弹连线设置菜单
    if (lp && !lp.fired && !lp.moved) {
      onEdgeContextMenu({ clientX: ev.clientX, clientY: ev.clientY }, e);
    }
  };

  return (
    <div
      className="edge-mid"
      style={{ left: sx - S / 2, top: sy - S / 2, width: S, height: S }}
      title="拖动：拉出分支线；长按：新建分支模板；点击：连线设置"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={clear}
    >
      ＋
    </div>
  );
}
