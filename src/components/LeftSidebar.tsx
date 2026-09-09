/**
 * ============ 左侧栏 ============
 *  · 分区/页面树：展开收起、增删改分区、页面切换
 *  · 事件/卡片搜索、卡片池（未排期）、排序入口
 * 移动端折叠为抽屉（App 内 mobilePanel 控制）。
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 左侧栏：分区 / 编组 / 图层 / 历史 ============
import { Fragment, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useStudio } from '../store';
import { SECTION_PRESETS } from '../defaults';
import type { Card, Edge, Section } from '../types';
import { TrashIcon, FolderIcon, ClipboardIcon, ClockIcon, LayersIcon, ArrowBackIcon, SearchIcon, PaletteIcon, PencilIcon, TrashColorIcon, AddIcon, CopyIcon, GroupIcon, UngroupIcon, ImageIcon, BrainIcon, DocIcon, BoxIcon, InboxIcon, SingleSelectIcon, MultiSelectIcon, ArrowUpIcon, ArrowDownIcon, SectionIcon, SparkleIcon } from './icons';
import { docWordCount } from '../tiptap';
import { PALETTE, toast } from '../util';

export default function LeftSidebar() {
  const tab = useStudio((s) => s.sidebarTab);
  const setTab = useStudio((s) => s.setSidebarTab);
  const historyLog = useStudio((s) => s.historyLog);
  const historyIdx = useStudio((s) => s.historyIdx);
  const restoreHistory = useStudio((s) => s.restoreHistory);
  const mobilePanel = useStudio((s) => s.mobilePanel);

  return (
    <div className={`sidebar-left ${mobilePanel === 'left' ? 'open' : ''}`}>
      <div className="sb-tabs">
        <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}><FolderIcon size={14} /> 分区</button>
        <button className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')}><ClipboardIcon size={14} /> 编组</button>
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><LayersIcon size={14} /> 图层</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><ClockIcon size={14} /> 历史</button>
      </div>

      {tab === 'sections' && <SectionsPanel />}
      {tab === 'outline' && <GroupsPanel />}
      {tab === 'layers' && <LayersPanel />}

      {tab === 'tree' && (
        <p className="muted pad">思维树已移至右侧栏（🧩 检查器所在面板旁的「🌳 思维」标签）。</p>
      )}

      {tab === 'history' && (
        <div className="sb-body history-body">
          <p className="muted layers-hint">操作历史（点击跳转，Ctrl+Z 撤销 / Ctrl+Y 重做）</p>
          {historyLog.length ? (
            <div className="history-list">
              {historyLog.map((h, i) => {
                const isCurrent = i === historyIdx;
                return (
                  <div
                    key={i}
                    className={`history-item ${isCurrent ? 'current' : ''}`} role="button" tabIndex={0} onKeyDown={(e) => { if (!isCurrent && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); restoreHistory(i); } }}
                    onClick={() => { if (!isCurrent) restoreHistory(i); }}
                    title={isCurrent ? '当前状态' : '点击跳转到该历史状态'}
                  >
                    <span className="history-idx">{i + 1}</span>
                    <span className="history-desc">{h.desc}</span>
                    <span className="history-time">{new Date(h.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                    {!isCurrent && (
                      <button className="history-restore" title="恢复到此处" onClick={(e) => { e.stopPropagation(); restoreHistory(i); }}><ArrowBackIcon size={13} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted pad">还没有操作记录</div>
          )}
          {historyIdx > 0 && (
            <button className="sec-add-btn" onClick={() => restoreHistory(0)}><ArrowBackIcon size={14} /> 恢复到初始状态</button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 通用：定位卡片 ----------
export function useFocusCard() {
  return (id: string, opts?: { keepSelection?: boolean }) => {
    const s = useStudio.getState();
    let c = s.cards[id];
    if (!c) return;
    // 如果卡片坐标异常，先把它放到当前视野中心，避免“图层有但看不到”
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      const wrapEl = document.querySelector('.canvas-wrap');
      const rect = wrapEl?.getBoundingClientRect();
      const w = rect?.width || window.innerWidth;
      const h = rect?.height || window.innerHeight;
      const vp = s.viewport;
      const cx = (w / 2 - vp.x) / vp.zoom;
      const cy = (h / 2 - vp.y) / vp.zoom;
      s.updateCard(id, { x: cx - c.w / 2, y: cy - c.h / 2 });
      c = s.cards[id];
    }
    // 多选模式（图层面板点击多选）下不重置选择
    if (!opts?.keepSelection) s.setSelection([id]);
    const wrapEl = document.querySelector('.canvas-wrap');
    const rect = wrapEl?.getBoundingClientRect();
    // 保留当前缩放：避免点击图层时视图突然放大/跳变（不跟手）
    const zoom = s.viewport.zoom;
    s.setViewport({
      zoom,
      x: (rect ? rect.width / 2 : window.innerWidth / 2) - (c.x + c.w / 2) * zoom,
      y: (rect ? rect.height / 2 : (window.innerHeight - 48) / 2) - (c.y + c.h / 2) * zoom,
    });
  };
}

// ---------- 通用：定位编组（并选中编组本身，不选中组内卡片） ----------
// 计算组内所有卡片的包围盒中心，把视口中心移到那里并选中编组；保留当前缩放。
function useFocusGroup() {
  return (gid: string) => {
    const s = useStudio.getState();
    const ids = Object.values(s.cards).filter((c) => !c.writingOnly && c.groupId === gid).map((c) => c.id);
    if (!ids.length) return;
    // 连坐标异常的组合都挑出来，先挪回当前视野中心，避免“图层勾选了却看不到”
    const wrapEl = document.querySelector('.canvas-wrap');
    const rect = wrapEl?.getBoundingClientRect();
    const zoom = s.viewport.zoom;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const anomalies: string[] = [];
    for (const id of ids) {
      const c = s.cards[id];
      if (!c) continue;
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) { anomalies.push(id); continue; }
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.w > maxX) maxX = c.x + c.w;
      if (c.y + c.h > maxY) maxY = c.y + c.h;
    }
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;
    // 全部坐标异常时，把异常卡挪到视野中心并把视野定到此处
    if (!ids.filter((id) => Number.isFinite(s.cards[id]?.x) && Number.isFinite(s.cards[id]?.y)).length) {
      const cx0 = (w / 2 - s.viewport.x) / zoom;
      const cy0 = (h / 2 - s.viewport.y) / zoom;
      for (const id of anomalies) {
        const c = s.cards[id];
        if (!c) continue;
        s.updateCard(id, { x: cx0 - c.w / 2, y: cy0 - c.h / 2 });
      }
      s.selectGroup(gid);
      return;
    }
    s.selectGroup(gid);
    const cxw = (minX + maxX) / 2;
    const cyw = (minY + maxY) / 2;
    s.setViewport({
      zoom,
      x: (rect ? rect.width / 2 : window.innerWidth / 2) - cxw * zoom,
      y: (rect ? rect.height / 2 : (window.innerHeight - 48) / 2) - cyw * zoom,
    });
  };
}

function matchesCard(c: Card, kw: string): boolean {
  if (!kw.trim()) return true;
  const q = kw.trim().toLowerCase();
  return (c.title || '').toLowerCase().includes(q) || (c.content ? JSON.stringify(c.content).toLowerCase().includes(q) : false);
}

function PanelTools({ kw, setKw, sort, setSort, sortOptions, extra }: {
  kw: string;
  setKw: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  sortOptions: { value: string; label: string }[];
  extra?: React.ReactNode;
}) {
  return (
    <div className="panel-tools">
      <input className="panel-search" placeholder="搜索…" value={kw} onChange={(e) => setKw(e.target.value)} />
      <select className="panel-select" value={sort} onChange={(e) => setSort(e.target.value)}>
        {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {extra}
    </div>
  );
}

// ================= 分区面板 =================
function SectionsPanel() {
  const sections = useStudio((s) => s.sections);
  const cards = useStudio((s) => s.cards);
  const sectionFilter = useStudio((s) => s.sectionFilter);
  const setSectionFilter = useStudio((s) => s.setSectionFilter);
  const updateSection = useStudio((s) => s.updateSection);
  const removeSection = useStudio((s) => s.removeSection);
  const addSection = useStudio((s) => s.addSection);
  const updateCard = useStudio((s) => s.updateCard);
  const setFullscreenCard = useStudio((s) => s.setFullscreenCard);
  const duplicateCards = useStudio((s) => s.duplicateCards);
  const deleteCards = useStudio((s) => s.deleteCards);
  const focusCard = useFocusCard();
  const [kw, setKw] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [showAdd, setShowAdd] = useState(false);
  const [moreSecId, setMoreSecId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of Object.values(cards).filter((c) => !c.writingOnly)) m[c.sectionId] = (m[c.sectionId] || 0) + 1;
    return m;
  }, [cards]);

  const filteredSections = useMemo(() => {
    let list = sections.filter((sec) => {
      if (!kw.trim()) return true;
      const q = kw.trim().toLowerCase();
      if (sec.name.toLowerCase().includes(q) || sec.emoji.includes(q)) return true;
      return Object.values(cards).filter((c) => !c.writingOnly).some((c) => c.sectionId === sec.id && matchesCard(c, kw));
    });
    if (sortBy === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    else if (sortBy === 'count') list = [...list].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    return list;
  }, [sections, cards, kw, sortBy, counts]);

  const ungroupedCards = useMemo(() => Object.values(cards).filter((c) => !c.writingOnly).filter((c) => !c.sectionId && matchesCard(c, kw)), [cards, kw]);

  const cardRow = (c: Card, sec?: Section) => (
    <div key={c.id} className="outline-item" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusCard(c.id); } }} onClick={() => focusCard(c.id)} onDoubleClick={() => setFullscreenCard(c.id)} title={c.title || '未命名卡片'}>
      <span className="layer-dot" style={{ background: c.color || sec?.color || '#b2bec3' }} />
      <span className="outline-title">{c.title || '未命名卡片'}</span>
      <span className="outline-actions" onClick={(e) => e.stopPropagation()}>
        <button title="全屏编辑" onClick={() => setFullscreenCard(c.id)}><PencilIcon size={13} /></button>
        <button title="复制卡片" onClick={() => duplicateCards([c.id])}><CopyIcon size={13} /></button>
        <button title="删除卡片（进回收站）" onClick={() => { deleteCards([c.id]); toast('已删除', 'ok'); }}><TrashIcon size={13} /></button>
      </span>
    </div>
  );

  const unusedPresets = SECTION_PRESETS.filter((p) => !sections.some((s) => s.name === p.name));

  return (
    <div className="sb-body">
      <PanelTools
        kw={kw}
        setKw={setKw}
        sort={sortBy}
        setSort={setSortBy}
        sortOptions={[
          { value: 'default', label: '默认排序' },
          { value: 'name', label: '按名称' },
          { value: 'count', label: '按卡片数' },
        ]}
      />
      <p className="muted layers-hint">分区管理：点击筛选画布；可排序 / 改色 / 重命名 / 删除（含内容）</p>
      <div
        className={`sec-item ${sectionFilter === 'all' ? 'active' : ''}`}
        role="button" tabIndex={0}
        onClick={() => setSectionFilter('all')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSectionFilter('all'); } }}
      >
        <span className="sec-emoji"><FolderIcon size={14} /></span>
        <span className="sec-name">全部</span>
        <span className="sec-count">{Object.values(cards).filter((c) => !c.writingOnly).length}</span>
      </div>
      {filteredSections.map((sec) => (
        <Fragment key={sec.id}>
        <div
          className={`sec-item ${sectionFilter === sec.id ? 'active' : ''}`}
          role="button" tabIndex={0}
          onClick={() => setSectionFilter(sec.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSectionFilter(sec.id); } }}
        >
          <span className="sec-dot" style={{ background: sec.color }} />
          <span className="sec-emoji"><SectionIcon emoji={sec.emoji} size={15} /></span>
          <span className="sec-name">{sec.name}</span>
          <span className="sec-count">{counts[sec.id] || 0}</span>
          {/* 行内只保留「⋯」；操作在子项正下方展开内嵌面板 */}
          <span className="sec-actions" onClick={(e) => e.stopPropagation()}>
            <button className="row-more" title="更多操作" aria-haspopup="menu" aria-expanded={moreSecId === sec.id} onClick={() => setMoreSecId(moreSecId === sec.id ? null : sec.id)}>⋯</button>
          </span>
        </div>
        {moreSecId === sec.id && (
          <div className="row-inline-panel" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { useStudio.getState().moveSection(sec.id, -1); setMoreSecId(null); }}>↑ 上移</button>
            <button onClick={() => { useStudio.getState().moveSection(sec.id, 1); setMoreSecId(null); }}>↓ 下移</button>
            <div className="sidebar-sheet-field"><span className="muted"><PaletteIcon size={13} /> 改颜色</span></div>
            <div className="palette-row">
              {PALETTE.map((color) => (
                <button key={color} title={color} style={{ background: color, width: 22, height: 22, borderRadius: 6, cursor: 'pointer', border: sec.color?.toLowerCase() === color.toLowerCase() ? '2px solid var(--text)' : 'none' }} onClick={() => { updateSection(sec.id, { color }); toast('已更新分区颜色', 'ok'); }} />
              ))}
            </div>
            <button onClick={async () => {
              const name = await csPrompt('分区名称：', sec.name);
              if (name?.trim()) updateSection(sec.id, { name: name.trim() });
              setMoreSecId(null);
            }}><PencilIcon size={13} /> 重命名</button>
            <button className="danger" onClick={async () => {
              const ids = Object.values(useStudio.getState().cards).filter((c) => !c.writingOnly && c.sectionId === sec.id).map((c) => c.id);
              if (await csConfirm(`删除分区「${sec.name}」及区内 ${ids.length} 张卡片？卡片会进入回收站。`)) {
                if (ids.length) deleteCards(ids);
                removeSection(sec.id);
                toast('已删除分区及内容', 'ok');
              }
              setMoreSecId(null);
            }}><TrashColorIcon size={13} /> 删除分区及内容</button>
            <button onClick={() => { removeSection(sec.id, ''); toast('已删除分区（卡片移至未分区）', 'ok'); setMoreSecId(null); }}><TrashColorIcon size={13} /> 仅删除分区（卡片保留）</button>
          </div>
        )}
        </Fragment>
      ))}
      {ungroupedCards.length > 0 && (
        <div className={`sec-item ${sectionFilter === '' ? 'active' : ''}`} role="button" tabIndex={0} style={{ borderLeft: sectionFilter === '' ? '3px solid #b2bec3' : '3px solid transparent' }} onClick={() => setSectionFilter('')}>
          <span className="sec-dot" style={{ background: '#b2bec3' }} />
          <span className="sec-emoji"><DocIcon size={14} /></span>
          <span className="sec-name">未分区</span>
          <span className="sec-count">{ungroupedCards.length}</span>
        </div>
      )}
      {showAdd ? (
        <div className="sec-add">
          {unusedPresets.slice(0, 12).map((p) => (
            <button key={p.name} onClick={() => { addSection(p.name, p.emoji); setShowAdd(false); }}>
              <SectionIcon emoji={p.emoji} size={13} /> {p.name}
            </button>
          ))}
          {!unusedPresets.length && <span className="muted">所有分区都已添加</span>}
        </div>
      ) : (
        <button className="sec-add-btn" onClick={() => setShowAdd(true)}><AddIcon size={14} /> 添加分区</button>
      )}


    </div>
  );
}

