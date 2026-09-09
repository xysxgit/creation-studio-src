/**
 * ============ 底部状态栏 ============
 * 全局状态展示与常用操作：字数统计、保存状态、协同在线人数、
 * 撤销/重做、缩放/适应画布、筛选计数等。
 */
import { useMemo } from 'react';
import { useStudio } from '../store';
import { docWordCountCached } from '../tiptap';
import { APP_VERSION } from '../meta';
import { SyncIcon } from './icons';
/** 画布左下角（状态栏）展示的应用版本号，统一来自 src/meta.ts */
const VERSION_TAG = `v${APP_VERSION}`;

export default function StatusBar() {
  const cards = useStudio((s) => s.cards);
  const edges = useStudio((s) => s.edges);
  const saving = useStudio((s) => s.saving);
  const serverStatus = useStudio((s) => s.serverStatus);
  const selection = useStudio((s) => s.selection);
  const viewport = useStudio((s) => s.viewport);

  const manuscript = useStudio((s) => s.manuscript);
  const stats = useMemo(() => {
    let words = 0;
    for (const c of Object.values(cards)) if (!c.writingOnly) words += docWordCountCached(c.content, c.id);
    // 独立正文字数（6.6：正文=输出重心，独立于画布统计）
    let msWords = 0;
    for (const ch of manuscript.chapters) msWords += docWordCountCached(ch.content, ch.id);
    const visibleCards = Object.values(cards).filter((c) => !c.writingOnly);
    return { words, msWords, cards: visibleCards.length, edges: Object.keys(edges).length };
  }, [cards, edges, manuscript]);

  return (
    <div className="statusbar">
      <span className="sb-ver" style={{ background: 'var(--accent)', color: '#fff', padding: '0 8px', borderRadius: '10px', fontWeight: 600, fontSize: '12px' }}>{VERSION_TAG}</span>
      <span>卡片 {stats.cards} · 连线 {stats.edges} · 稿纸正文 {stats.msWords.toLocaleString()} 字 · 画布 {stats.words.toLocaleString()} 字</span>
      <span className="sb-right">
        {selection.length > 0 && <span className="sb-sel">已选 {selection.length}</span>}
        {saving ? <span>保存中…</span> : <span>✓ 已自动保存到本机</span>}
        {serverStatus === 'on' && <span className="sb-sync"><SyncIcon size={13} /> 协同中</span>}
        <span>缩放 {Math.round(viewport.zoom * 100)}%</span>
        <span className="sb-hint">双击卡片编辑 · 空格拖动画布 · 滚轮缩放（Ctrl+滚轮亦可）</span>
      </span>
    </div>
  );
}
