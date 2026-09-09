/**
 * ============ 自定义灵感文库 ============
 * 把任意卡片收藏为灵感素材（localStorage 持久化）：
 *  · loadInspirations / saveInspiration / deleteInspiration
 *  · 供「灵感」面板展示与一键生成卡片
 */
import { csPrompt } from './components/SystemDialog';
// ============ 自定义灵感文库：把任意卡片收藏为灵感素材 ============
import type { Card } from './types';
import { docToMarkdown } from './export/export';
import { toast, uid } from './util';

export interface CustomInspiration {
  id: string;
  title: string;
  body: string[];
  createdAt: number;
}

const K = 'cs.inspirations';

export function loadInspirations(): CustomInspiration[] {
  try {
    const raw = localStorage.getItem(K);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveInspirations(list: CustomInspiration[]) {
  try {
    localStorage.setItem(K, JSON.stringify(list));
  } catch { /* ignore */ }
}

/** 把卡片收藏为灵感文库条目 */
export async function saveCardAsInspiration(card: Card): Promise<void> {
  const name = await csPrompt('灵感文库名称：', card.title || '未命名灵感');
  if (name === null) return;
  const md = docToMarkdown(card.content);
  const body = md.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!body.length) body.push('（空内容）');
  const item: CustomInspiration = {
    id: uid('insp'),
    title: name.trim() || card.title || '未命名灵感',
    body,
    createdAt: Date.now(),
  };
  const list = loadInspirations();
  list.unshift(item);
  saveInspirations(list);
  toast(`已收藏为灵感文库「${item.title}」`, 'ok');
}

export function deleteInspiration(id: string) {
  const list = loadInspirations().filter((x) => x.id !== id);
  saveInspirations(list);
  toast('灵感文库条目已删除', 'warn');
}
