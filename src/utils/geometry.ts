/**
 * ============ 连线几何工具（纯函数） ============
 * 从 CanvasBoard / EdgesLayer 抽取：
 *  · anchorPoint：卡片四边锚点定位；edgeGeometry：连线起止/控制点
 *  · segIntersects / segIntersectsRect：线段/矩形相交检测（框选命中）
 *  · edgeMidOffset：连线中部偏移（标签位置）
 */
import type { Card, Edge } from '../types';

/**
 * 折叠卡片在画布上的实际可见盒高（px）。
 * 折叠时 CardView 不再渲染正文：剩余可见元素为 .card-topbar(36) + .card-header(36) + 上下边框(2) ≈ 74。
 * CSS 中 .card-topbar/.card-header 均固定 36px；这里的常量必须与样式保持一致，
 * 否则连线几何(edgeGeometry/anchorPoint)会把它当成"仍展开的全高 card.h"而把线的起止/中点放错。
 */
const COLLAPSED_H = 74;

/** 卡片"参与连线几何的可见盒"。折叠时高 74(标题条)，否则用完整 card.h；宽/坐标始终取 card 自身。 */
export function cardViewBox(c: Pick<Card,'x'|'y'|'w'|'h'|'collapsed'>): { x: number; y: number; w: number; h: number } {
  return { x: c.x, y: c.y, w: c.w, h: c.collapsed ? COLLAPSED_H : c.h };
}

/** 从卡片中心向目标点方向求卡片边界交点 */
function borderPoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const sx = w / 2 / Math.max(Math.abs(tx), 1e-6);
  const sy = h / 2 / Math.max(Math.abs(ty), 1e-6);
  const s = Math.min(sx, sy);
  return { x: cx + tx * s, y: cy + ty * s };
}

/** 连线中段点的垂直偏移（按 id 哈希，避免多条线汇聚时重叠） */
export function edgeMidOffset(edgeId: string): number {
  let h = 0;
  for (let i = 0; i < edgeId.length; i++) h = (h * 31 + edgeId.charCodeAt(i)) % 97;
  return ((h % 3) - 1) * 16;
}

/** 计算连线路径与中点（直线/圆角折线/S 形贝塞尔） */
export function edgeGeometry(e: Edge, from: Card, to: Card) {
  // 用"可见盒"：卡片折叠后视觉高度只剩标题条(≈74px)，连线须贴折叠后的实际边，不能用展开的全高 card.h
  const fb = cardViewBox(from);
  const tb = cardViewBox(to);
  const x1 = fb.x + fb.w / 2;
  const y1 = fb.y + fb.h / 2;
  const x2 = tb.x + tb.w / 2;
  const y2 = tb.y + tb.h / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p1 = borderPoint(x1, y1, fb.w, fb.h, dx, dy);
  const p2 = borderPoint(x2, y2, tb.w, tb.h, -dx, -dy);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  // 默认直线（参考主流思维导图软件的默认连线方式）
  const style = e.lineStyle ?? 'straight';
  let path: string;
  if (style === 'straight') {
    path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  } else if (style === 'elbow') {
    // 圆角折线（正交走线，带圆角更接近现代导图/流程图风格）
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const R = Math.min(14, Math.abs(dx) / 2, Math.abs(dy) / 2);
    if (horizontal) {
      const mxp = (p1.x + p2.x) / 2;
      const d = p2.y > p1.y ? R : -R;
      if (p1.y === p2.y) {
        path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      } else {
        path = `M ${p1.x} ${p1.y} L ${mxp - R} ${p1.y} Q ${mxp} ${p1.y} ${mxp} ${p1.y + d} L ${mxp} ${p2.y - d} Q ${mxp} ${p2.y} ${mxp + R} ${p2.y} L ${p2.x} ${p2.y}`;
      }
    } else {
      const myp = (p1.y + p2.y) / 2;
      const d = p2.x > p1.x ? R : -R;
      if (p1.x === p2.x) {
        path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      } else {
        path = `M ${p1.x} ${p1.y} L ${p1.x} ${myp - R} Q ${p1.x} ${myp} ${p1.x + d} ${myp} L ${p2.x - d} ${myp} Q ${p2.x} ${myp} ${p2.x} ${myp + R} L ${p2.x} ${p2.y}`;
      }
    }
  } else {
    // 曲线：思维导图式 S 形贝塞尔（水平走向时横向控点，垂直走向时纵向控点）
    const curve = Math.min(e.curve ?? 0.25, 0.35); // 曲率上限：老数据 curve=1 会过度弯曲
    if (Math.abs(dx) >= Math.abs(dy)) {
      const cdx = Math.max(30, Math.abs(dx)) * curve;
      const dir = dx >= 0 ? 1 : -1;
      const c1x = p1.x + cdx * dir;
      const c2x = p2.x - cdx * dir;
      path = `M ${p1.x} ${p1.y} C ${c1x} ${p1.y} ${c2x} ${p2.y} ${p2.x} ${p2.y}`;
    } else {
      const cdy = Math.max(30, Math.abs(dy)) * curve;
      const dir = dy >= 0 ? 1 : -1;
      const c1y = p1.y + cdy * dir;
      const c2y = p2.y - cdy * dir;
      path = `M ${p1.x} ${p1.y} C ${p1.x} ${c1y} ${p2.x} ${c2y} ${p2.x} ${p2.y}`;
    }
  }
  return { path, mid: { x: mx, y: my } };
}

/** 卡片指定方向的连线锚点控件中心位置（w/e/n/s）：锚点控件渲染在卡片边中点外侧 8px，
 *  故此处返回卡片边中点向外偏移 8 世界px，确保虚线/连线从锚点圆点正中引出 */
export function anchorPoint(c: Card, dir: string) {
  const b = cardViewBox(c);
  if (dir === 'w') return { x: b.x - 8, y: b.y + b.h / 2 };
  if (dir === 'e') return { x: b.x + b.w + 8, y: b.y + b.h / 2 };
  if (dir === 'n') return { x: b.x + b.w / 2, y: b.y - 8 };
  return { x: b.x + b.w / 2, y: b.y + b.h + 8 };
}

/** 线段 AB 与线段 CD 是否相交（跨立实验） */
export function segIntersects(a1x: number, a1y: number, a2x: number, a2y: number, b1x: number, b1y: number, b2x: number, b2y: number): boolean {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(b1x, b1y, a1x, a1y, a2x, a2y);
  const d2 = cross(b2x, b2y, a1x, a1y, a2x, a2y);
  const d3 = cross(a1x, a1y, b1x, b1y, b2x, b2y);
  const d4 = cross(a2x, a2y, b1x, b1y, b2x, b2y);
  if (d1 * d2 >= 0 || d3 * d4 >= 0) return false;
  return true;
}

/** 线段是否与轴对齐矩形相交（含线段完全在矩形内） */
export function segIntersectsRect(a1x: number, a1y: number, a2x: number, a2y: number, rx0: number, ry0: number, rx1: number, ry1: number): boolean {
  if ((a1x >= rx0 && a1x <= rx1 && a1y >= ry0 && a1y <= ry1) || (a2x >= rx0 && a2x <= rx1 && a2y >= ry0 && a2y <= ry1)) return true;
  return (
    segIntersects(a1x, a1y, a2x, a2y, rx0, ry0, rx1, ry0) ||
    segIntersects(a1x, a1y, a2x, a2y, rx1, ry0, rx1, ry1) ||
    segIntersects(a1x, a1y, a2x, a2y, rx1, ry1, rx0, ry1) ||
    segIntersects(a1x, a1y, a2x, a2y, rx0, ry1, rx0, ry0)
  );
}