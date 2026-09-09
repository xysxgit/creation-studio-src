/**
 * ============ 小地图导航 ============
 * 画布全局缩略图：显示所有卡片位置与当前视口矩形，点击/拖动跳转视口。
 * 性能敏感：仅订阅 viewport 与卡片位置摘要（由 CanvasBoard 传入）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../types';
import { useStudio } from '../store';
import { MapIcon } from './icons';

export default function MiniMap() {
  const cards = useStudio((s) => s.cards);
  const groups = useStudio((s) => s.groups);
  const edges = useStudio((s) => s.edges);
  const vp = useStudio((s) => s.viewport);
  const setViewport = useStudio((s) => s.setViewport);
  const setSelection = useStudio((s) => s.setSelection);
  const sectionColor = useStudio((s) => s.sections);
  const selection = useStudio((s) => s.selection);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  // 地图固定 1:1 正方形（用户偏好）：不随画布/屏幕比例变形
  const W = 170;
  const H = 170;
  const dragRef = useRef<{ pointerId: number } | null>(null);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cs.minimapHidden') === '1';
    } catch {
      return false;
    }
  });
  const toggleHidden = () => {
    setHidden((h) => {
      const n = !h;
      try {
        localStorage.setItem('cs.minimapHidden', n ? '1' : '0');
      } catch { /* ignore */ }
      return n;
    });
  };

  useEffect(() => {
    const wrap = document.querySelector('.canvas-wrap');
    const fallback = () => setCanvasSize({ w: window.innerWidth, h: window.innerHeight });
    const update = () => {
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCanvasSize({ w: rect.width, h: rect.height });
          return;
        }
      }
      fallback();
    };
    update();
    // Android 旋转不一定派发 window resize：用 ResizeObserver 观察画布容器，尺寸一变即时更新
    const ro = wrap && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro && wrap) ro.observe(wrap);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const visibleList = useMemo(() => Object.values(cards).filter((c) => !c.writingOnly), [cards]);
    const sectionColorMap = useMemo(() => new Map(sectionColor.map((s) => [s.id, s.color])), [sectionColor]);

  const { scale, offX, offY } = useMemo(() => {
    if (!visibleList.length) return { scale: 1, offX: 0, offY: 0 };
    const minX = Math.min(...visibleList.map((c) => c.x));
    const minY = Math.min(...visibleList.map((c) => c.y));
    const maxX = Math.max(...visibleList.map((c) => c.x + c.w));
    const maxY = Math.max(...visibleList.map((c) => c.y + c.h));
    const s = Math.min(W / Math.max(1, maxX - minX), H / Math.max(1, maxY - minY));
    return {
      scale: s,
      offX: -minX * s,
      offY: -minY * s,
    };
  }, [visibleList, canvasSize]);

  const moveToClient = (clientX: number, clientY: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const mx = (clientX - rect.left) / rect.width * W;
    const my = (clientY - rect.top) / rect.height * H;
    const wx = (mx - offX) / scale;
    const wy = (my - offY) / scale;
    const wrap = document.querySelector('.canvas-wrap');
    const wrapRect = wrap?.getBoundingClientRect();
    const zoom = vp.zoom;
    setViewport({
      zoom,
      x: (wrapRect ? wrapRect.width / 2 : canvasSize.w / 2) / zoom - wx,
      y: (wrapRect ? wrapRect.height / 2 : canvasSize.h / 2) / zoom - wy,
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { pointerId: e.pointerId };
    moveToClient(e.clientX, e.clientY, e.currentTarget as unknown as HTMLElement);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    moveToClient(e.clientX, e.clientY, e.currentTarget as unknown as HTMLElement);
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const setViewToBounds = (list: Card[]) => {
    if (!list.length) return;
    const minX = Math.min(...list.map((c) => c.x));
    const minY = Math.min(...list.map((c) => c.y));
    const maxX = Math.max(...list.map((c) => c.x + c.w));
    const maxY = Math.max(...list.map((c) => c.y + c.h));
    const wrap = document.querySelector('.canvas-wrap');
    const rect = wrap?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;
    const narrow = window.innerWidth < 1024;
    const pad = narrow ? 20 : 60;
    const zw = (w - pad * 2) / Math.max(1, maxX - minX);
    const zh = (h - pad * 2) / Math.max(1, maxY - minY);
    const zoom = Math.min(Math.max(Math.min(zw, zh, 1.5), 0.2), 2.5);
    setViewport({
      zoom,
      x: w / 2 - ((minX + maxX) / 2) * zoom,
      y: h / 2 - ((minY + maxY) / 2) * zoom,
    });
  };

  const fitAll = () => setViewToBounds(visibleList);
  const fitSelected = () => {
    const selected = visibleList.filter((c) => selection.includes(c.id));
    setViewToBounds(selected.length ? selected : visibleList);
  };

  const viewRect = useMemo(() => {
    const x0 = -vp.x / vp.zoom;
    const y0 = -vp.y / vp.zoom;
    const x1 = (canvasSize.w - vp.x) / vp.zoom;
    const y1 = (canvasSize.h - vp.y) / vp.zoom;
    return {
      x: x0 * scale + offX,
      y: y0 * scale + offY,
      w: Math.max(2, x1 * scale),
      h: Math.max(2, y1 * scale),
    };
  }, [vp, scale, offX, offY, canvasSize]);

  const visibleCardIds = useMemo(() => new Set(visibleList.map((c) => c.id)), [visibleList]);
  const visibleEdges = useMemo(
    () => Object.values(edges).filter((e) => visibleCardIds.has(e.from) && visibleCardIds.has(e.to)),
    [edges, visibleCardIds],
  );
  const groupBoxes = useMemo(() => {
    const boxes: { x: number; y: number; w: number; h: number; color: string }[] = [];
    for (const g of Object.values(groups)) {
      if (g.writingOnly) continue;
      const list = visibleList.filter((c) => c.groupId === g.id);
      if (list.length < 2) continue;
      const minX = Math.min(...list.map((c) => c.x)) - 8;
      const minY = Math.min(...list.map((c) => c.y)) - 8;
      const maxX = Math.max(...list.map((c) => c.x + c.w)) + 8;
      const maxY = Math.max(...list.map((c) => c.y + c.h)) + 8;
      boxes.push({ x: minX * scale + offX, y: minY * scale + offY, w: (maxX - minX) * scale, h: (maxY - minY) * scale, color: g.color });
    }
    return boxes;
  }, [groups, visibleList, scale, offX, offY]);

  if (hidden) {
    return (
      <div className="minimap collapsed" title="小地图已隐藏">
        <button className="minimap-hide-btn" title="显示小地图" onClick={toggleHidden}>
          <MapIcon size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="minimap" title="点击/拖动跳转">
      <div className="minimap-tools">
        <button title="快速定位全部" onClick={fitAll}>⛶</button>
        <button
          title="轮流切换卡片"
          onClick={() => {
            if (!visibleList.length) return;
            const next = (cycleIndex + 1) % visibleList.length;
            setCycleIndex(next);
            const card = visibleList[next];
            if (card) {
              setSelection([card.id]);
              setViewToBounds([card]);
            }
          }}
        >
          ↻
        </button>
        <button title="隐藏小地图" onClick={toggleHidden}>
          ✕
        </button>
      </div>
      <svg
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: 'none', cursor: 'crosshair', display: 'block' }}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--panel2)" rx={6} />
        {groupBoxes.map((g, i) => (
          <rect
            key={i}
            x={g.x}
            y={g.y}
            width={g.w}
            height={g.h}
            rx={3}
            fill="none"
            stroke={g.color}
            strokeWidth={0.8}
            strokeDasharray="3 2"
            opacity={0.6}
            pointerEvents="none"
          />
        ))}
        {visibleEdges.map((e) => {
          const from = cards[e.from];
          const to = cards[e.to];
          if (!from || !to) return null;
          return (
            <line
              key={e.id}
              x1={(from.x + from.w / 2) * scale + offX}
              y1={(from.y + from.h / 2) * scale + offY}
              x2={(to.x + to.w / 2) * scale + offX}
              y2={(to.y + to.h / 2) * scale + offY}
              stroke={e.color || '#b2bec3'}
              strokeWidth={0.8}
              opacity={0.7}
              pointerEvents="none"
            />
          );
        })}
        {visibleList.map((c) => {
          const selected = selection.includes(c.id);
          return (
            <rect
              key={c.id}
              x={c.x * scale + offX}
              y={c.y * scale + offY}
              width={Math.max(2, c.w * scale)}
              height={Math.max(1.5, c.h * scale)}
              rx={1}
              fill={c.color || sectionColorMap.get(c.sectionId) || '#a0a0b8'}
              stroke={selected ? '#6a5cf5' : 'none'}
              strokeWidth={selected ? 1.5 : 0}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelection([c.id]);
                setViewToBounds([c]);
              }}
            />
          );
        })}
        <rect
          x={viewRect.x}
          y={viewRect.y}
          width={viewRect.w}
          height={viewRect.h}
          fill="rgba(106,92,245,0.08)"
          stroke="#6a5cf5"
          strokeWidth={1.2}
          rx={2}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