// ================= 编组面板 =================
function GroupsPanel() {
  const groups = useStudio((s) => s.groups);
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const sectionFilter = useStudio((s) => s.sectionFilter);
  const selection = useStudio((s) => s.selection);
  const createGroup = useStudio((s) => s.createGroup);
  const dissolveGroup = useStudio((s) => s.dissolveGroup);
  const updateGroupName = useStudio((s) => s.updateGroupName);
  const updateGroup = useStudio((s) => s.updateGroup);
  const updateCard = useStudio((s) => s.updateCard);
  const setFullscreenCard = useStudio((s) => s.setFullscreenCard);
  const duplicateCards = useStudio((s) => s.duplicateCards);
  const deleteCards = useStudio((s) => s.deleteCards);
  const focusCard = useFocusCard();
  const focusGroup = useFocusGroup();
  const [kw, setKw] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [memberSortBy, setMemberSortBy] = useState('default');
  const [selectMode, setSelectMode] = useState<'single' | 'multi'>('multi');
  const [ungroupedCollapsed, setUngroupedCollapsed] = useState(false);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [groupMoreId, setGroupMoreId] = useState<string | null>(null);

  const sortedCards = useMemo(
    () => Object.values(cards)
      .filter((c) => !c.writingOnly && (sectionFilter === 'all' || c.sectionId === sectionFilter))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt),
    [cards, sectionFilter],
  );
  const sortMembers = (list: Card[]) => {
    return [...list].sort((a, b) => {
      if (memberSortBy === 'name') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
      if (memberSortBy === 'time') return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      if (memberSortBy === 'words') return docWordCount(b.content) - docWordCount(a.content);
      return (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt;
    });
  };

  // 按编组（文件夹）分组：组内卡片一块；未编组卡片进「未编组」
  const groupMembers = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const c of sortedCards) {
      if (!matchesCard(c, kw)) continue;
      const key = c.groupId || '';
      (map[key] ||= []).push(c);
    }
    return map;
  }, [sortedCards, kw]);
  const ungrouped2 = groupMembers[''] || [];
  const groupList = Object.values(groups)
    .filter((g) => !g.writingOnly)
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const moveCard = (c: Card, dir: -1 | 1) => {
    const list = Object.values(cards)
      .filter((x) => !x.writingOnly && x.sectionId === c.sectionId)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    const idx = list.findIndex((x) => x.id === c.id);
    const target = list[idx + dir];
    if (!target) return;
    updateCard(c.id, { order: target.order ?? idx + dir });
    updateCard(target.id, { order: c.order ?? idx });
  };

  const moveGroup = (gid: string, dir: -1 | 1) => {
    const all = Object.values(groups)
      .filter((g) => !g.writingOnly)
      .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
    const idx = all.findIndex((g) => g.id === gid);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= all.length) return;
    const next = [...all];
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((g, i) => updateGroup(g.id, { order: i }));
  };

  const cardRow = (c: Card, inGroup: boolean) => {
    const sec = sections.find((x) => x.id === c.sectionId);
    const open = moreId === c.id;
    return (
      <Fragment key={c.id}>
      <div className={`outline-item ${open ? 'more-open' : ''} ${selection.includes(c.id) ? 'active' : ''}`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusCard(c.id); } }} onClick={(e) => {
        const st = useStudio.getState();
        const wantMulti = selectMode === 'multi' || e.shiftKey || e.ctrlKey || e.metaKey;
        if (wantMulti) {
          if (st.selection.includes(c.id)) st.setSelection(st.selection.filter((x) => x !== c.id));
          else st.setSelection([...st.selection, c.id]);
        } else {
          focusCard(c.id);
        }
      }} title={c.title || '未命名卡片'}>
        <span className="layer-dot" style={{ background: c.color || sec?.color || '#b2bec3' }} />
        <span className="outline-title">{c.title || '未命名卡片'}</span>
        {sec && <em className="outline-sec-hint"><SectionIcon emoji={sec.emoji} size={12} /></em>}
        {/* 行内只保留「⋯」；操作在子项正下方展开内嵌面板 */}
        <span className="outline-actions" onClick={(e) => e.stopPropagation()}>
          <button className="row-more" title="更多操作" aria-haspopup="menu" aria-expanded={moreId === c.id} onClick={() => setMoreId(open ? null : c.id)}>⋯</button>
        </span>
      </div>
      {open && (
        <div className="row-inline-panel" onClick={(e) => e.stopPropagation()}>
          {c.groupId && <button onClick={() => { updateCard(c.id, { groupId: undefined }); setMoreId(null); toast('已取消编组', 'ok'); }}><UngroupIcon size={13} /> 取消编组</button>}
          <button onClick={() => { moveCard(c, -1); setMoreId(null); }}><ArrowUpIcon size={13} /> 上移</button>
          <button onClick={() => { moveCard(c, 1); setMoreId(null); }}><ArrowDownIcon size={13} /> 下移</button>
          <button onClick={() => { setFullscreenCard(c.id); setMoreId(null); }}><PencilIcon size={13} /> 编辑</button>
          <button onClick={() => { duplicateCards([c.id]); setMoreId(null); }}><CopyIcon size={13} /> 复制</button>
          <button className="danger" onClick={() => { deleteCards([c.id]); toast('已删除', 'ok'); setMoreId(null); }}><TrashColorIcon size={13} /> 删除</button>
        </div>
      )}
      </Fragment>
    );
  };

  return (
    <div className="sb-body outline-body">
      <PanelTools
        kw={kw}
        setKw={setKw}
        sort={sortBy}
        setSort={setSortBy}
        sortOptions={[
          { value: 'default', label: '默认排序' },
          { value: 'name', label: '按名称' },
          { value: 'count', label: '按卡片数' },
          { value: 'time', label: '按时间' },
          { value: 'words', label: '按字数' },
        ]}
        extra={
          <select
            className="panel-select"
            value={memberSortBy}
            onChange={(e) => setMemberSortBy(e.target.value)}
            title="编组内卡片排序"
            aria-label="编组内卡片排序"
          >
            <option value="default">组内默认</option>
            <option value="name">组内名称</option>
            <option value="time">组内时间</option>
            <option value="words">组内字数</option>
          </select>
        }
      />
      <div className="layer-select-mode" role="group" aria-label="编组选择模式">
        <button className={selectMode === 'single' ? 'active' : ''} onClick={() => setSelectMode('single')}><SingleSelectIcon size={13} /> 单选</button>
        <button className={selectMode === 'multi' ? 'active' : ''} onClick={() => setSelectMode('multi')}><MultiSelectIcon size={13} /> 多选</button>
      </div>
      <p className="muted layers-hint">文件夹管理卡片：点击文件夹可折叠，卡片可移动归类/编辑</p>
      {groupList.map((g) => {
        const members = sortMembers(groupMembers[g.id] || []);
        const collapsed = !!collapsedGroups[g.id];
        return (
          <div key={g.id} className="outline-sec">
            <div className="outline-sec-title" role="button" tabIndex={0} title="点击跳转到该编组（▾/▸ 仅折叠）"
              onClick={() => focusGroup(g.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusGroup(g.id); } }}
            >
              <button className="g-fold" title={collapsed ? '展开' : '折叠'} onClick={(e) => { e.stopPropagation(); setCollapsedGroups((p) => ({ ...p, [g.id]: !collapsed })); }}>
                {collapsed ? '▸' : '▾'}
              </button>
              <span className="sec-dot" style={{ background: g.color }} />
              <span className="g-name"><BoxIcon size={14} /> {g.name}</span>
              <em>{members.length} 张</em>
              <span className="outline-actions" onClick={(e) => e.stopPropagation()}>
                <button className="row-more" title="编组操作" aria-expanded={groupMoreId === g.id} onClick={(e) => { e.stopPropagation(); setGroupMoreId(groupMoreId === g.id ? null : g.id); }}>⋯</button>
              </span>
            </div>
            {groupMoreId === g.id && (
              <div className="row-inline-panel" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { moveGroup(g.id, -1); setGroupMoreId(null); }}>↑ 上移</button>
                <button onClick={() => { moveGroup(g.id, 1); setGroupMoreId(null); }}>↓ 下移</button>
                <button onClick={async () => { const name = await csPrompt('编组名称：', g.name); if (name?.trim()) updateGroupName(g.id, name.trim()); setGroupMoreId(null); }}><PencilIcon size={13} /> 重命名</button>
                <button onClick={async () => { if (await csConfirm(`解散编组「${g.name}」？组内卡片不会被删除。`)) dissolveGroup(g.id); setGroupMoreId(null); }}><UngroupIcon size={13} /> 解散编组</button>
                <button className="danger" onClick={async () => {
                  const ids = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === g.id).map((c) => c.id);
                  if (await csConfirm(`删除编组「${g.name}」及组内 ${ids.length} 张卡片？卡片会进入回收站。`)) {
                    deleteCards(ids);
                    dissolveGroup(g.id);
                  }
                  setGroupMoreId(null);
                }}><TrashColorIcon size={13} /> 删除编组及内容</button>
              </div>
            )}
            {collapsed ? (
              <div className="muted pad-sm">（已折叠 {members.length} 张卡片）</div>
            ) : (
              members.map((c) => cardRow(c, true))
            )}
          </div>
        );
      })}
      {ungrouped2.length > 0 && (
        <div className="outline-sec">
          <div className="outline-sec-title" style={{ borderLeft: '3px solid #b2bec3', paddingLeft: 6 }}>
            <button className="g-fold" onClick={() => setUngroupedCollapsed(!ungroupedCollapsed)}>{ungroupedCollapsed ? '▸' : '▾'}</button>
            <span className="sec-dot" style={{ background: '#b2bec3' }} />
            <span className="g-name"><InboxIcon size={14} /> 未编组</span>
            <em>{ungrouped2.length} 张</em>
          </div>
          {ungroupedCollapsed ? (
            <div className="muted pad-sm">（已折叠 {ungrouped2.length} 张卡片）</div>
          ) : (
            sortMembers(ungrouped2).map((c) => cardRow(c, false))
          )}
        </div>
      )}
      {!groupList.length && !ungrouped2.length && <div className="muted pad">画布还是空的，双击空白处新建卡片吧 <SparkleIcon size={14} /></div>}


      {selection.filter((id) => cards[id] && !cards[id].writingOnly).length > 1 && (
        <div className="layer-toolbar bottom-toolbar">
          <button onClick={() => createGroup(selection.filter((id) => cards[id] && !cards[id].writingOnly))}><GroupIcon size={13} /> 编组所选</button>
          <button className="danger" onClick={() => deleteCards(selection.filter((id) => cards[id] && !cards[id].writingOnly))}><TrashColorIcon size={13} /> 删除所选</button>
        </div>
      )}


    </div>
  );
}

