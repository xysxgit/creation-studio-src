/**
 * ============ 正文 · 独立创作界面（传统写小说界面，需求 6.6） ============
 * 满屏稿纸写作区 + 卷/章目录树 + 排版工具栏 + 字数统计；
 * 数据来自独立正文 Manuscript（项目 → 卷 → 章，6.1），与画布卡片体系平行、独立存储（4.3）。
 * 纯净创作环境：画布/时间轴/工坊默认不显示，仅提供按需呼出的分区资料参考。
 * 懒加载组件；从顶栏「正文」入口打开。
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 专业正文创作模式（分卷 / 分章） ============
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '../store';
import type { Card, CardGroup, Manuscript } from '../types';
import { docToHtml, docWordCount } from '../tiptap';
import { download, toast } from '../util';
import { exportNovelEpub, exportNovelPdf, projectToNovelHtml, projectToNovelMarkdown, projectToNovelTxt } from '../export/export';
import RichEditor from './RichEditor';
import { TrashIcon, PencilIcon, TrashColorIcon, CloseIcon, BoxIcon, DocIcon, BookIcon, FolderIcon, SingleSelectIcon, MultiSelectIcon, GroupIcon, CheckIcon, ReloadIcon, RestoreIcon, InboxIcon, SectionIcon } from './icons';

interface Props {
  onClose: () => void;
}

/** 卷标题配色（按卷序取色，视觉分层） */
const VOLUME_COLORS = ['#6a5cf5', '#0984e3', '#00b894', '#e17055', '#e84393', '#f39c12'];

/** 独立正文 → 导出适配：把章/卷包装成旧导出函数期望的卡片/编组表（writingOnly 语义） */
function manuscriptAsCards(m: Manuscript): Record<string, Card> {
  const out: Record<string, Card> = {};
  for (const ch of m.chapters) {
    out[ch.id] = {
      id: ch.id, kind: 'note', sectionId: '', title: ch.title, content: ch.content,
      writingOnly: true, groupId: ch.volumeId, order: ch.order,
      x: 0, y: 0, w: 0, h: 0, z: 0, createdAt: ch.createdAt, updatedAt: ch.updatedAt,
    };
  }
  return out;
}
function manuscriptAsGroups(m: Manuscript): Record<string, CardGroup> {
  const out: Record<string, CardGroup> = {};
  for (const v of m.volumes) {
    out[v.id] = { id: v.id, name: v.name, color: '#6a5cf5', createdAt: v.createdAt, order: v.order, writingOnly: true };
  }
  return out;
}

