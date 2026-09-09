/**
 * ============ 自动布局算法（纯函数） ============
 * 输入卡片与连线关系，输出卡片位置映射（PosMap）：
 *  · treeLayout：树形（自上而下）；radialLayout：辐射（环状）
 *  · gridLayout：网格（按行排布）；mindMapLayout：思维导图（左右分支）
 * 不依赖 DOM / store，便于单独测试与复用。
 */
import type { Card, Edge } from './types';

export type PosMap = Record<string, { x: number; y: number }>;

function adjacency(edges: Edge[]): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    (adj[e.from] ||= []).push(e.to);
    (adj[e.to] ||= []).push(e.from);
  }
  return adj;
}

function pickRoot(cards: Record<string, Card>, edges: Edge[], preferId?: string): string {
  if (preferId && cards[preferId]) return preferId;
  const adj = adjacency(edges);
  let best = '';
  let bestDeg = -1;
  for (const c of Object.values(cards)) {
    const deg = adj[c.id]?.length || 0;
    if (deg > bestDeg) {
      bestDeg = deg;
      best = c.id;
    }
  }
  return best || Object.keys(cards)[0];
}

/** 树形（脑图）布局：根在左侧，子级向右展开（防环，可处理任意连线结构） */
export function treeLayout(cards: Record<string, Card>, edges: Edge[], rootId?: string): PosMap {
  const visibleList = Object.values(cards).filter((c) => !c.writingOnly);
  if (!visibleList.length) return {};
  const visibleIds = new Set(visibleList.map((c) => c.id));
  const visibleCards: Record<string, Card> = {};
  for (const c of visibleList) visibleCards[c.id] = c;
  const visibleEdges = edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  const adj = adjacency(visibleEdges);
  const root = pickRoot(visibleCards, visibleEdges, rootId);
  const H_GAP = 260;
  const V_GAP = 90;
  const pos: PosMap = {};
  const placed = new Set<string>();

  function subtreeHeight(node: string, parent: string, seen: Set<string>): number {
    if (seen.has(node)) return 0;
    seen.add(node);
    const kids = (adj[node] || []).filter((k) => k !== parent && !seen.has(k));
    if (!kids.length) return 1;
    return kids.reduce((s, k) => s + subtreeHeight(k, node, seen), 0);
  }

  function place(node: string, parent: string, depth: number, top: number): number {
    if (placed.has(node)) return top;
    placed.add(node);
    const kids = (adj[node] || []).filter((k) => k !== parent && !placed.has(k));
    const h = subtreeHeight(node, parent, new Set<string>());
    pos[node] = { x: depth * H_GAP, y: top + (h * V_GAP) / 2 };
    let cur = top;
    for (const k of kids) {
      cur = place(k, node, depth + 1, cur);
    }
    return top + h * V_GAP;
  }

  const rootY = subtreeHeight(root, '', new Set<string>());
  place(root, '', 0, -rootY / 2);
  return pos;
}

/** 径向布局：根在中心，子级环绕（防环） */
export function radialLayout(cards: Record<string, Card>, edges: Edge[], rootId?: string): PosMap {
  const visibleList = Object.values(cards).filter((c) => !c.writingOnly);
  if (!visibleList.length) return {};
  const visibleIds = new Set(visibleList.map((c) => c.id));
  const visibleCards: Record<string, Card> = {};
  for (const c of visibleList) visibleCards[c.id] = c;
  const visibleEdges = edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  const adj = adjacency(visibleEdges);
  const root = pickRoot(visibleCards, visibleEdges, rootId);
  const R = 190;
  const pos: PosMap = {};
  const visited = new Set<string>();

  function place(node: string, parent: string, depth: number, a0: number, a1: number, angle: number) {
    if (visited.has(node)) return;
    visited.add(node);
    pos[node] = { x: Math.cos(angle) * depth * R, y: Math.sin(angle) * depth * R };
    const kids = (adj[node] || []).filter((k) => k !== parent && !visited.has(k));
    if (!kids.length) return;
    const span = a1 - a0;
    const step = span / kids.length;
    kids.forEach((k, i) => {
      const ka = a0 + step * i + step / 2;
      place(k, node, depth + 1, ka - step / 2, ka + step / 2, ka);
    });
  }

  place(root, '', 0, -Math.PI, Math.PI, 0);
  return pos;
}

/** 网格布局：按序号/标题排成整齐网格 */
export function gridLayout(cards: Record<string, Card>): PosMap {
  const list = Object.values(cards).filter((c) => !c.writingOnly).sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
  const perRow = Math.max(3, Math.ceil(Math.sqrt(list.length * 1.6)));
  const W = 300;
  const H = 240;
  const GAP = 50;
  const pos: PosMap = {};
  list.forEach((c, i) => {
    const r = Math.floor(i / perRow);
    const col = i % perRow;
    pos[c.id] = { x: col * (W + GAP), y: r * (H + GAP) };
  });
  return pos;
}

/** 对连通分量独立做脑图布局 */
export function mindMapLayout(cards: Record<string, Card>, edges: Edge[], rootId?: string): PosMap {
  const visibleList = Object.values(cards).filter((c) => !c.writingOnly);
  const ids = new Set(visibleList.map((c) => c.id));
  const visibleCards: Record<string, Card> = {};
  for (const c of visibleList) visibleCards[c.id] = c;
  const visibleEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const adj = adjacency(visibleEdges);
  const pos: PosMap = {};
  let offsetX = 0;
  while (ids.size) {
    const start = rootId && ids.has(rootId) ? rootId : ids.values().next().value as string;
    // BFS 取分量
    const comp: string[] = [];
    const queue = [start];
    const seen = new Set<string>();
    while (queue.length) {
      const n = queue.shift()!;
      if (seen.has(n)) continue;
      seen.add(n);
      comp.push(n);
      for (const k of adj[n] || []) if (!seen.has(k)) queue.push(k);
    }
    for (const id of comp) ids.delete(id);
    const subCards: Record<string, Card> = {};
    for (const id of comp) subCards[id] = visibleCards[id];
    const subEdges = visibleEdges.filter((e) => comp.includes(e.from) && comp.includes(e.to));
    const subPos = treeLayout(subCards, subEdges, start);
    // 将分量平移，避免重叠
    const minX = Math.min(...Object.values(subPos).map((p) => p.x));
    for (const id of comp) {
      pos[id] = { x: subPos[id].x - minX + offsetX, y: subPos[id].y };
    }
    offsetX += Math.max(...Object.values(subPos).map((p) => p.x)) - minX + 400;
  }
  return pos;
}
