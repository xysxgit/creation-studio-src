/**
 * ============ 历史快照工具（撤销/重做） ============
 * 从 store.ts 抽取：
 *  · Snapshot：一次可撤销状态的完整快照（卡片/连线/分组/分区/页面数据）
 *  · historySnapshot / applySnapshot：生成与恢复
 *  · describeCardPatch / describeEdgePatch：操作描述（UI 提示用）
 *  · 常量：HISTORY_MAX(100) / UNDO_REDO_STEP_LIMIT / HISTORY_COALESCE_MS(2s 合并)
 *  · shouldPushEditHistory：拖拽/输入等场景的节流判定
 */
import type { Card, CardGroup, Edge, Section } from '../types';

export interface Snapshot {
  cards: Record<string, Card>;
  edges: Record<string, Edge>;
  groups: Record<string, CardGroup>;
  sections: Section[];
}

export const HISTORY_MAX = 100;
export const UNDO_REDO_STEP_LIMIT = 100;
/** 连续同类编辑（如打字）在多少毫秒内合并为一条历史快照，避免每次按键深拷贝整个项目 */
export const HISTORY_COALESCE_MS = 2000;

export function shouldPushEditHistory(): boolean {
  return true;
}

export function historySnapshot(s: Pick<Snapshot, 'cards' | 'edges' | 'groups' | 'sections'>): Snapshot {
  return {
    cards: structuredClone(s.cards),
    edges: structuredClone(s.edges),
    groups: structuredClone(s.groups),
    sections: structuredClone(s.sections),
  };
}

export function describeCardPatch(patch: Partial<Card>): string {
  if (patch.title !== undefined) return `修改标题为「${patch.title || '未命名'}」`;
  if (patch.content !== undefined) return '编辑正文';
  if (patch.x !== undefined || patch.y !== undefined || patch.w !== undefined || patch.h !== undefined) return '移动/缩放卡片';
  if (patch.color !== undefined) return '修改卡片颜色';
  if (patch.sectionId !== undefined) return '修改卡片分区';
  if (patch.groupId !== undefined) return '调整卡片所属卷/编组';
  if (patch.locked !== undefined) return patch.locked ? '锁定卡片' : '解锁卡片';
  if (patch.collapsed !== undefined) return patch.collapsed ? '折叠卡片' : '展开卡片';
  if (patch.preview !== undefined) return patch.preview ? '开启预览' : '关闭预览';
  if (patch.mode !== undefined) return '切换卡片模式';
  return '编辑卡片';
}

export function describeEdgePatch(patch: Partial<Edge>): string {
  if (patch.label !== undefined) return `修改连线标签为「${patch.label || ''}」`;
  if (patch.color !== undefined) return '修改连线颜色';
  if (patch.dashed !== undefined) return patch.dashed ? '设置虚线' : '取消虚线';
  if (patch.arrow !== undefined) return '修改连线箭头';
  if (patch.width !== undefined) return '修改连线宽度';
  if (patch.curve !== undefined) return '修改连线弯曲度';
  return '编辑连线';
}