export default function WritingMode({ onClose }: Props) {
  const cards = useStudio((s) => s.cards); // 画布卡片：仅用于「分区资料」按需参考（6.6 纯净环境）
  const sections = useStudio((s) => s.sections);
  const meta = useStudio((s) => s.meta);
  const msVolumes = useStudio((s) => s.manuscript.volumes);
  const msChapters = useStudio((s) => s.manuscript.chapters);
  const msTrash = useStudio((s) => s.manuscript.trash);
  const msAddVolume = useStudio((s) => s.msAddVolume);
  const msUpdateVolume = useStudio((s) => s.msUpdateVolume);
  const msRemoveVolume = useStudio((s) => s.msRemoveVolume);
  const msMoveVolume = useStudio((s) => s.msMoveVolume);
  const msAddChapter = useStudio((s) => s.msAddChapter);
  const msUpdateChapter = useStudio((s) => s.msUpdateChapter);
  const msMoveChapter = useStudio((s) => s.msMoveChapter);
  const msDeleteChapters = useStudio((s) => s.msDeleteChapters);
  const msRestoreChapter = useStudio((s) => s.msRestoreChapter);
  const msPurgeChapter = useStudio((s) => s.msPurgeChapter);
  const msClearMsTrash = useStudio((s) => s.msClearMsTrash);
  /** 章节字段更新（兼容旧变量名） */
  const updateCard = (id: string, patch: { title?: string; content?: import('../types').JSONDoc | null; volumeId?: string }) => msUpdateChapter(id, patch);
  const deleteCards = (ids: string[]) => msDeleteChapters(ids);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refCardId, setRefCardId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [sideMode, setSideMode] = useState<'chapters' | 'sections'>('chapters');
  const [kw, setKw] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [volumeFilter, setVolumeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'default' | 'time' | 'words' | 'name'>('default');
  const [exportScope, setExportScope] = useState<'whole' | 'chapter' | 'volume'>('whole');
  const [exportChapterId, setExportChapterId] = useState<string>('');
  const [exportVolumeId, setExportVolumeId] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [multiMode, setMultiMode] = useState(false);
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [batchVolumeId, setBatchVolumeId] = useState('');
  const [volumeMoreId, setVolumeMoreId] = useState<string | null>(null);
  const [chapterMoreId, setChapterMoreId] = useState<string | null>(null);
  const [writeTrashOpen, setWriteTrashOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState<boolean>(() => window.innerWidth < 768);

  // 不再根据名称自动把“卷”编组标记为 writingOnly，避免误伤普通卡片导致主画布卡片消失。
  // 正文创作专用的卷/章只会通过「新建卷 / 新建章」显式创建。

  const chapters = useMemo(() => {
    const list = msChapters;
    if (sortBy === 'name') {
      return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN') || a.createdAt - b.createdAt);
    }
    if (sortBy === 'time') {
      return [...list].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt) || a.createdAt - b.createdAt);
    }
    if (sortBy === 'words') {
      return [...list].sort((a, b) => docWordCount(b.content) - docWordCount(a.content) || a.createdAt - b.createdAt);
    }
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
  }, [msChapters, sortBy]);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return chapters.filter((c) => {
      if (volumeFilter === 'none' && c.volumeId) return false;
      if (volumeFilter !== 'all' && volumeFilter !== 'none' && c.volumeId !== volumeFilter) return false;
      return !q || (c.title || '').toLowerCase().includes(q) || (c.content ? JSON.stringify(c.content).toLowerCase().includes(q) : false);
    });
  }, [chapters, kw, volumeFilter]);

  const selected = selectedId ? msChapters.find((c) => c.id === selectedId) || null : null;
  const refCard = refCardId ? cards[refCardId] : null;

  const refSec = refCard ? sections.find((x) => x.id === refCard.sectionId) : null;

  const sectionCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    const list = Object.values(cards);
    for (const c of list) {
      if (sectionFilter === 'none' && c.sectionId) continue;
      if (sectionFilter !== 'all' && sectionFilter !== 'none' && c.sectionId !== sectionFilter) continue;
      const key = c.sectionId || '__none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].map(([secId, list2]) => {
      const sorted = [...list2];
      if (sortBy === 'name') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN') || a.createdAt - b.createdAt);
      else if (sortBy === 'time') sorted.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt) || a.createdAt - b.createdAt);
      else if (sortBy === 'words') sorted.sort((a, b) => docWordCount(b.content) - docWordCount(a.content) || a.createdAt - b.createdAt);
      else sorted.sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
      return {
        section: secId === '__none' ? undefined : sections.find((x) => x.id === secId),
        list: sorted,
      };
    });
  }, [cards, sections, sectionFilter, sortBy]);

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id);
  }, [selectedId, filtered]);

  const selectCard = (id: string) => {
    setSelectedId(id);
  };

  const createChapter = () => {
    const id = msAddChapter({ volumeId: volumeFilter !== 'all' && volumeFilter !== 'none' ? volumeFilter : undefined });
    selectCard(id);
  };

  const move = (dir: -1 | 1) => {
    if (!filtered.length) return;
    const idx = filtered.findIndex((c) => c.id === selectedId);
    if (idx < 0) return;
    const next = filtered[idx + dir];
    if (next) selectCard(next.id);
  };

  const exportCurrent = (format: 'md' | 'doc' | 'txt' | 'epub' | 'pdf') => {
    if (!meta) return;
    const msAsCards = manuscriptAsCards(useStudio.getState().manuscript);
    const msAsGroups = manuscriptAsGroups(useStudio.getState().manuscript);
    let outCards = msAsCards;
    let outGroups = msAsGroups;
    let outName = meta.name || '未命名小说';
    if (exportScope === 'chapter') {
      const chapter = exportChapterId ? msChapters.find((c) => c.id === exportChapterId) : selected;
      if (!chapter) {
        toast('请选择要导出的章节', 'warn');
        return;
      }
      outCards = { [chapter.id]: msAsCards[chapter.id] };
      outGroups = {};
      outName = chapter.title || '未命名章节';
    } else if (exportScope === 'volume') {
      const gid = exportVolumeId || selected?.volumeId || '';
      if (!gid || !msAsGroups[gid]) {
        toast('请选择要导出的卷', 'warn');
        return;
      }
      const list = msChapters.filter((c) => c.volumeId === gid);
      if (!list.length) {
        toast('当前卷还没有可导出的章节', 'warn');
        return;
      }
      outCards = Object.fromEntries(list.map((c) => [c.id, msAsCards[c.id]]));
      outGroups = { [gid]: msAsGroups[gid] };
      outName = msAsGroups[gid].name || '未命名卷';
    }
    const name = outName.replace(/[\\/:*?"<>|]/g, '_');
    if (format === 'md') {
      download(`${name}.md`, projectToNovelMarkdown(meta, outCards, outGroups), 'text/markdown;charset=utf-8');
    } else if (format === 'doc') {
      download(`${name}.doc`, projectToNovelHtml(meta, outCards, outGroups), 'application/msword');
    } else if (format === 'txt') {
      download(`${name}.txt`, projectToNovelTxt(meta, outCards, outGroups), 'text/plain;charset=utf-8');
    } else if (format === 'epub') {
      exportNovelEpub(meta, outCards, outGroups);
    } else if (format === 'pdf') {
      exportNovelPdf(meta, outCards, outGroups);
    }
  };


  const grouped = useMemo(() => {
    const map = new Map<string, { group?: (typeof msVolumes)[number]; list: typeof msChapters }>();
    // 先放入所有卷（包括空卷），避免“建了卷却看不到”
    for (const g of msVolumes) {
      map.set(g.id, { group: g, list: [] });
    }
    map.set('__none', { group: undefined, list: [] });
    for (const c of filtered) {
      const key = c.volumeId && msVolumes.some((g) => g.id === c.volumeId) ? c.volumeId : '__none';
      if (!map.has(key)) map.set(key, { group: key === '__none' ? undefined : msVolumes.find((g) => g.id === key), list: [] });
      map.get(key)!.list.push(c);
    }
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      if (a[0] === '__none') return 1;
      if (b[0] === '__none') return -1;
      const ga = a[1].group;
      const gb = b[1].group;
      if (sortBy === 'name') return (ga?.name || '').localeCompare(gb?.name || '', 'zh-CN') || (ga?.createdAt || 0) - (gb?.createdAt || 0);
      if (sortBy === 'time') return (gb?.createdAt || 0) - (ga?.createdAt || 0) || (ga?.order ?? 0) - (gb?.order ?? 0);
      if (sortBy === 'words') {
        const wa = a[1].list.reduce((sum, c) => sum + docWordCount(c.content), 0);
        const wb = b[1].list.reduce((sum, c) => sum + docWordCount(c.content), 0);
        return wb - wa || (ga?.order ?? 0) - (gb?.order ?? 0);
      }
      return (ga?.order ?? ga?.createdAt ?? 0) - (gb?.order ?? gb?.createdAt ?? 0);
    });
    return entries;
  }, [filtered, msVolumes, msChapters, sortBy]);

  const moveGroup = (gid: string, dir: -1 | 1) => msMoveVolume(gid, dir);

  const moveChapter = (id: string, dir: -1 | 1) => msMoveChapter(id, dir);

  // ---- 多选批量移动（像编组页面一样，可批量操作章节）----
  const toggleMulti = (id: string) => {
    setMultiIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const clearMulti = () => setMultiIds([]);
  const batchMoveToVolume = () => {
    if (!multiIds.length) return;
    const gid = batchVolumeId || undefined;
    const name = gid ? (msVolumes.find((v) => v.id === gid)?.name || '卷') : '未分卷';
    multiIds.forEach((id) => msUpdateChapter(id, { volumeId: gid }));
    toast(`已将 ${multiIds.length} 个章节移入「${name}」`, 'ok');
    setMultiIds([]);
  };
  const batchDelete = async () => {
    if (!multiIds.length) return;
    if (await csConfirm(`删除所选 ${multiIds.length} 个章节？（可在正文回收站找回）`)) {
      msDeleteChapters(multiIds);
      toast('已删除所选章节', 'ok');
      setMultiIds([]);
    }
  };
  const batchShift = (dir: -1 | 1) => {
    const sel = multiIds.filter((id) => msChapters.some((c) => c.id === id));
    if (!sel.length) return;
    const gids = new Set(sel.map((id) => msChapters.find((c) => c.id === id)?.volumeId || ''));
    if (gids.size > 1) { toast('请先选择同一卷的章节再批量移动顺序', 'warn'); return; }
    const gid = [...gids][0];
    const list = msChapters
      .filter((c) => (c.volumeId || '') === gid)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
    const idxs = sel.map((id) => list.findIndex((x) => x.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    const contiguous = idxs.every((v, i) => i === 0 || v === idxs[i - 1] + 1);
    if (!contiguous) { toast('所选章节需连续，才可批量上移 / 下移', 'warn'); return; }
    const minIdx = idxs[0];
    const maxIdx = idxs[idxs.length - 1];
    const target = dir < 0 ? minIdx - 1 : maxIdx + 1;
    if (target < 0 || target >= list.length) { toast('已在边界', 'warn'); return; }
    const next = [...list];
    const block = next.splice(minIdx, maxIdx - minIdx + 1);
    next.splice(target, 0, ...block);
    next.forEach((c, i) => { if ((c.order ?? i) !== i) msUpdateChapter(c.id, { order: i }); });
    toast('已批量移动章节顺序', 'ok');
  };
  const selectAllFiltered = () => setMultiIds((prev) => (filtered.length && prev.length === filtered.length ? [] : filtered.map((c) => c.id)));
  const isAllFilteredSelected = !!filtered.length && multiIds.length === filtered.length;

  // —— 目录栏：分卷统计与层级展示辅助 ——
  const wVolCount = msVolumes.length;
  const hasNoVolChapters = msChapters.some((c) => !c.volumeId);
  const searching = kw.trim().length > 0;
  /** 把 #rrggbb 转 rgba（带透明度），用于卷标题的分层底色 */
  const hexA = (hex: string | undefined, a: number) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(178,190,195,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  return (
    <div className={`writing-mode ${sideCollapsed ? 'side-collapsed' : ''}`}>
      <div className="wm-side">
        <div className="wm-side-head">
          <b><PencilIcon size={15} /> 正文创作</b>
          <span className="wm-side-actions">
            <span className="wm-side-badge-wrap">
              <button className="modal-x" title="正文回收站" onClick={() => { setWriteTrashOpen(true); setMultiMode(false); clearMulti(); }}><TrashColorIcon size={15} /></button>
              {msTrash.length > 0 && <span className="wm-side-badge">{msTrash.length}</span>}
            </span>
            <button className="modal-x" title="收起目录" onClick={() => setSideCollapsed(true)}>‹</button>
            <button className="modal-x" onClick={onClose}><CloseIcon size={14} /></button>
          </span>
        </div>
        <div className="wm-tools">
          <div className="wm-side-summary">
            <span className="wm-ss-item"><i><BoxIcon size={13} /></i>卷 {wVolCount}{hasNoVolChapters ? '＋未分卷' : ''}</span>
            <span className="wm-ss-item"><i><DocIcon size={13} /></i>{searching ? `${filtered.length}/${chapters.length}` : chapters.length} 章</span>
          </div>
          <input placeholder="搜索章节…" value={kw} onChange={(e) => setKw(e.target.value)} />
          {sideMode === 'chapters' ? (
            <select value={volumeFilter} onChange={(e) => setVolumeFilter(e.target.value)} title="按卷筛选正文">
              <option value="all">📚 全部卷</option>
              <option value="none">📭 未分卷</option>
              {msVolumes.map((g) => (
                <option key={g.id} value={g.id}>📦 {g.name}</option>
              ))}
            </select>
          ) : (
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} title="按分区筛选资料">
              <option value="all">🗂 全部分区</option>
              <option value="none">📄 未分区</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} title="排序方式">
            <option value="default">默认排序</option>
            <option value="time">按时间</option>
            <option value="words">按字数</option>
            <option value="name">按名称</option>
          </select>
          <div className="wm-tool-row">
            <button className={`btn small ${sideMode === 'chapters' ? 'active' : ''}`} onClick={() => setSideMode('chapters')}><BookIcon size={13} /> 目录</button>
            <button className={`btn small ${sideMode === 'sections' ? 'active' : ''}`} onClick={() => setSideMode('sections')}><FolderIcon size={13} /> 分区</button>
          </div>
          <div className="wm-tool-row">
            <button className="btn small primary" onClick={createChapter}>＋ 新建章</button>
            <button className="btn small" onClick={() => msAddVolume()}>＋ 新建卷</button>
          </div>
          <div className="wm-tool-row">
            <button className={`btn small ${!multiMode ? 'active' : ''}`} onClick={() => { setMultiMode(false); clearMulti(); }}><SingleSelectIcon size={13} /> 单选</button>
            <button className={`btn small ${multiMode ? 'active' : ''}`} onClick={() => { setMultiMode(true); }} title="多选后可批量移动章节到卷 / 批量删除 / 批量调整顺序"><MultiSelectIcon size={13} /> 多选</button>
          </div>
          {multiMode && <div className="wm-multi-hint"><MultiSelectIcon size={13} /> 多选模式：点选章节标题即可勾选，底部可批量移动到卷 / 排序 / 删除</div>}
          <select value={exportScope} onChange={(e) => {
            const v = e.target.value as 'whole' | 'chapter' | 'volume';
            setExportScope(v);
            if (v === 'chapter') setExportChapterId(selected?.id || chapters[0]?.id || '');
            if (v === 'volume') setExportVolumeId(selected?.volumeId || msVolumes[0]?.id || '');
          }} title="导出范围">
            <option value="whole">📚 整本</option>
            <option value="chapter">📄 单章</option>
            <option value="volume">📦 单卷</option>
          </select>
          {exportScope === 'chapter' && (
            <select value={exportChapterId} onChange={(e) => setExportChapterId(e.target.value)} title="选择要导出的章节">
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.title || '未命名章节'}</option>
              ))}
            </select>
          )}
          {exportScope === 'volume' && (
            <select value={exportVolumeId} onChange={(e) => setExportVolumeId(e.target.value)} title="选择要导出的卷">
              {msVolumes.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          <div className="wm-tool-row">
            <button className="btn small" onClick={() => exportCurrent('md')}>MD</button>
            <button className="btn small" onClick={() => exportCurrent('doc')}>Word</button>
            <button className="btn small" onClick={() => exportCurrent('txt')}>TXT</button>
          </div>
          <div className="wm-tool-row">
            <button className="btn small" onClick={() => exportCurrent('epub')}>EPUB</button>
            <button className="btn small" onClick={() => exportCurrent('pdf')}>PDF</button>
          </div>
        </div>
        {sideMode === 'chapters' ? (
          <div className="wm-list outline-chapters">
            {grouped.map(([key, { group, list }]) => {
              if (key === '__none' && list.length === 0) return null;
              const isCollapsed = !!collapsed[key];
              const gcolor = group ? VOLUME_COLORS[(group.order ?? 0) % VOLUME_COLORS.length] : '#b2bec3';
              const title = group ? group.name : '未分卷';
              return (
                <div key={key} className="outline-sec">
                  <div
                    className="outline-sec-title"
                    style={{ ['--vc' as string]: gcolor }}
                    onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <button className="g-fold" title={isCollapsed ? '展开' : '折叠'}>{isCollapsed ? '▸' : '▾'}</button>
                    <span className="sec-dot" style={{ background: gcolor }} />
                    <span className="g-name">{group ? <><BoxIcon size={13} /> {title}</> : <><InboxIcon size={13} /> 未分卷</>}</span>
                    <em className="g-count">{list.length} 章</em>
                    {group && (
                      <span className="outline-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="row-more" title="卷操作（移动 / 重命名 / 删除）" onClick={() => setVolumeMoreId(volumeMoreId === group.id ? null : group.id)}>⋯</button>
                      </span>
                    )}
                  </div>
                  {isCollapsed ? (
                    <div className="muted pad-sm">（已折叠 {list.length} 张章节）</div>
                  ) : (
                    <div className="wm-ch-list">
                      {list.map((c, ci) => (
                        <div
                          key={c.id}
                          className={`wm-item ${multiMode ? (multiIds.includes(c.id) ? 'active' : '') : (selectedId === c.id ? 'active' : '')}`}
                          title={c.title || '未命名章节'}
                          onClick={() => { if (multiMode) { toggleMulti(c.id); return; } selectCard(c.id); }}
                        >
                          {multiMode && <span className={`wm-item-check ${multiIds.includes(c.id) ? 'on' : ''}`}>{multiIds.includes(c.id) ? '✓' : ''}</span>}
                          <span className="wm-idx" style={{ color: gcolor, background: hexA(gcolor, 0.12) }}>{String(ci + 1).padStart(2, '0')}</span>
                          <span className="wm-item-title">{c.title || '未命名章节'}</span>
                          <span className="wm-item-wc">{docWordCount(c.content).toLocaleString()}字</span>
                          {!multiMode && (
                            <span className="outline-actions" onClick={(e) => e.stopPropagation()}>
                              <button className="row-more" title="章节操作（移动卷 / 上移 / 下移 / 重命名 / 删除）" onClick={() => setChapterMoreId(chapterMoreId === c.id ? null : c.id)}>⋯</button>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!filtered.length && <div className="muted pad">还没有正文，点「新建章」开始写作</div>}
            {multiMode && multiIds.length > 0 && (
              <div className="wm-batch-toolbar">
                <span className="wm-batch-count">{multiIds.length} 已选{isAllFilteredSelected ? '（已全选）' : ''}</span>
                <select className="wm-batch-vol" value={batchVolumeId} onChange={(e) => setBatchVolumeId(e.target.value)} title="移动到卷">
                  <option value="">📭 未分卷</option>
                  {msVolumes.map((g) => (
                    <option key={g.id} value={g.id}>📦 {g.name}</option>
                  ))}
                </select>
                <button className="wm-batch-mini primary" onClick={batchMoveToVolume}><GroupIcon size={13} /> 移到卷</button>
                <button className="wm-batch-mini" onClick={() => batchShift(-1)}>↑ 上移</button>
                <button className="wm-batch-mini" onClick={() => batchShift(1)}>↓ 下移</button>
                <button className="wm-batch-mini" onClick={selectAllFiltered}>{isAllFilteredSelected ? <><ReloadIcon size={13} /> 取消全选</> : <><CheckIcon size={13} /> 全选</>}</button>
                <button className="wm-batch-mini danger" onClick={batchDelete}><TrashColorIcon size={13} /> 删除</button>
                <button className="wm-batch-mini" onClick={() => { setMultiMode(false); clearMulti(); }}><CloseIcon size={13} /> 退出</button>
              </div>
            )}
          </div>
        ) : (
          <div className="wm-list wm-section-list">
            {sectionCards.map(({ section, list }) => {
              if (!list.length) return null;
              const secKey = section?.id || '__none';
              const isCollapsed = !!sectionCollapsed[secKey];
              return (
                <div key={secKey} className="wm-group">
                  <div className="wm-group-title" onClick={() => setSectionCollapsed((prev) => ({ ...prev, [secKey]: !prev[secKey] }))}>
                    <button className="g-fold" title={isCollapsed ? '展开分区' : '折叠分区'} onClick={(e) => { e.stopPropagation(); setSectionCollapsed((prev) => ({ ...prev, [secKey]: !prev[secKey] })); }}>
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                    <span className="wm-group-name">{section ? <><SectionIcon emoji={section.emoji} size={13} /> {section.name}</> : <><DocIcon size={13} /> 未分区</>}</span>
                    <em>{list.length}</em>
                  </div>
                  {!isCollapsed && list.map((c) => {
                    const expanded = expandedCardId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`wm-item ${refCardId === c.id ? 'active' : ''} ${expanded ? 'expanded' : ''}`}
                        onClick={() => {
                          setRefCardId(c.id);
                          setExpandedCardId(expanded ? null : c.id);
                        }}
                        title={c.title || '未命名卡片'}
                      >
                        <button
                          className="wm-item-expand"
                          title={expanded ? '收起内容' : '展开内容'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCardId(expanded ? null : c.id);
                            setRefCardId(c.id);
                          }}
                        >
                          {expanded ? '▾' : '▸'}
                        </button>
                        <span className="wm-item-title">{c.title || '未命名卡片'}</span>
                        <span className="wm-item-wc">{docWordCount(c.content).toLocaleString()}字</span>
                        {expanded && (
                          <div className="wm-item-preview rich-static" dangerouslySetInnerHTML={{ __html: docToHtml(c.content) }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!sectionCards.some((g) => g.list.length) && <div className="muted pad">还没有可参考的分区资料</div>}
          </div>
        )}
      </div>

      <div className="wm-main">
        {selected ? (
          <>
            <div className="wm-main-bar">
              {sideCollapsed && (
                <button className="btn small" title="展开目录" onClick={() => setSideCollapsed(false)}><BookIcon size={13} /> 目录</button>
              )}
              {selected && (
                <>
                </>
              )}
              <input
                className="wm-title-input"
                value={selected.title}
                placeholder="未命名章节"
                onChange={(e) => updateCard(selected.id, { title: e.target.value })}
              />
              <span className="wm-wc">{docWordCount(selected.content).toLocaleString()} 字</span>
              <select
                className="wm-chapter-select"
                value={selectedId || ''}
                onChange={(e) => selectCard(e.target.value)}
                title="切换章节"
              >
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.title || '未命名章节'}</option>)}
              </select>
              <select
                value={selected.volumeId || ''}
                onChange={(e) => updateCard(selected.id, { volumeId: e.target.value || undefined })}
                title="所属卷"
              >
                <option value="">未分卷</option>
                {msVolumes.map((g) => <option key={g.id} value={g.id}>📦 {g.name}</option>)}
              </select>
              <button className="btn small" onClick={() => move(-1)}>← 上一章</button>
              <button className="btn small" onClick={() => move(1)}>下一章 →</button>
              <button className="btn small primary" title="新建章节" onClick={createChapter}>＋ 新建章</button>
              <button className="btn primary" onClick={onClose}>完成</button>
            </div>
            <div className="wm-editor paper-body">
              <div className="paper-stage a4">
                <div className="paper-sheet">
                  <RichEditor
                    key={selected.id}
                    doc={selected.content}
                    onChange={(doc) => updateCard(selected.id, { content: doc })}
                    onEscape={onClose}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="wm-empty">
            <p>请选择或新建一个章节开始写作</p>
            {sideCollapsed && <button className="btn" onClick={() => setSideCollapsed(false)}><BookIcon size={13} /> 展开目录</button>}
            <button className="btn primary" onClick={createChapter}>＋ 新建章</button>
          </div>
        )}
        {refCard && (
          <div className="wm-ref-popup" onPointerDown={(e) => e.stopPropagation()}>
            <div className="wm-ref-popup-head">
              <b>{refCard.title || '未命名卡片'}</b>
              <span>{refSec ? <><SectionIcon emoji={refSec.emoji} size={12} /> {refSec.name}</> : '未分区'}</span>
              <button className="modal-x" onClick={() => setRefCardId(null)}><CloseIcon size={13} /></button>
            </div>
            <div className="wm-ref-popup-body rich-static" dangerouslySetInnerHTML={{ __html: docToHtml(refCard.content) }} />
          </div>
        )}
      </div>

      {writeTrashOpen && createPortal((
        <div className="wm-trash-overlay" onClick={() => setWriteTrashOpen(false)}>
          <div className="wm-trash-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wm-trash-head">
              <b><TrashColorIcon size={15} /> 正文回收站</b>
              <span className="wm-side-actions">
                <button className="btn small danger" onClick={async () => { if (await csConfirm('清空正文回收站？')) msClearMsTrash(); }}>清空</button>
                <button className="modal-x" onClick={() => setWriteTrashOpen(false)}><CloseIcon size={13} /></button>
              </span>
            </div>
            <div className="wm-trash-body">
              {msTrash.length === 0 ? (
                <div className="muted pad">正文回收站是空的</div>
              ) : (
                <>
                  <div className="muted pad-sm">共 {msTrash.length} 章，可恢复或彻底删除</div>
                  {msTrash.map((item, i) => (
                    <div key={item.chapter.id} className="wm-item wm-trash-item">
                      <span className="wm-item-title">{item.chapter.title || '未命名章节'}</span>
                      <span className="wm-item-wc">{docWordCount(item.chapter.content).toLocaleString()}字</span>
                      <span className="wm-item-actions">
                        <button title="恢复到目录" onClick={() => msRestoreChapter(i)}><RestoreIcon size={14} /></button>
                        <button title="彻底删除" className="wm-del-btn" onClick={async () => { if (await csConfirm(`彻底删除「${item.chapter.title || '未命名章节'}」？`)) msPurgeChapter(i); }}><TrashColorIcon size={13} /></button>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {volumeMoreId && createPortal((() => {
        const g = msVolumes.find((x) => x.id === volumeMoreId);
        if (!g) return null;
        const ids = msChapters.filter((c) => c.volumeId === g.id).map((c) => c.id);
        return (
          <>
            <div className="sidebar-sheet-mask" onClick={() => setVolumeMoreId(null)} />
            <div className="sidebar-sheet">
              <div className="sidebar-sheet-title"><BoxIcon size={14} /> {g.name}（{ids.length} 章）</div>
              <button onClick={() => { moveGroup(g.id, -1); setVolumeMoreId(null); }}>↑ 上移卷</button>
              <button onClick={() => { moveGroup(g.id, 1); setVolumeMoreId(null); }}>↓ 下移卷</button>
              <button onClick={async () => { const name = await csPrompt('卷名：', g.name); if (name?.trim()) msUpdateVolume(g.id, { name: name.trim() }); setVolumeMoreId(null); }}><PencilIcon size={13} /> 重命名卷</button>
              <button onClick={async () => { if (await csConfirm(`删除卷「${g.name}」？其中 ${ids.length} 章将移到未分卷。`)) { msRemoveVolume(g.id, false); setMultiIds([]); setVolumeMoreId(null); } }}><TrashColorIcon size={13} /> 删除卷（章节移到未分卷）</button>
              <button className="danger" onClick={async () => { if (await csConfirm(`删除卷「${g.name}」及其中 ${ids.length} 章？章节将进入正文回收站。`)) { msRemoveVolume(g.id, true); setMultiIds([]); setVolumeMoreId(null); } }}><TrashColorIcon size={13} /> 删除卷及内容（章节进回收站）</button>
              <button className="cancel" onClick={() => setVolumeMoreId(null)}>取消</button>
            </div>
          </>
        );
      })(), document.body)}
      {chapterMoreId && createPortal((() => {
        const ch = msChapters.find((x) => x.id === chapterMoreId);
        if (!ch) return null;
        return (
          <>
            <div className="sidebar-sheet-mask" onClick={() => setChapterMoreId(null)} />
            <div className="sidebar-sheet">
              <div className="sidebar-sheet-title"><DocIcon size={14} /> {ch.title || '未命名章节'}</div>
              <div className="sidebar-sheet-field">
                <span className="muted">移动到卷</span>
                <select
                  className="wm-item-vol"
                  value={ch.volumeId || ''}
                  onChange={(e) => updateCard(ch.id, { volumeId: e.target.value || undefined })}
                >
                  <option value="">📭 未分卷</option>
                  {msVolumes.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <button onClick={() => { moveChapter(ch.id, -1); setChapterMoreId(null); }}>↑ 上移章节</button>
              <button onClick={() => { moveChapter(ch.id, 1); setChapterMoreId(null); }}>↓ 下移章节</button>
              <button onClick={async () => { const name = await csPrompt('章节名称：', ch.title || ''); if (name?.trim()) updateCard(ch.id, { title: name.trim() }); setChapterMoreId(null); }}><PencilIcon size={13} /> 重命名</button>
              <button className="danger" onClick={async () => { if (await csConfirm(`删除章节「${ch.title || '未命名'}」？`)) deleteCards([ch.id]); setChapterMoreId(null); }}><TrashIcon size={15} /> 删除章节（进回收站）</button>
              <button className="cancel" onClick={() => setChapterMoreId(null)}>取消</button>
            </div>
          </>
        );
      })(), document.body)}
</div>
  );
}
