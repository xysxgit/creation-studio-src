/**
 * ============ 自定义卡片模板 ============
 * 把任意卡片存为模板（localStorage 持久化）：
 *  · loadTemplates / saveCardAsTemplate / deleteTemplate
 *  · customTemplateToCard：实例化模板到指定分区与位置
 */
import { csPrompt } from './components/SystemDialog';
// ============ 自定义模板：把任意卡片存为模板，跨项目复用 ============
import type { Card, JSONDoc } from './types';
import { toast, uid } from './util';

export interface CustomTemplate {
  id: string;
  title: string;
  kind: 'note' | 'image';
  content: JSONDoc | null;
  imageSrc?: string;
  w: number;
  h: number;
  createdAt: number;
}

const K = 'cs.templates';

export function loadTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(K);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(list: CustomTemplate[]) {
  try {
    localStorage.setItem(K, JSON.stringify(list));
  } catch { /* ignore */ }
}

/** 把卡片存为模板 */
export async function saveCardAsTemplate(card: Card): Promise<void> {
  const name = await csPrompt('模板名称：', card.title || '未命名模板');
  if (name === null) return;
  const tpl: CustomTemplate = {
    id: uid('tpl'),
    title: name.trim() || card.title || '未命名模板',
    kind: card.kind,
    content: card.content ? structuredClone(card.content) : null,
    imageSrc: card.imageSrc,
    w: card.w,
    h: card.h,
    createdAt: Date.now(),
  };
  const list = loadTemplates();
  list.unshift(tpl);
  saveTemplates(list);
  toast(`已存为模板「${tpl.title}」`, 'ok');
}

export function deleteTemplate(id: string) {
  const list = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(list);
  toast('模板已删除', 'warn');
}

/** 模板 → 可插入的卡片 */
export function customTemplateToCard(tpl: CustomTemplate, sectionId: string, pos: { x: number; y: number }): Card {
  const now = Date.now();
  return {
    id: uid('card'),
    kind: tpl.kind,
    sectionId,
    title: tpl.title,
    content: tpl.content ? structuredClone(tpl.content) : null,
    imageSrc: tpl.imageSrc,
    x: pos.x,
    y: pos.y,
    w: tpl.w || 300,
    h: tpl.h || 220,
    z: 1,
    createdAt: now,
    updatedAt: now,
  };
}
