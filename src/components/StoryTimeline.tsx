/**
 * ============ 故事时间轴视图 ============
 * 按时间组织卡片（日期/阶段），支持：
 *  · 时间缩放拖动、卡片聚焦（联动画布选中）
 *  · 按状态/分区筛选、标注时间段（排期提示）
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStudio } from '../store';
import type { Card, EraRange, EraSetting } from '../types';
import { CAL_STATUS } from './cardStatus';
import { toast } from '../util';
import { ClockIcon, GearColorIcon, PinColorIcon, CalendarColorIcon, CloseIcon, CheckCircleIcon, LinkColorIcon, InboxIcon, PencilIcon, SunIcon, MoonIcon, MorningIcon, ExclaimIcon, ArrowBackIcon, ArrowRightIcon, BoxIcon } from './icons';

type Gran = 'd' | 'w' | 'm';
type EraKey = 'past' | 'now' | 'future';
type DpKey = 'morning' | 'noon' | 'night' | 'none';
const ERA_KEYS: EraKey[] = ['past', 'now', 'future'];
const ERA_META: Record<EraKey, { label: string; icon: ReactNode; bar: string; soft: string }> = {
  past: { label: '过去', icon: <ArrowBackIcon size={13} />, bar: '#8e6fe0', soft: 'rgba(142,111,224,.10)' },
  now: { label: '现在', icon: <PinColorIcon size={13} />, bar: '#1ea393', soft: 'rgba(30,163,147,.09)' },
  future: { label: '未来', icon: <ArrowRightIcon size={13} />, bar: '#4a90dd', soft: 'rgba(74,144,221,.09)' },
};
const GRAN_META: Record<Gran, { label: string }> = { d: { label: '日' }, w: { label: '周' }, m: { label: '月' } };
const DP_META: Record<DpKey, { label: string; icon: ReactNode; soft: string }> = {
  morning: { label: '早', icon: <MorningIcon size={13} />, soft: 'rgba(255,190,60,.10)' },
  noon: { label: '午', icon: <SunIcon size={13} />, soft: 'rgba(255,140,20,.10)' },
  night: { label: '晚', icon: <MoonIcon size={13} />, soft: 'rgba(95,90,220,.10)' },
  none: { label: '未定时', icon: <BoxIcon size={13} />, soft: 'transparent' },
};
const DP_ORDER: DpKey[] = ['morning', 'noon', 'night', 'none'];
const EV_TYPE_META: Record<NonNullable<Card['evType']>, string> = { main: '主线', side: '支线', daily: '日常', seed: '伏笔' };
const EV_TYPE_COLOR: Record<NonNullable<Card['evType']>, string> = { main: '#e05f6d', seed: '#c98a3d', side: '#5b9df0', daily: '#8a7bd8' };
const EV_RANK_META: Record<NonNullable<Card['evRank']>, string> = { high: '关键', mid: '重要', low: '普通' };
const SEASONS: { key: string; label: string; color: string }[] = [
  { key: '春', label: '春', color: '#7cb342' },
  { key: '夏', label: '夏', color: '#f0883e' },
  { key: '秋', label: '秋', color: '#c98a3d' },
  { key: '冬', label: '冬', color: '#5b9df0' },
];

// ---------- 日期工具 ----------
const pad = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');
/** 宽松日期：年 1~4 位、月/日 1~2 位；缺省都按 1；缺年份用今年 */
const mkDate = (yy: string, mm: string, dd: string) => {
  const y4 = yy ? +yy : new Date().getFullYear();
  const m = mm ? Math.min(12, Math.max(1, +mm)) : 1;
  const dm = new Date(y4, m, 0).getDate();
  const d = dd ? Math.min(dm, Math.max(1, +dd)) : 1;
  return `${pad4(y4)}-${pad(m)}-${pad(d)}`;
};
/** 规范日期为 4位年-2位月-2位日（用于比较/染色，避免位数不一致导致排序错乱） */
const normDate = (k?: string): string | undefined => {
  if (!k) return k;
  const m = k.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return k;
  return `${pad4(+m[1])}-${pad(+m[2])}-${pad(+m[3])}`;
};
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const addDays = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a: string, b: string) => Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const fmtMD = (k: string) => `${+k.slice(5, 7)}/${+k.slice(8, 10)}`;
const fmtYMD = (k: string) => `${+k.slice(0, 4)}年${+k.slice(5, 7)}月${+k.slice(8, 10)}日`;
const wdCN = (k: string) => WEEK_CN[parseKey(k).getDay()];
const monthDays = (y: number, m: number) => [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const inRange = (r: EraRange | undefined, key: string) => !!r && !!r.start && !!r.end && key >= r.start && key <= r.end;
const eraOf = (e: EraSetting | undefined, key: string): EraKey | null => {
  if (!e) return null;
  const nk = normDate(key);
  if (!nk) return null;
  if (inRange(e.past, nk)) return 'past';
  if (inRange(e.now, nk)) return 'now';
  if (inRange(e.future, nk)) return 'future';
  return null;
};
const seasonOf = (k: string) => {
  const m = +k.slice(5, 7);
  if (m >= 3 && m <= 5) return SEASONS[0];
  if (m >= 6 && m <= 8) return SEASONS[1];
  if (m >= 9 && m <= 11) return SEASONS[2];
  return SEASONS[3];
};
const dpOf = (c: Card): DpKey => {
  if (c.daypart) return c.daypart;
  if (c.time) {
    const h = +c.time.slice(0, 2);
    if (h < 12) return 'morning';
    if (h < 18) return 'noon';
    return 'night';
  }
  return 'none';
};
const isSpan = (c: Card) => !!c.date && !!c.endDate && c.endDate > c.date;

/** 年月日数字输入组：三位填齐立即生效；离开输入框时，缺的月/日自动按 1 补上 */
function NumDate({ value, onChange, alt }: { value?: string; onChange: (v?: string) => void; alt?: string }) {
  const p = (value || '').split('-');
  const [y, setY] = useState(p[0] ? String(+p[0]) : '');
  const [mo, setMo] = useState(p[1] || '');
  const [da, setDa] = useState(p[2] || '');
  useEffect(() => { const q = (value || '').split('-'); setY(q[0] ? String(+q[0]) : ''); setMo(q[1] || ''); setDa(q[2] || ''); }, [value]);
  const upd = (ny: string, nm: string, nd: string) => {
    const yy = ny.replace(/\D/g, '').slice(0, 4);
    const mm = nm.replace(/\D/g, '').slice(0, 2);
    const dd = nd.replace(/\D/g, '').slice(0, 2);
    setY(yy); setMo(mm); setDa(dd);
    if (!yy && !mm && !dd) onChange(undefined);
    else if (yy && mm && dd) { const v = mkDate(yy, mm, dd); setMo(v.slice(5, 7)); setDa(v.slice(8, 10)); onChange(v); }
  };
  const commit = () => {
    const yy = y, mm = mo, dd = da;
    if (!yy && !mm && !dd) { onChange(undefined); return; }
    const v = mkDate(yy, mm, dd);
    onChange(v);
    setMo(v.slice(5, 7)); setDa(v.slice(8, 10));
  };
  return (
    <span className="tl-numdate" title={alt || (value ? fmtYMD(value) : '')}>
      <input inputMode="numeric" placeholder="年" maxLength={4} value={y} onChange={(e) => upd(e.target.value, mo, da)} onBlur={commit} />
      <i>/</i>
      <input inputMode="numeric" placeholder="月" maxLength={2} value={mo} onChange={(e) => upd(y, e.target.value, da)} onBlur={commit} />
      <i>/</i>
      <input inputMode="numeric" placeholder="日" maxLength={2} value={da} onChange={(e) => upd(y, mo, e.target.value)} onBlur={commit} />
    </span>
  );
}

function EraPeriodEditor({ startV, endV, onStart, onEnd, startAlt, endAlt }: {
  startV?: string; endV?: string; onStart: (v?: string) => void; onEnd: (v?: string) => void;
  startAlt: string; endAlt: string;
}) {
  return (
    <span className="tl-dates">
      <span className="tl-date-end"><em>开始</em><NumDate alt={startAlt} value={startV} onChange={onStart} /></span>
      <b>~</b>
      <span className="tl-date-end"><em>结束</em><NumDate alt={endAlt} value={endV} onChange={onEnd} /></span>
    </span>
  );
}

// ============================================================
export default function StoryTimeline({ onClose, embedded = false, onGoCalendar, focusCardId }: {
  onClose: () => void; embedded?: boolean; onGoCalendar?: () => void; focusCardId?: string;
}) {
  const meta = useStudio((s) => s.meta);
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const patchMeta = useStudio((s) => s.patchMeta);
  const updateCard = useStudio((s) => s.updateCard);
  const setSelection = useStudio((s) => s.setSelection);
  const setModal = useStudio((s) => s.setModal);
  const setHubFocus = useStudio((s) => s.setHubFocus);

  const [gran, setGran] = useState<Gran>('d');
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EraSetting>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [evEdit, setEvEdit] = useState(false);
  // 伏笔账本浮层开关
  const [bookOpen, setBookOpen] = useState(false);
  // 事件账本：当前查看的事件类型（main/side/seed/daily）
  const [bookType, setBookType] = useState<NonNullable<Card['evType']>>('seed');
  const EV_TYPE_KEYS = Object.keys(EV_TYPE_META) as NonNullable<Card['evType']>[];
  // 从画布/关联事件跳转过来：选中该卡
  useEffect(() => {
    if (focusCardId) {
      setSelId(focusCardId); setEvEdit(false);
      setHubFocus(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCardId]);

  const eras = meta?.calEras || {};
  // 事件类型实际标签颜色：优先用户自定义，否则内置默认
  const evTypeColor = (t: 'main' | 'side' | 'daily' | 'seed') => meta?.evTypeColors?.[t] || EV_TYPE_COLOR[t];
  const secName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.id, s.name);
    return m;
  }, [sections]);
  const secColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.id, s.color);
    return m;
  }, [sections]);
  const secEmoji = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.id, s.emoji || '');
    return m;
  }, [sections]);

  const activeEra = (k: EraKey): { start: string; end: string } | null => {
    const r = eras[k];
    if (r?.start && r?.end) return { start: r.start, end: r.end };
    return null;
  };
  const timed = useMemo(() => Object.values(cards).filter((c) => !!c.date), [cards]);

  // 事件 → 归入三段（按其开始日期）；不在任一段 = out
  const byEra = useMemo(() => {
    const m: Record<EraKey, Card[]> = { past: [], now: [], future: [] };
    for (const c of timed) {
      const k = eraOf(eras, c.date!);
      if (k) m[k].push(c);
    }
    for (const k of ERA_KEYS) m[k].sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : (a.time || '').localeCompare(b.time || '')));
    return m;
  }, [timed, eras]);

  const outs = useMemo(() => {
    const arr: Card[] = [];
    for (const c of timed) if (!eraOf(eras, c.date!)) arr.push(c);
    return arr;
  }, [timed, eras]);

  // ---------- 行构建 ----------
  interface RowCol {
    id: string; label: string; sub: string; from: string; to: string; center: string;
    seasonIdx: number; dp: Record<DpKey, Card[]>;
  }
  interface SpanItem { card: Card; left: number; right: number }

  const buildRow = (eraKey: EraKey): { cols: RowCol[]; spans: SpanItem[][]; rng: { start: string; end: string }; hasEvents: boolean } | null => {
    const r = activeEra(eraKey);
    if (!r) return null;
    const evts = byEra[eraKey];
    const cols: RowCol[] = [];
    const spanCards = evts.filter((c) => isSpan(c));
    const spanIds = new Set(spanCards.map((c) => c.id));
    // 行内起点列 key：day/周一起点列/月初列
    let col0 = r.start;
    if (gran === 'w') {
      const dow = parseKey(r.start).getDay();
      col0 = addDays(r.start, dow === 0 ? -6 : 1 - dow);
    } else if (gran === 'm') col0 = `${r.start.slice(0, 4)}-${r.start.slice(5, 7)}-01`;
    const pushCol = (from: string, to: string) => {
      const center = addDays(from, Math.floor(diffDays(from, to) / 2));
      const dp: Record<DpKey, Card[]> = { morning: [], noon: [], night: [], none: [] };
      for (const c of evts) {
        if (spanIds.has(c.id)) continue;
        if (c.date! < from || c.date! > to) continue;
        dp[dpOf(c)].push(c);
      }
      for (const g of DP_ORDER) dp[g].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      cols.push({
        id: from, label: gran === 'd' ? fmtMD(from) : gran === 'w' ? fmtMD(from) : `${+from.slice(0, 4)}年${+from.slice(5, 7)}月`,
        sub: gran === 'd' ? `周${wdCN(from)}` : gran === 'w' ? '一周' : `${monthDays(+from.slice(0, 4), +from.slice(5, 7))}天`,
        from, to, center, seasonIdx: seasonOf(center).key === '春' ? 0 : seasonOf(center).key === '夏' ? 1 : seasonOf(center).key === '秋' ? 2 : 3,
        dp,
      });
    };
    const covers = (c: Card, from: string, to: string) => {
      const s = c.date!;
      const e = isSpan(c) ? c.endDate! : s;
      return s <= to && e >= from;
    };
    // 只铺“当天有添加过卡片”的日期列
    if (gran === 'd') {
      let k = r.start;
      let guard = 0;
      while (k <= r.end && guard < 5000) {
        guard++;
        const on = evts.some((c) => (isSpan(c) ? c.date === k || c.endDate === k : c.date === k));
        if (on) pushCol(k, k);
        k = addDays(k, 1);
      }
    } else if (gran === 'w') {
      let k = col0;
      let guard = 0;
      while (k <= r.end && guard < 900) {
        guard++;
        const e = addDays(k, 6);
        const end = e < r.end ? e : r.end;
        if (evts.some((c) => covers(c, k, end))) pushCol(k, end);
        k = addDays(k, 7);
      }
    } else {
      let y = +r.start.slice(0, 4), m = +r.start.slice(5, 7);
      let guard = 0;
      while (guard < 900) {
        guard++;
        const from = `${y}-${pad(m)}-01`;
        if (from > r.end) break;
        const toRaw = `${y}-${pad(m)}-${monthDays(y, m)}`;
        const to = toRaw < r.end ? toRaw : r.end;
        if (evts.some((c) => covers(c, from, to))) pushCol(from, to);
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    // 跨日横带：按实际列定位
    const colIdxOf = (key: string): number => {
      let i = cols.findIndex((c) => key >= c.from && key <= c.to);
      if (i < 0) {
        // 日期落在某两列之间的空档：找最后一个起点 ≤ key 的列
        for (let j = cols.length - 1; j >= 0; j--) if (cols[j].from <= key) { i = j; break; }
      }
      return Math.max(0, i);
    };
    const spanRows: SpanItem[][] = [];
    for (const c of spanCards) {
      const left = colIdxOf(c.date!);
      const right = Math.max(left, Math.min(cols.length - 1, colIdxOf(c.endDate!)));
      if (right <= left) {
        // 起止在同一列（周/月粒度内）：当作普通单格事件放回 dp
        continue;
      }
      const it = { card: c, left, right };
      let placed = false;
      for (const row of spanRows) if (row[row.length - 1].right < left) { row.push(it); placed = true; break; }
      if (!placed) spanRows.push([it]);
    }
    // 周/月粒度：未跨列的 span 卡也参与 dp 展示
    const innerSpans = new Set(spanCards.filter((c) => {
      const l = colIdxOf(c.date!);
      const r2 = Math.max(l, Math.min(cols.length - 1, colIdxOf(c.endDate!)));
      return r2 === l;
    }).map((c) => c.id));
    for (const col of cols) {
      for (const c of evts) {
        if (!innerSpans.has(c.id)) continue;
        if (c.date! < col.from || c.date! > col.to) continue;
        if (!col.dp[dpOf(c)].includes(c)) col.dp[dpOf(c)].push(c);
      }
      for (const g of DP_ORDER) col.dp[g].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }
    const hasEvents = spanRows.length > 0 || cols.some((c) => DP_ORDER.some((g) => c.dp[g].length > 0));
    return { cols, spans: spanRows, rng: r, hasEvents };
  };

  const rows = useMemo(() => {
    return ERA_KEYS.map((k) => ({ k, row: buildRow(k) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eras, gran, byEra]);

  const colW = gran === 'd' ? 72 : gran === 'w' ? 130 : 170;
  const setActive = (id: string) => { setSelId(id); setEvEdit(false); };

  // ---------- 时段设定 ----------
  const goCal = () => { if (onGoCalendar) onGoCalendar(); else setModal('calendar'); };
  const jumpCal = (d: string) => { setHubFocus({ date: d }); if (onGoCalendar) onGoCalendar(); else setModal('calendar'); };
  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(eras)) as EraSetting); setEditOpen(true); };
  const setEraDraft = (k: EraKey, v: EraRange | undefined) => {
    setDraft((d) => {
      const cur = v && (v.start || v.end) ? v : undefined;
      const n = { ...d };
      if (cur) n[k] = cur; else delete n[k];
      return n;
    });
  };
  const saveEras = () => {
    const next: EraSetting = {};
    for (const k of ERA_KEYS) {
      const r = draft[k];
      const s = r?.start, e = r?.end;
      if (!s && !e) continue; // 该段留空 = 不启用
      const start = s || e!;
      const end = e || s!;
      if (end < start) {
        toast(`${ERA_META[k].label}段：结束(${fmtYMD(end)})早于开始(${fmtYMD(start)})，请把两个日期对调`, 'err');
        return;
      }
      next[k] = { start, end };
    }
    patchMeta({ calEras: next });
    setEditOpen(false);
    toast(next.past || next.now || next.future ? '已保存三段时段' : '已清除时段设定', 'ok');
  };

  const sel = selId ? (cards[selId] || null) : null;

  // ---------- 事件时间段编辑 ----------
  const [dS, setDS] = useState<string | undefined>(undefined);
  const [dE, setDE] = useState<string | undefined>(undefined);
  const [dDP, setDDP] = useState<DpKey>('none');
  const [dT, setDT] = useState<string | undefined>(undefined);
  const openEvEdit = (c: Card) => {
    setSelId(c.id);
    setDS(c.date);
    setDE(c.endDate && c.endDate > c.date! ? c.endDate : undefined);
    setDDP(dpOf(c));
    setDT(c.time);
    setEvEdit(true);
  };
  const saveEv = () => {
    if (!sel) return;
    if (dS && dE && dE < dS) { toast('结束日期早于开始日期', 'err'); return; }
    const patch: Partial<Card> = {
      date: dS || undefined,
      endDate: dS && dE && dE !== dS ? dE : undefined,
      daypart: dDP === 'none' ? undefined : dDP,
      time: dT || undefined,
    };
    updateCard(sel.id, patch, { op: false });
    setEvEdit(false);
    toast('已更新事件时间', 'ok');
  };

  const totalActive = ERA_KEYS.filter((k) => activeEra(k)).length;

  // ---------- 伏笔账本（伏笔埋设 → 回收点双向联动） ----------
  // 数据契约：伏笔卡 = evType==='seed'；回收点卡 = 设置了 seedFor（指向某伏笔卡 id）。
  // 某伏笔是否「已回收」 = 存在任意回收点卡 seedFor 指向它。
  const allC = useMemo(() => Object.values(cards), [cards]);
  // 全部伏笔（无论是否已排进日历，都可作为被回收对象）
  const seedList = useMemo(() => allC.filter((c) => c.evType === 'seed'), [allC]);
  // 全部回收点（seedFor 非空的卡）
  const recyclers = useMemo(() => allC.filter((c) => !!c.seedFor), [allC]);
  // 伏笔 id → 指向它的回收点卡列表
  const bySeed = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const rc of recyclers) {
      const arr = m.get(rc.seedFor!) || [];
      if (!arr.includes(rc)) arr.push(rc);
      m.set(rc.seedFor!, arr);
    }
    return m;
  }, [recyclers]);
  const seedTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of seedList) m.set(s.id, s.title || '未命名');
    return m;
  }, [seedList]);
  const isRecycled = (seedId: string) => (bySeed.get(seedId) || []).length > 0;
  // 供「伏笔状态 / 回收的伏笔」下拉选择：所有伏笔（仅伏笔可选为被回收对象）
  const seedOptions = useMemo(() => seedList.slice().sort((a, b) => a.title.localeCompare(b.title)), [seedList]);

  // ---------- 事件账本：按事件类型分组（主线/伏笔/支线/日常均可查看账本） ----------
  // 当前类型下的事件卡（含排期与否，按发生日期排序）
  const typeEvents = useMemo(() => {
    const list = allC.filter((c) => c.evType === bookType);
    return list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || (a.title || '')));
  }, [allC, bookType]);
  // 各类型数量统计（用于按钮/切换条）
  const typeCount = useMemo(() => {
    const m: Record<string, number> = { main: 0, side: 0, seed: 0, daily: 0 };
    for (const c of allC) { if (c.evType) m[c.evType] = (m[c.evType] || 0) + 1; }
    return m;
  }, [allC]);

  return (
    <div className="tl-root">
      <div className="tl-top">
        {!embedded && (
        <div className="tl-title">
          <b><ClockIcon size={16} /> 故事时间轴</b>
          <span className="tl-title-sub">只显示已加入日历的卡片 · 过去 / 现在 / 未来分行</span>
        </div>
        )}
        <div className="tl-tools">
          <div className="tl-gran">
            {(Object.keys(GRAN_META) as Gran[]).map((g) => (
              <button key={g} className={g === gran ? 'on' : ''} onClick={() => setGran(g)}>{GRAN_META[g].label}</button>
            ))}
          </div>
          <button className="btn small" onClick={startEdit}><GearColorIcon size={13} /> 设定时段</button>
          <button
            className={`btn small ${bookOpen ? 'on' : ''}`}
            title="事件账本：主线 / 支线 / 伏笔 / 日常 分类型一览"
            onClick={() => setBookOpen((v) => !v)}
          ><PinColorIcon size={13} /> 事件账本{allC.some((c) => c.evType) ? `（${EV_TYPE_KEYS.map((k) => EV_TYPE_META[k]).join('/')} ${allC.filter((c) => c.evType).length}）` : ''}</button>
          {!embedded && (
            <>
              <button className="btn small ghost" onClick={() => goCal()}><CalendarColorIcon size={13} /> 日历</button>
              <button className="btn small ghost" title="关闭" onClick={onClose}><CloseIcon size={13} /></button>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <div className="tl-edit-mask" onClick={() => setEditOpen(false)}>
        <div className="tl-editor" onClick={(e) => e.stopPropagation()}>
          <div className="tl-editor-head">
            <b><GearColorIcon size={14} /> 设定故事三段时段</b>
            <span className="hint">只填「年」= 该年1/1；填「年+月」= 当月1日；只填一头 = 只设那一天；整行留空 = 不启用该段</span>
            <button type="button" className="tl-edit-x" onClick={() => setEditOpen(false)}><CloseIcon size={13} /></button>
          </div>
          <div className="tl-era-edits">
            {ERA_KEYS.map((k) => {
              const mt = ERA_META[k];
              const r = draft[k];
              return (
                <div key={k} className="tl-era-edit" style={{ borderColor: mt.bar }}>
                  <div className="tl-era-edit-name"><span style={{ background: mt.bar }} />{mt.icon} {mt.label}</div>
                  <EraPeriodEditor
                    startAlt={`${mt.label}段开始`} endAlt={`${mt.label}段结束`}
                    startV={r?.start} endV={r?.end}
                    onStart={(v) => setEraDraft(k, { ...(r || {}), start: v } as EraRange)}
                    onEnd={(v) => setEraDraft(k, { ...(r || {}), end: v } as EraRange)}
                  />
                  <span className="tl-days-hint">
                    {r?.start && r?.end
                      ? (r.start === r.end ? '共 1 天' : `共 ${diffDays(r.start, r.end) + 1} 天`)
                      : ((r?.start || r?.end) ? '另一头留空＝单日段' : '未启用')}
                  </span>
                  {(r?.start || r?.end) && <button type="button" className="tl-era-clear" title="清除该段" onClick={() => setEraDraft(k, undefined)}>✕</button>}
                </div>
              );
            })}
          </div>
          <div className="tl-editor-actions">
            <button className="btn" onClick={saveEras}><CheckCircleIcon size={13} /> 保存设定</button>
            <button className="btn ghost" onClick={() => setEditOpen(false)}>取消</button>
          </div>
        </div>
        </div>
      )}

      {/* 事件账本浮层：主线/支线/伏笔/日常 分类型一览（伏笔含埋设→回收点双向联动） */}
      {bookOpen && (
        <div className="tl-book-mask" onClick={() => setBookOpen(false)}>
          <div className="tl-book" onClick={(e) => e.stopPropagation()}
            style={{ borderColor: EV_TYPE_COLOR[bookType] }}>
            <div className="tl-book-head" style={{ background: EV_TYPE_COLOR[bookType] }}>
              <b><PinColorIcon size={14} /> {EV_TYPE_META[bookType]}账本</b>
              <span className="hint">{bookType === 'seed' ? '伏笔埋设与回收情况。给某张排期卡设「回收的伏笔」指向一条伏笔，即可双向联动：伏笔变「✅ 已回收」，卡片显示「回收『伏笔名』」。' : `该类型的全部事件一览（共 ${typeEvents.length} 张）。点条目可跳转到对应卡片。`}</span>
              <button type="button" className="tl-edit-x" onClick={() => setBookOpen(false)}><CloseIcon size={13} /></button>
            </div>

            {/* 事件类型切换条 */}
            <div className="tl-book-tabs">
              {EV_TYPE_KEYS.map((k) => (
                <button key={k} type="button" className={`tl-book-tab ${bookType === k ? 'on' : ''}`}
                  style={bookType === k ? { background: EV_TYPE_COLOR[k], color: '#fff', borderColor: EV_TYPE_COLOR[k] } : { color: EV_TYPE_COLOR[k], borderColor: EV_TYPE_COLOR[k] }}
                  onClick={() => setBookType(k)}>
                  <i style={{ background: EV_TYPE_COLOR[k] }} /> {EV_TYPE_META[k]}（{typeCount[k] || 0}）
                </button>
              ))}
            </div>

            {bookType === 'seed' ? (
              seedList.length === 0 && recyclers.length === 0 ? (
                <div className="tl-book-empty">
                  <div className="era-empty-ico"><InboxIcon size={26} /></div>
                  <p><b>还没有伏笔</b>，建一张 <b>evType=伏笔</b> 并排期的卡即可出现在这里。</p>
                  <p className="hint">把某事件的卡类型设成「伏笔」→ 再设计划回收日期；需要回收时另建事件卡设「回收的伏笔」指向它。</p>
                </div>
              ) : (
                <div className="tl-book-cols">
                  {/* 左列：伏笔埋设 + 回收状态 */}
                  <div className="tl-book-col" style={{ borderColor: 'rgba(201,138,61,.4)' }}>
                    <div className="tl-book-h" style={{ color: '#b0782f' }}><PinColorIcon size={13} /> 埋设的伏笔（{seedList.length}）</div>
                    {seedList.length === 0 && <div className="hint" style={{ padding: '6px 2px' }}>暂无伏笔卡；把事件卡类型设为「伏笔」后会列在这里。</div>}
                    <div className="tl-book-seeds">
                      {seedList.slice().sort((a, b) => (a.date || '').localeCompare(b.date || (a.title || ''))).map((sd) => {
                        const rec = bySeed.get(sd.id) || [];
                        const ok = rec.length > 0;
                        return (
                          <div key={sd.id} className={`tl-book-seed ${ok ? 'ok' : 'wait'}`}>
                            <div className="tl-book-seed-row" onClick={() => { setActive(sd.id); setBookOpen(false); }}>
                              <i style={{ background: EV_TYPE_COLOR.seed }} />
                              <b>{sd.title || '未命名'}</b>
                              <span className="tl-book-sub">
                                {sd.date ? `埋设 ${fmtYMD(sd.date)}` : '未排期'}
                                {sd.payDate ? ` · 计划 ${fmtMD(sd.payDate)}回收` : ''}
                              </span>
                              {ok
                                ? <em className="seed-ok">✅ 已回收</em>
                                : (sd.payDate && sd.date && sd.payDate < sd.date
                                  ? <em className="seed-late" style={{ color: '#e05f6d' }}>⚠ 已过回收点</em>
                                  : <em className="seed-wait">🐣 待回收</em>)}
                            </div>
                            {rec.length > 0 && (
                              <div className="tl-book-reclist">
                                <em className="hint">由以下回收点回收：</em>
                                {rec.map((rc) => (
                                  <button key={rc.id} type="button" className="era-out-chip clickable"
                                    onClick={() => { setActive(rc.id); setBookOpen(false); }}
                                    title={`回收点：${rc.title || '未命名'}@${rc.date ? fmtYMD(rc.date) : '未排期'}`}>
                                    <i style={{ background: '#4a90dd' }} />
                                    <b>{rc.date ? fmtMD(rc.date) : '?'}</b>
                                    <span>{rc.title || '未命名'}</span>
                                    <em>→ 回{fmtMD(sd.date || '')}</em>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 右列：回收点一览 */}
                  <div className="tl-book-col" style={{ borderColor: 'rgba(74,144,221,.4)' }}>
                    <div className="tl-book-h" style={{ color: '#2b6cb0' }}><LinkColorIcon size={13} /> 回收点（{recyclers.length}）</div>
                    {recyclers.length === 0 && <div className="hint" style={{ padding: '6px 2px' }}>给某张排期卡设「回收的伏笔」后会显示在这里。</div>}
                    <div className="tl-book-seeds">
                      {recyclers.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((rc) => (
                        <button key={rc.id} type="button" className="era-out-chip clickable tl-book-rc"
                          style={{ borderColor: '#4a90dd' }}
                          onClick={() => { setActive(rc.id); setBookOpen(false); }}
                          title={`${rc.title || '未命名'}｜${rc.date ? fmtYMD(rc.date) : '未排期'}｜回收「${seedTitle.get(rc.seedFor!) || ''}」`}>
                          <i style={{ background: '#4a90dd' }} />
                          {rc.date && <b className="cal-jump" onClick={(e) => { e.stopPropagation(); rc.date && jumpCal(rc.date); }}>{fmtMD(rc.date)}</b>}
                          <span>{rc.title || '未命名'}</span>
                          <em className="era-ev-sec">{secEmoji.get(rc.sectionId)}</em>
                          <em>→ 回收「{seedTitle.get(rc.seedFor!) || '?'}」</em>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            ) : typeEvents.length === 0 ? (
              <div className="tl-book-empty">
                <div className="era-empty-ico"><InboxIcon size={26} /></div>
                <p><b>还没有「{EV_TYPE_META[bookType]}」类型的事件</b>。把某张卡的 <b>evType</b> 设为「{EV_TYPE_META[bookType]}」后就会列在这里。</p>
                <p className="hint">在日历/预览面板里给卡片设置事件类型即可。</p>
              </div>
            ) : (
              <div className="tl-book-cols">
                <div className="tl-book-col" style={{ borderColor: `${EV_TYPE_COLOR[bookType]}55` }}>
                  <div className="tl-book-h" style={{ color: EV_TYPE_COLOR[bookType] }}><PinColorIcon size={13} /> {EV_TYPE_META[bookType]}事件（{typeEvents.length}）</div>
                  <div className="tl-book-seeds">
                    {typeEvents.map((c) => (
                      <div key={c.id} className="tl-book-seed wait" onClick={() => { setActive(c.id); setBookOpen(false); }}>
                        <div className="tl-book-seed-row" style={{ cursor: 'pointer' }}>
                          <i style={{ background: EV_TYPE_COLOR[bookType] }} />
                          <b>{c.title || '未命名'}</b>
                          <span className="tl-book-sub">
                            {c.date ? `发生 ${fmtYMD(c.date)}` : '未排期'}
                            {c.evRank ? ` · ${EV_RANK_META[c.evRank]}` : ''}
                          </span>
                          <em className="era-ev-sec">{secEmoji.get(c.sectionId)}</em>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="tl-body">
        {totalActive === 0 && timed.length === 0 ? (
          <div className="tl-empty">
            <div><ClockIcon size={26} /></div>
            <p>按<b>过去 / 现在 / 未来</b>三行铺开故事。</p>
            <p className="hint">还没有设定三段时段（可在日历先加卡片，再到时间轴设时段）。</p>
            <div className="tl-empty-btns">
              <button className="btn" onClick={startEdit}><GearColorIcon size={13} /> 设定过去 / 现在 / 未来</button>
              <button className="btn ghost" onClick={goCal}><CalendarColorIcon size={13} /> 去日历排期</button>
            </div>
          </div>
        ) : (
          <div className="tl-scroll" id="tl-scroll">
            <div className="tl-era-rows">
              {totalActive > 0 && rows.map(({ k, row }) => {
                const mt = ERA_META[k];
                if (!row) {
                  return (
                    <div key={k} className="era-row era-missing" style={{ borderColor: mt.bar }}>
                      <div className="era-row-head" style={{ background: mt.bar }}>
                        <span className="era-ico">{mt.icon}</span><b>{mt.label}</b>
                        <em className="era-no">该段尚未设定</em>
                      </div>
                      <div className="era-empty era-empty-act">
                        <div className="era-empty-ico"><InboxIcon size={24} /></div>
                        <p>「{mt.label}」还没有设定起止日期</p>
                        <div className="era-empty-btns">
                          <button className="btn tiny" onClick={startEdit}><GearColorIcon size={12} /> 去设定时段</button>
                          <button className="btn tiny ghost" onClick={goCal}><CalendarColorIcon size={12} /> 去日历排期</button>
                        </div>
                      </div>
                    </div>
                  );
                }
                const colCnt = Math.max(1, row.cols.length);
                const W = colCnt * colW + 12;
                // 季节带
                const seasonCells: { from: string; season: typeof SEASONS[number]; first: boolean }[] = [];
                let lastSeason = '';
                for (const c of row.cols) {
                  const s = seasonOf(c.center);
                  const first = s.key !== lastSeason;
                  seasonCells.push({ from: c.from, season: s, first });
                  lastSeason = s.key;
                }
                const emptyRow = !row.hasEvents;
                return (
                  <div key={k} className="era-row" style={{ borderColor: mt.bar }}>
                    <div className="era-row-head" style={{ background: mt.bar }}>
                      <span className="era-ico">{mt.icon}</span><b>{mt.label}</b>
                      <em className="era-range cal-jump" onClick={() => jumpCal(row.rng.start)}>{fmtMD(row.rng.start)} ~ {fmtMD(row.rng.end)} · {diffDays(row.rng.start, row.rng.end) + 1}天</em>
                      {row.cols.length > 0 && <em className="era-cnt">{byEra[k].length} 事件</em>}
                    </div>
                    {emptyRow ? (
                      <div className="era-empty era-empty-act">
                        <div className="era-empty-ico"><InboxIcon size={24} /></div>
                        <p>「{mt.label}」还没有已加入日历的卡片</p>
                        <div className="era-empty-btns">
                          <button className="btn tiny" onClick={goCal}><CalendarColorIcon size={12} /> 去日历添加卡片</button>
                          <button className="btn tiny ghost" onClick={startEdit}><GearColorIcon size={12} /> 调整时段</button>
                        </div>
                      </div>
                    ) : (
                      <div className="era-row-inner" style={{ width: W }}>
                        {/* 季节色带 */}
                        <div className="sk-band" style={{ gridTemplateColumns: `repeat(${colCnt}, 1fr)` }}>
                          {seasonCells.map((sc, i) => (
                            <div key={i} className="sk-cell" style={{ background: sc.season.color }} title={`${sc.season.label}季 · ${fmtMD(sc.from)}`}>
                              {sc.first ? sc.season.label : ''}
                            </div>
                          ))}
                        </div>
                        {/* 刻度 */}
                        <div className="era-cols-head" style={{ gridTemplateColumns: `repeat(${colCnt}, 1fr)` }}>
                          {row.cols.map((c) => (
                            <div key={c.id} className="era-head-cell" title={c.from === c.to ? `${fmtYMD(c.from)} 周${wdCN(c.from)}` : `${fmtYMD(c.from)} ~ ${fmtYMD(c.to)}`}>
                              <b>{c.label}</b>
                              {gran === 'd' && <em>{c.sub}</em>}
                            </div>
                          ))}
                        </div>
                        {/* 跨日横带 */}
                        {row.spans.length > 0 && (
                          <div className="era-span-rows" style={{ height: row.spans.length * 26 + 6 }}>
                            {row.spans.map((sp, ri) => sp.map(({ card: cd, left, right }) => {
                              const st = cd.status ? CAL_STATUS[cd.status] : null;
                              const colr = cd.color || secColor.get(cd.sectionId) || st?.dot || '#9aa0a6';
                              const active = selId === cd.id;
                              return (
                                <button key={cd.id} type="button" className={`era-span-evt ${active ? 'active' : ''}`}
                                  style={{ left: left * (W / colCnt) + 3, width: (right - left + 1) * (W / colCnt) - 6, top: ri * 26 + 5, borderColor: colr }}
                                  onClick={() => setActive(cd.id)}
                              title={`${cd.title || '未命名'}${secName.get(cd.sectionId) ? '｜' + secName.get(cd.sectionId) : ''}${(cd.tags || []).length ? '｜🏷 ' + (cd.tags || []).join('、') : ''}｜${fmtYMD(cd.date!)} ~ ${fmtYMD(cd.endDate!)}`}>
                              <i style={{ background: colr }} />
                              <em className="era-ev-sec">{secEmoji.get(cd.sectionId)}</em>
                              <b className="cal-jump" onClick={(e) => { e.stopPropagation(); jumpCal(cd.date!); }}>{fmtMD(cd.date!)}~{fmtMD(cd.endDate!)}</b>
                              <span>{cd.title || '未命名'}</span>
                                </button>
                              );
                            }))}
                          </div>
                        )}
                        {/* 事件格（按早/午/晚分组） */}
                        <div className="era-grid" style={{ gridTemplateColumns: `repeat(${colCnt}, 1fr)` }}>
                          {row.cols.map((c) => {
                            const era = k;
                            const hasAny = DP_ORDER.some((g) => c.dp[g].length > 0);
                            return (
                              <div key={c.id} className={`era-cell ${era ? 'era-cell-' + era : ''}`}>
                                {!hasAny && <div className="era-cell-none" />}
                                {DP_ORDER.map((g) => {
                                  const list = c.dp[g];
                                  if (!list.length) return null;
                                  return (
                                    <div key={g} className={`era-dp dp-${g}`} style={{ background: DP_META[g].soft }}>
                                      {gran === 'd' && <div className="era-dp-label">{DP_META[g].icon} {DP_META[g].label}</div>}
                                      {list.map((cd) => {
                                        const st = cd.status ? CAL_STATUS[cd.status] : null;
                                        const colr = cd.color || secColor.get(cd.sectionId) || st?.dot || '#9aa0a6';
                                        const active = selId === cd.id;
                                        return (
                                          <button key={cd.id} type="button" className={`era-evt ${active ? 'active' : ''}`}
                                            onClick={() => setActive(cd.id)}
                                            title={`${cd.title || '未命名'}${secName.get(cd.sectionId) ? '｜' + secName.get(cd.sectionId) : ''}${(cd.tags || []).length ? '｜🏷 ' + (cd.tags || []).join('、') : ''}${cd.time ? ' ' + cd.time : ''}${cd.daypart ? '·' + DP_META[cd.daypart].label : ''}`}>
                                            <i style={{ background: colr }} />
                                            <em className="era-ev-sec">{secEmoji.get(cd.sectionId)}</em>
                                            {cd.time && <b>{cd.time}</b>}
                                            {gran !== 'd' && <b className="era-ev-date cal-jump" onClick={(e) => { e.stopPropagation(); jumpCal(cd.date!); }}>{fmtMD(cd.date!)}</b>}
                                            <span>{cd.title || '未命名'}</span>
                                            {cd.evType && <em className="ev-type" style={{ color: evTypeColor(cd.evType), fontWeight: 600 }}>{EV_TYPE_META[cd.evType]}</em>}
                                            {cd.evRank && <em className="ev-rank">{EV_RANK_META[cd.evRank]}</em>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 段外（不在过去/现在/未来三段内）的已排期卡片 */}
            {outs.length > 0 && (
              <div className="era-row era-missing" style={{ borderColor: '#f084a0' }}>
                <div className="era-row-head" style={{ background: '#f084a0' }}>
                  <span className="era-ico"><ExclaimIcon size={13} /></span><b>未设定时段</b>
                  <em className="era-no">{outs.length} 张已排期卡</em>
                </div>
                <div className="era-out-list">
                  {outs.slice().sort((a, b) => (a.date! < b.date! ? -1 : 1)).map((cd) => {
                    const st = cd.status ? CAL_STATUS[cd.status] : null;
                    const colr = cd.color || secColor.get(cd.sectionId) || st?.dot || '#9aa0a6';
                    return (
                      <button key={cd.id} type="button" className="era-out-chip" style={{ borderColor: colr }} onClick={() => setActive(cd.id)} title={`${cd.title || '未命名'}${secName.get(cd.sectionId) ? '｜' + secName.get(cd.sectionId) : ''}${(cd.tags || []).length ? '｜🏷 ' + (cd.tags || []).join('、') : ''}｜${fmtYMD(cd.date!)}`}>
                        <i style={{ background: colr }} />
                        <em className="era-ev-sec">{secEmoji.get(cd.sectionId)}</em>
                        <b className="cal-jump" onClick={(e) => { e.stopPropagation(); jumpCal(cd.date!); }}>{fmtMD(cd.date!)}</b>
                        <span>{cd.title || '未命名'}</span>
                        {cd.evType && <em className="ev-type" style={{ color: evTypeColor(cd.evType), fontWeight: 600 }}>{EV_TYPE_META[cd.evType]}</em>}
                        {cd.evRank && <em className="ev-rank">{EV_RANK_META[cd.evRank]}</em>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 图例 / 说明 */}
            <div className="tl-legend">
              <span className="tl-legend-note">🌸 季节 &nbsp;·&nbsp;</span>
              {SEASONS.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.key}季</span>)}
              <span className="tl-legend-note">&nbsp;· 一天内 &nbsp;·&nbsp;</span>
              {DP_ORDER.slice(0, 3).map((g) => <span key={g}><i style={{ background: '#999' }} />{DP_META[g].icon}{DP_META[g].label}</span>)}
              {outs.length > 0 && <span className="tl-out-warn">⚠ {outs.length} 张已排期卡不在三段时段内，去日历改到三段里即可显示</span>}
            </div>
          </div>
        )}
      </div>

      {/* 底部详情 */}
      <div className={`tl-detail ${sel ? '' : 'none'}`}>
        {sel ? (
          <>
            <div className="tl-detail-main">
              <span className="tl-detail-dot" style={{ background: sel.color || secColor.get(sel.sectionId) || '#9aa0a6' }} />
              <b>{sel.title || '未命名卡片'}</b>
              <span className="tl-sec">{secName.get(sel.sectionId) || ''}</span>
            </div>
            {!evEdit ? (
              <>
                <div className="tl-detail-meta">
                  <span className="cal-jump" onClick={() => sel.date && jumpCal(sel.date)}>📅 {sel.date ? fmtYMD(sel.date) : '未排期'}</span>
                  {sel.endDate && sel.endDate !== sel.date && <span className="cal-jump" onClick={() => jumpCal(sel.endDate!)}>→ {fmtYMD(sel.endDate)}</span>}
                  {sel.daypart && <span>{DP_META[sel.daypart].icon}{DP_META[sel.daypart].label}</span>}
                  {sel.time && <span>⏰ {sel.time}</span>}
                  {sel.status && CAL_STATUS[sel.status] && <span style={{ color: CAL_STATUS[sel.status].dot }}>{CAL_STATUS[sel.status].label}</span>}
                  {sel.evType && <span style={{ color: evTypeColor(sel.evType), fontWeight: 600 }}>🎬 {EV_TYPE_META[sel.evType]}</span>}
                  {sel.evRank && <span className="ev-rank">{EV_RANK_META[sel.evRank]}</span>}
                  {(sel.tags || []).length > 0 && <span>🏷 {sel.tags!.join('、')}</span>}
                  {sel.note && <span className="tl-note">📝 {sel.note}</span>}
                </div>
                {(sel.relIds || []).length > 0 && (
                  <div className="tl-rel-row">
                    <span>🔗 关联</span>
                    {sel.relIds!.map((id) => {
                      const rc = cards[id];
                      if (!rc) return null;
                      return <button key={id} type="button" className="era-out-chip clickable" onClick={() => setActive(rc.id)}>{rc.title || '未命名'}</button>;
                    })}
                  </div>
                )}
                {/* 伏笔 ⇄ 回收关联：给本卡设「回收的伏笔」指向一条伏笔；伏笔侧据此自动变已回收 */}
                {seedOptions.length > 0 && (
                  <div className="tl-seedfor-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{sel.evType === 'seed' ? '🎣 伏笔状态' : '🔗 回收的伏笔'}</span>
                    <select
                      className="tl-seedfor"
                      value={sel.seedFor || ''}
                      onChange={(e) => { updateCard(sel.id, { seedFor: e.target.value || undefined }, { op: false }); }}
                    >
                      <option value="">
                        {sel.evType === 'seed' ? (isRecycled(sel.id) ? '✅ 已被回收（本卡不回收他物）' : '🐣 未被回收（等待回收卡指向本卡）') : '（不回收任何伏笔 / 普通事件）'}
                      </option>
                      {seedOptions.filter((s) => s.id !== sel.id).map((s) => (
                        <option key={s.id} value={s.id}>
                          {'回收「' + (s.title || '未命名') + '」' + (s.date ? ' · ' + fmtMD(s.date) + '埋设' : '') + (s.payDate ? ' · 计划' + fmtMD(s.payDate) : '')}
                        </option>
                      ))}
                    </select>
                    {sel.seedFor && seedTitle.get(sel.seedFor) && (
                      <em className="tl-seedfor-tag">当前：回收「{seedTitle.get(sel.seedFor)}」</em>
                    )}
                    {sel.evType === 'seed' && isRecycled(sel.id) && (() => {
                      const first = bySeed.get(sel.id)![0];
                      return <em className="seed-ok">✅ 已回收{first && first.date ? `（${fmtYMD(first.date)}）` : ''}</em>;
                    })()}
                    {sel.evType === 'seed' && !isRecycled(sel.id) && (
                      <em className="seed-wait">🐣 待回收{sel.payDate ? `（计划 ${fmtYMD(sel.payDate)}）` : ''}</em>
                    )}
                  </div>
                )}
                <div className="tl-detail-actions">
                  <button className="btn small" onClick={() => openEvEdit(sel)}><CalendarColorIcon size={13} /> 设时间/早中晚</button>
                  <button className="btn small" onClick={() => goCanvas(sel)}><PencilIcon size={13} /> 去画布</button>
                </div>
              </>
            ) : (
              <div className="tl-ev-edit">
                <EraPeriodEditor
                  startAlt="事件开始日期" endAlt="事件结束日期（跨多日可选）"
                  startV={dS} endV={dE} onStart={setDS} onEnd={setDE}
                />
                <div className="tl-dp-pick">
                  <em>一天内：</em>
                  {DP_ORDER.map((g) => (
                    <button key={g} type="button" className={`dp-pick ${dDP === g ? 'on' : ''}`}
                      onClick={() => setDDP(g)}>{DP_META[g].icon}{DP_META[g].label}</button>
                  ))}
                  <input className="tl-time-in" inputMode="numeric" placeholder="时刻 如 14:30" value={dT || ''}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d:]/g, '').slice(0, 5); setDT(v); }} />
                </div>
                <div className="tl-detail-actions">
                  <button className="btn small" onClick={saveEv}><CheckCircleIcon size={13} /> 保存</button>
                  <button className="btn small ghost" onClick={() => setEvEdit(false)}>取消</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <span className="hint">点事件 → 查看 / 设「发生时间段 + 早中晚」</span>
        )}
      </div>
    </div>
  );

  function goCanvas(c: Card) {
    if (c.writingOnly) { toast('这是正文创作里的卡片，可到「正文创作」中查看', 'info'); return; }
    setModal(null);
    setSelection([c.id]);
    toast(`已在画布选中「${c.title || '未命名'}」`, 'ok');
  }
}