// ================= 图层面板（按分区查看 + 点击跳转定位）=================
function LayersPanel() {
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const groups = useStudio((s) => s.groups);
  const selection = useStudio((s) => s.selection);
  const focusCard = useFocusCard();
  const [kw, setKw] = useState('');
  const [sortBy, setSortBy] = useState('created');
  const sortedAll = useMemo(() => {
    let list = Object.values(cards).filter((c) => !c.writingOnly && matchesCard(c, kw));
    if (sortBy === 'title') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
    else if (sortBy === 'updated') list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sortBy === 'created') list = [...list].sort((a, b) => a.createdAt - b.createdAt);
    else if (sortBy === 'words') list = [...list].sort((a, b) => docWordCount(b.content) - docWordCount(a.content));
    else list = [...list].sort((a, b) => b.z - a.z);
    return list;
  }, [cards, kw, sortBy, selection]);
  // 按分区（section）分组展示，未分区归到最后
  const grouped = useMemo(() => {
    const bySec = new Map<string, Card[]>();
    const noSec: Card[] = [];
    for (const c of sortedAll) {
      if (c.sectionId) {
        if (!bySec.has(c.sectionId)) bySec.set(c.sectionId, []);
        bySec.get(c.sectionId)!.push(c);
      } else {
        noSec.push(c);
      }
    }
    const arr: { sec: Section | null; list: Card[] }[] = [];
    for (const sec of sections) {
      const list = bySec.get(sec.id);
      if (list && list.length) arr.push({ sec, list });
    }
    if (noSec.length) arr.push({ sec: null, list: noSec });
    return arr;
  }, [sortedAll, sections]);
  return (
    <div className="sb-body layers-body">
      <PanelTools
        kw={kw}
        setKw={setKw}
        sort={sortBy}
        setSort={setSortBy}
        sortOptions={[
          { value: 'z', label: '图层顺序' },
          { value: 'title', label: '按标题' },
          { value: 'updated', label: '按更新时间' },
          { value: 'created', label: '按创建时间' },
          { value: 'words', label: '按字数' },
        ]}
      />
      <p className="muted layers-hint">按分区查看图层，点击卡片跳转定位</p>
      {grouped.map((g) => (
        <div key={g.sec ? g.sec.id : '__none'} className="layer-group">
          <div className="layer-group-title" style={{ borderLeftColor: g.sec?.color || '#b2bec3' }}>
            <span className="sec-dot" style={{ background: g.sec?.color || '#b2bec3' }} />
            <span className="sec-emoji">{g.sec ? <SectionIcon emoji={g.sec.emoji} size={14} /> : <DocIcon size={14} />}</span>
            <span className="sec-name">{g.sec ? g.sec.name : '未分区'}</span>
            <span className="sec-count">{g.list.length}</span>
          </div>
          {g.list.map((c) => {
            const grp = c.groupId ? groups[c.groupId] : null;
            return (
              <div key={c.id} className={`layer-item ${selection.includes(c.id) ? 'active' : ''}`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusCard(c.id); } }} onClick={() => focusCard(c.id)} title="点击跳转定位">
                <span className="layer-dot" style={{ background: c.color || g.sec?.color || '#b2bec3' }} />
                <span className="layer-kind">{c.kind === 'image' ? <ImageIcon size={13} /> : c.mode === 'node' ? <BrainIcon size={13} /> : <DocIcon size={13} />}</span>
                <span className="layer-title">{c.title || '未命名卡片'}</span>
                {grp && <span className="layer-sec" title={grp.name}><BoxIcon size={12} /></span>}
              </div>
            );
          })}
        </div>
      ))}
      {!sortedAll.length && <div className="muted pad">没有匹配的卡片</div>}
    </div>
  );
}

