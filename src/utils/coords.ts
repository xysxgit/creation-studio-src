/**
 * ============ 视口 / 坐标工具（纯函数） ============
 * 从 CanvasBoard 抽取：
 *  · toWorldPoint：屏幕坐标 → 世界坐标（含容器偏移与缩放）
 *  · computeZoomAnchor：以某点为锚的缩放（滚轮缩放时保持鼠标下内容不动）
 */
import type { Card, Edge, Viewport } from '../types';
import { edgeGeometry } from './geometry';

/**
 * 页面坐标（clientX/Y）→ 世界坐标
 * 优先基于 .canvas-cards 实测变换位置（保证与渲染一致），回退到 viewport 数学换算
 */
export function toWorldPoint(vp: Viewport, wrapEl: HTMLElement | null, sx: number, sy: number): { x: number; y: number } {
  const ccEl = wrapEl?.querySelector('.canvas-cards');
  const r = ccEl?.getBoundingClientRect();
  if (r && r.width > 0) {
    return { x: (sx - r.left) / vp.zoom, y: (sy - r.top) / vp.zoom };
  }
  const wr = wrapEl?.getBoundingClientRect();
  const left = wr?.left ?? 0;
  const top = wr?.top ?? 0;
  return { x: (sx - left - vp.x) / vp.zoom, y: (sy - top - vp.y) / vp.zoom };
}

interface ZoomAnchorStore {
  selection: string[];
  cards: Record<string, Card>;
  edgeSelection: string[];
  edges: Record<string, Edge>;
  viewport: Viewport;
}

/**
 * 计算缩放锚点（相对画布内容区原点，与 viewport.x/y 同一坐标系）
 * 优先以选中卡片中心为锚，其次选中连线中点，最后回退到传入坐标/画布中心
 */
export function computeZoomAnchor(
  st: ZoomAnchorStore,
  wrapEl: HTMLElement | null,
  opts?: { sx?: number; sy?: number; preferSelection?: boolean },
): { ox: number; oy: number; cx: number; cy: number } {
  const ccEl = wrapEl?.querySelector('.canvas-cards');
  const ccRect = ccEl?.getBoundingClientRect();
  const rect = wrapEl?.getBoundingClientRect();
  // 画布内容区左上角的客户端坐标（含 translate 偏移）
  const ox = ccRect?.left ?? rect?.left ?? 0;
  const oy = ccRect?.top ?? rect?.top ?? 0;
  const fallbackCx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  let cx = opts?.sx ?? fallbackCx;
  const fallbackCy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  let cy = opts?.sy ?? fallbackCy;
  const preferSel = opts?.preferSelection !== false;
  if (preferSel) {
    const sel = st.selection.map((id) => st.cards[id]).filter(Boolean);
    if (sel.length) {
      const cxw = sel.reduce((a, c) => a + c.x + c.w / 2, 0) / sel.length;
      const cyw = sel.reduce((a, c) => a + c.y + c.h / 2, 0) / sel.length;
      const v = st.viewport;
      cx = cxw * v.zoom + ox;
      cy = cyw * v.zoom + oy;
    } else {
      // 选中连线：以连线中点为锚
      const edgeSel = st.edgeSelection.map((id) => st.edges[id]).filter((e) => e && st.cards[e.from] && st.cards[e.to]);
      if (edgeSel.length) {
        let ex = 0;
        let ey = 0;
        for (const e of edgeSel) {
          const geo = edgeGeometry(e, st.cards[e.from], st.cards[e.to]);
          ex += geo.mid.x;
          ey += geo.mid.y;
        }
        const v = st.viewport;
        cx = (ex / edgeSel.length) * v.zoom + ox;
        cy = (ey / edgeSel.length) * v.zoom + oy;
      }
    }
  }
  return { ox, oy, cx, cy };
}