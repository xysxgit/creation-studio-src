/**
 * ============ 故事日历（排期视图） ============
 * 专注「排期 / 备注 / 状态」——卡片在画布创建，日历只做时间管理：
 *  · 月历上点两日框选时间段 → 从卡片池选卡排期
 *  · 卡片可拖拽改期；周视图/月视图；按状态筛选
 *  · 多选批处理：移动到卷/上移下移/删除（不提供新建卡片入口）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '../store';
import type { Card, EraRange, EraSetting } from '../types';
import { CAL_STATUS } from './cardStatus';
import { toast } from '../util';
import { CalendarColorIcon, CloseIcon, FolderIcon, RobotIcon, TimeSettingIcon, GearColorIcon, DocIcon, AskIcon, CheckCircleIcon, TrashColorIcon, SectionIcon } from './icons';

type EraKey = 'past' | 'now' | 'future';
const ERA_META: Record<EraKey, { label: string; bar: string; soft: string }> = {
  past: { label: '过去', bar: '#8e6fe0', soft: 'rgba(142,111,224,.12)' },
  now: { label: '现在', bar: '#1ea393', soft: 'rgba(30,163,147,.11)' },
  future: { label: '未来', bar: '#4a90dd', soft: 'rgba(74,144,221,.11)' },
};
const ERA_ORDER: EraKey[] = ['past', 'now', 'future'];
const WEEK_HEAD = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');
/** 把日期规范成 4位年-2位月-2位日，保证字符串比较一致 */
const normDate = (k?: string): string | undefined => {
  if (!k) return k;
  const m = k.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return k;
  return `${pad4(+m[1])}-${pad(+m[2])}-${pad(+m[3])}`;
};
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const addDays = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const fmtYMD = (k: string) => `${+k.slice(0, 4)}年${+k.slice(5, 7)}月${+k.slice(8, 10)}日`;
const inRange = (r: EraRange | undefined, key: string) => !!r && !!r.start && !!r.end && key >= r.start && key <= r.end;
const eraOf = (e: EraSetting | undefined, key: string): EraKey | null => {
  if (!e) return null;
  if (inRange(e.past, key)) return 'past';
  if (inRange(e.now, key)) return 'now';
  if (inRange(e.future, key)) return 'future';
  return null;
};

// 事件类型 / 等级
const EV_TYPE_ORDER = ['main', 'seed', 'side', 'daily'] as const;
const EV_TYPE_META: Record<NonNullable<Card['evType']>, { t: string; c: string }> = {
  main: { t: '主线', c: '#e05f6d' },
  seed: { t: '伏笔', c: '#c98a3d' },
  side: { t: '支线', c: '#5b9df0' },
  daily: { t: '日常', c: '#8a7bd8' },
};
const EV_RANK_ORDER = ['high', 'mid', 'low'] as const;
const EV_RANK_META: Record<NonNullable<Card['evRank']>, string> = { high: '关键', mid: '重要', low: '普通' };

/** 内置取色板（替代系统取色器）：事件类型标签可选的自定义颜色 */
const EV_PALETTE = [
  '#e05f6d', '#c0392b', '#e17055', '#f39c12', '#fdcb6e', '#c98a3d',
  '#e84393', '#fd79a8', '#a29bfe', '#8a7bd8', '#6a5cf5', '#5b9df0',
  '#0984e3', '#00b894', '#1ea393', '#55efc4', '#95a5a6', '#2d3436',
  '#ffffff', '#ffe58f',
];

/** TipTap JSON → 纯文本（预览用） */
function plainTextOf(doc: unknown): string {
  let s = '';
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as { text?: string; content?: unknown[] };
    if (node.text) s += node.text;
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return s.trim();
}

export default function CalendarBoard({ onClose, embedded = false, focusDate }: { onClose: () => void; embedded?: boolean; focusDate?: string }) {
  const meta = useStudio((s) => s.meta);
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const updateCard = useStudio((s) => s.updateCard);
  const setSelection = useStudio((s) => s.setSelection);
  const setModal = useStudio((s) => s.setModal);
  const patchMeta = useStudio((s) => s.patchMeta);
  const setHubFocus = useStudio((s) => s.setHubFocus);

  const eras = meta?.calEras || {};
  // 设定时段 = 过去/现在/未来各段的并集；没设时段则用卡片排期范围兜底。
  // 日历只显示、只翻到「落在某一段内」的月份；段与段之间的空隙跳过，不做连续放宽
  const segs = (() => {
    const arr: { key: string | null; start: string; end: string }[] = [];
    for (const k of ERA_ORDER) { const r = eras[k]; if (r?.start && r?.end) arr.push({ key: k, start: r.start, end: r.end }); }
    if (!arr.length) {
      let min: string | null = null, max: string | null = null;
      for (const c of Object.values(cards)) {
        const a = c.date ? normDate(c.date) || c.date : null;
        const b = c.endDate ? normDate(c.endDate) || c.endDate : a;
        if (a && (!min || a < min)) min = a;
        if (b && (!max || b > max)) max = b;
      }
      if (min && max) arr.push({ key: null, start: min, end: max });
    }
    arr.sort((x, y) => (x.start < y.start ? -1 : 1));
    return arr;
  })();
  const yx = (y: number, m: number) => y * 12 + (m - 1);
  const xy = (n: number) => ({ y: Math.floor(n / 12), m: (n % 12) + 1 });
  const inSegMonth = (y: number, m: number) => { const mk = `${pad4(y)}-${pad(m)}`; return segs.some((s) => mk >= s.start.slice(0, 7) && mk <= s.end.slice(0, 7)); };
  const inSegDay = (k: string) => segs.some((s) => k >= s.start && k <= s.end);
  // 把某年/月吸附到最近的设定段；dir=1往后找 / -1往前找 / 0就近；out=true 表示方向已越过全部段（应提示并拦截）
  const clampToSegs = (y: number, m: number, dir: 0 | 1 | -1 = 0): { y: number; m: number; out: boolean } => {
    if (!segs.length) return { y, m, out: false };
    if (inSegMonth(y, m)) return { y, m, out: false };
    const lo = yx(+segs[0].start.slice(0, 4), +segs[0].start.slice(5, 7));
    const hi = yx(+segs[segs.length - 1].end.slice(0, 4), +segs[segs.length - 1].end.slice(5, 7));
    const n = yx(y, m);
    if (n < lo) return { ...xy(lo), out: true };
    if (n > hi) return { ...xy(hi), out: true };
    if (dir === 1) { for (let nn = n + 1; nn <= hi; nn++) { if (inSegMonth(xy(nn).y, xy(nn).m)) return { ...xy(nn), out: false }; } return { ...xy(hi), out: true }; }
    if (dir === -1) { for (let nn = n - 1; nn >= lo; nn--) { if (inSegMonth(xy(nn).y, xy(nn).m)) return { ...xy(nn), out: false }; } return { ...xy(lo), out: true }; }
    for (let d = 1; d <= Math.max(n - lo, hi - n); d++) {
      if (n - d >= lo) { const t = xy(n - d); if (inSegMonth(t.y, t.m)) return { ...t, out: false }; }
      if (n + d <= hi) { const t = xy(n + d); if (inSegMonth(t.y, t.m)) return { ...t, out: false }; }
    }
    return { ...xy(lo), out: false };
  };
  // 默认打开「第一个设定段起点」（没设时段则卡最早排期月 / 今年1月）
  const [ym, setYm] = useState<{ y: number; m: number }>(() => {
    const d = new Date();
    const base = segs.length ? segs[0].start : `${d.getFullYear()}-01-01`;
    const t = clampToSegs(+base.slice(0, 4), +base.slice(5, 7));
    return { y: t.y, m: t.m };
  });
  // 从画布点击日期徽章跳转过来：吸附到最近设定段月并选中（不在段内则不选中）
  useEffect(() => {
    if (focusDate) {
      const c = clampToSegs(+focusDate.slice(0, 4), +focusDate.slice(5, 7));
      setYm(c);
      setSelDay(inSegDay(focusDate) ? focusDate : null); setSelStart(null); setSelEnd(null); setPickMode(false); setPreview(null);
      setHubFocus(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate]);
  // 可选关联的"排期卡"（自己除外）
  const [eraTab, setEraTab] = useState<'all' | EraKey>('all');
  // 框选时间段
  const [pickMode, setPickMode] = useState(false);
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  // 当日详情
  const [selDay, setSelDay] = useState<string | null>(null);
  // 加入卡片池（多选）
  const [poolSel, setPoolSel] = useState<Record<string, boolean>>({});
  const [poolOpen, setPoolOpen] = useState(false);
  // 每日备注
  const [noteDay, setNoteDay] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  // 卡片预览 + 卡片备注/类型/等级
  const [preview, setPreview] = useState<Card | null>(null);
  const [pvNote, setPvNote] = useState('');
  const [pvType, setPvType] = useState('');
  const [pvRank, setPvRank] = useState('');
  const [pvStatus, setPvStatus] = useState('');
  const [pvPay, setPvPay] = useState('');
  const [pvRel, setPvRel] = useState<string[]>([]);
  // 内置色板 / 内置月历（替代系统取色器与系统日期选择器）
  const [colorPick, setColorPick] = useState<NonNullable<Card['evType']> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payYm, setPayYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
  const openPreview = (c: Card) => { setPreview(c); setPvNote(c.note || ''); setPvType(c.evType || ''); setPvRank(c.evRank || ''); setPvStatus(c.status || ''); setPvPay(c.payDate || ''); setPvRel(c.relIds || []); };
  const closePreview = () => setPreview(null);

  // 内置色板 / 内置月历：点击外部自动收起
  useEffect(() => {
    if (!colorPick && !payOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest && t.closest('.cal-color-pop, .cal-date-pop, .pv-type-dot, .cal-pay-trigger')) return;
      setColorPick(null);
      setPayOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [colorPick, payOpen]);
  // 事件类型实际标签颜色：优先用户自定义，否则内置默认
  const evTypeColor = (t: 'main' | 'side' | 'daily' | 'seed') => meta?.evTypeColors?.[t] || EV_TYPE_META[t].c;
  const setTypeColor = (t: 'main' | 'side' | 'daily' | 'seed', v: string) => {
    patchMeta({ evTypeColors: { ...(meta?.evTypeColors || {}), [t]: v } });
  };
  // 可选关联的"排期卡"（自己除外）
  const relChoices = useMemo(() => Object.values(cards).filter((c) => !!c.date && c.id !== preview?.id), [cards, preview]);
  const savePreview = () => {
    if (!preview) return;
    updateCard(preview.id, {
      note: pvNote || undefined,
      evType: (pvType as Card['evType']) || undefined,
      evRank: (pvRank as Card['evRank']) || undefined,
      status: (pvStatus as Card['status']) || undefined,
      payDate: pvType === 'seed' && pvPay ? (normDate(pvPay) || pvPay) : undefined,
      relIds: pvRel.length ? pvRel : undefined,
    }, { op: false });
    // 关联双向：A 关联 B 时，B 也自动关联 A
    const old = preview.relIds || [];
    const added = pvRel.filter((id) => !old.includes(id));
    const removed = old.filter((id) => !pvRel.includes(id));
    for (const id of added) {
      const rc = cards[id]; if (!rc) continue;
      const cur = rc.relIds || [];
      if (!cur.includes(preview.id)) updateCard(id, { relIds: [...cur, preview.id] }, { op: false });
    }
    for (const id of removed) {
      const rc = cards[id]; if (!rc) continue;
      const cur = rc.relIds || [];
      if (cur.includes(preview.id)) updateCard(id, { relIds: cur.filter((x) => x !== preview.id) }, { op: false });
    }
    toast(pvNote || pvType || pvRank || pvStatus || pvPay || pvRel.length ? '已保存卡片备注/类型/等级/状态/伏笔回收/关联' : '已清除卡片备注/类型/等级/状态/伏笔回收/关联', 'ok');
    setPreview(null);
  };
  // 跳转到关联事件卡的日期
  const jumpRel = (rc: Card) => {
    if (!rc.date) return;
    const d = normDate(rc.date) || rc.date;
    setPreview(null);
    setYm(clampToSegs(+d.slice(0, 4), +d.slice(5, 7)));
    setSelDay(inSegDay(d) ? d : null); setSelStart(null); setSelEnd(null); setPickMode(false);
  };

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

  // 每天出现的卡（跨日卡出现在范围内每一天）
  const dayCards = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const c of Object.values(cards)) {
      if (!c.date) continue;
      const s0 = normDate(c.date)!;
      const e0 = c.endDate && c.endDate > c.date ? normDate(c.endDate)! : s0;
      let k = s0;
      const end = e0;
      let guard = 0;
      while (k <= end && guard < 730) {
        const arr = m.get(k) || [];
        arr.push(c); m.set(k, arr);
        k = addDays(k, 1); guard++;
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return m;
  }, [cards]);

  // 设定了「计划回收日期」的伏笔卡（用于日历回收提示）
  const payList = useMemo(() => Object.values(cards).filter((c) => c.evType === 'seed' && !!c.payDate && !c.writingOnly), [cards]);

  // 未排期卡（画布上还没加入日历的）
  const pool = useMemo(() => Object.values(cards)
    .filter((c) => !c.date && !c.writingOnly)
    .sort((a, b) => (a.title || '').localeCompare(b.title || '')), [cards]);

  // 是否有任何设定/排期：没有就只显示空态引导，不展示日历
  const hasContent = useMemo(() => {
    for (const k of ERA_ORDER) if (eras[k]?.start) return true;
    for (const c of Object.values(cards)) if (c.date) return true;
    return false;
  }, [eras, cards]);

  const daysLen = new Date(ym.y, ym.m, 0).getDate();
  const offset = new Date(ym.y, ym.m - 1, 1).getDay();
  // 只按本月实际天数排布，前后空格用空白占位（不显示前后月的数字）
  const cellDays: { key: string; inMonth: boolean; blank?: boolean }[] = [];
  for (let i = 0; i < offset; i++) cellDays.push({ key: '', inMonth: false, blank: true });
  for (let d = 1; d <= daysLen; d++) cellDays.push({ key: `${pad4(ym.y)}-${pad(ym.m)}-${pad(d)}`, inMonth: true });
  let tail = 7 - (cellDays.length % 7);
  if (tail === 7) tail = 0;
  for (let i = 0; i < tail; i++) cellDays.push({ key: '', inMonth: false, blank: true });

  const monthKey = (y: number, m: number) => `${pad4(y)}-${pad(m)}`;
  const move = (delta: number) => {
    let m = ym.m + delta, y = ym.y;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    const t = clampToSegs(y, m, delta > 0 ? 1 : -1);
    if (t.out) { toast(delta < 0 ? '已到设定时段的起点，不能再往前' : '已到设定时段的终点，不能再往后', 'info'); return; }
    if (t.y !== y || t.m !== m) toast('已跳过未设定的空白月份', 'info');
    setYm({ y: t.y, m: t.m });
  };
  const moveYear = (dy: number) => {
    const t = clampToSegs(ym.y + dy, ym.m, dy > 0 ? 1 : -1);
    if (t.out) { toast(dy < 0 ? '已到设定时段的起点，不能再往前' : '已到设定时段的终点，不能再往后', 'info'); return; }
    if (t.y !== ym.y + dy || t.m !== ym.m) toast('已跳过未设定的空白月份', 'info');
    setYm({ y: t.y, m: t.m });
  };
  // 跳到某段（取其起始日期所在月份）
  const goEra = (k: EraKey) => {
    setEraTab(k === eraTab ? 'all' : k);
    const r = eras[k];
    if (r?.start) { const t = clampToSegs(+r.start.slice(0, 4), +r.start.slice(5, 7)); setYm({ y: t.y, m: t.m }); }
  };

  const rangeOk = !!(selStart && selEnd);
  const rangeDays = rangeOk ? Math.max(1, Math.round((parseKey(selEnd!).getTime() - parseKey(selStart!).getTime()) / 86400000) + 1) : 0;

  // 伏笔是否已过回收点（以日历当前查看的「年-月」为时间基准；回收目标早于本月首日且未完成=逾期）
  const payOverdue = (c: Card): boolean => {
    if (!c.payDate) return false;
    if (c.status === 'done') return false;
    return c.payDate < `${monthKey(ym.y, ym.m)}-01`;
  };
  // 跳到伏笔回收日并打开预览（便于标记已完成/改期）
  const gotoPayCard = (p: Card) => {
    const d = normDate(p.payDate) || p.payDate!;
    setPickMode(false); setSelStart(null); setSelEnd(null); setNoteDay(null); setPoolOpen(false);
    const c = clampToSegs(+d.slice(0, 4), +d.slice(5, 7));
    setYm({ y: c.y, m: c.m });
    setSelDay(inSegDay(d) ? d : null);
    openPreview(p);
  };
  // 把伏笔台账交给 AI 助手做回收检查（唤起 AIAssistant 面板）
  const aiPayCheck = () => {
    const seeds = Object.values(cards).filter((c) => c.evType === 'seed' && !c.writingOnly);
    if (!seeds.length) { toast('项目中还没有伏笔卡（事件类型=伏笔）。先给卡片标「伏笔」并排期，再设计划回收日期。', 'warn'); return; }
    const stMap: Record<string, string> = { todo: '待定', doing: '推进中', done: '已完成', hold: '搁置' };
    const lines = seeds.map((c) => `• ${c.title || '未命名'}${c.date ? `｜埋设 ${c.date}` : '｜未排期'}` +
      `${c.payDate ? `｜计划回收 ${c.payDate}${payOverdue(c) ? '（⚠已过回收点）' : ''}` : '｜未设回收目标'}` +
      `｜状态 ${stMap[c.status || ''] || c.status || '未设'}${c.note ? `｜备注 ${c.note.slice(0, 60)}` : ''}`);
    const prompt = '请扮演「剧情审稿人」，检查下面这份伏笔台账：\n' +
      '1) 标出已到/已过回收点但状态不是「已完成」的伏笔（疑似忘了回收），说明应在什么剧情节点收束；\n' +
      '2) 标出未设回收目标的伏笔，建议补一个合适的回收时间点；\n' +
      '3) 若有最近正文（自动附上），指出其中已悄悄回收但台账未更新的伏笔，提醒更新状态。\n\n' +
      `【伏笔台账】\n${lines.join('\n')}\n\n只输出结构化清单与建议，不要客套。`;
    window.dispatchEvent(new CustomEvent('ai-ask', { detail: { prompt } }));
    toast('已唤起 AI 助手检查伏笔（去 🤖 面板看结果）', 'ok');
  };

  // 点击一个日期格
  const handleCell = (key: string) => {
    if (pickMode) {
      if (!selStart) { setSelStart(key); setSelEnd(null); }
      else if (!selEnd) {
        let a = selStart, b = key;
        if (b < a) { const t = a; a = b; b = t; }
        setSelStart(a); setSelEnd(b);
        setPoolOpen(false);
      } else { setSelStart(key); setSelEnd(null); }
      return;
    }
    // 点击（短按）→ 卡片管理
    setSelDay(key);
    setNoteDay(null); setNoteDraft('');
  };

  // ---- 长按日期 → 弹出编组/设置菜单 ----
  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const lpTimer = useRef<number>(0);
  const lpState = useRef<{ x: number; y: number; key: string; fired: boolean; cancel: boolean } | null>(null);
  const openGroupMenu = (key: string) => { setGroupMenu(key); setSelDay(null); setNoteDay(null); };
  const touchCellStart = (key: string, e: React.TouchEvent) => {
    const t = e.touches[0];
    lpState.current = { x: t.clientX, y: t.clientY, key, fired: false, cancel: false };
    window.clearTimeout(lpTimer.current);
    lpTimer.current = window.setTimeout(() => {
      if (lpState.current && !lpState.current.cancel) {
        lpState.current.fired = true;
        openGroupMenu(lpState.current.key);
        // 统一长按触觉反馈：与画布卡片长按/空白长按一致（24ms 确认震）
        try { navigator.vibrate?.(24); } catch { /* 不支持振动时忽略 */ }
      }
    }, 520) as unknown as number;
  };
  const touchCellMove = (e: React.TouchEvent) => {
    if (!lpState.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - lpState.current.x) + Math.abs(t.clientY - lpState.current.y) > 9) {
      lpState.current.cancel = true; window.clearTimeout(lpTimer.current);
    }
  };
  const touchCellEnd = (key: string) => {
    const s = lpState.current;
    const fired = s?.fired, cancel = s?.cancel;
    window.clearTimeout(lpTimer.current);
    lpState.current = null;
    // 长按已触发菜单，或明显滑动(不算点击)：抑制随后的 click，交给 onClick 的 cellClick 处理普通短按
    if (fired || cancel) {
      suppressClick.current = key;
      window.setTimeout(() => { if (suppressClick.current === key) suppressClick.current = null; }, 350);
      return;
    }
    // 普通短按：不设置 suppress，让 onClick 的 cellClick 调用 handleCell
  };
  const cellCtx = (key: string, e: React.MouseEvent) => { e.preventDefault(); if (!lpState.current?.fired) openGroupMenu(key); };
  const suppressClick = useRef<string | null>(null);
  const cellClick = (key: string) => {
    if (suppressClick.current === key) { suppressClick.current = null; return; }
    handleCell(key);
  };

  const clearRange = () => { setSelStart(null); setSelEnd(null); setPoolSel({}); setPoolOpen(false); };
  const cancelPick = () => { setPickMode(false); clearRange(); };

  // 单选：加入某一天
  const addCardDay = (c: Card) => {
    if (!selDay) return;
    updateCard(c.id, { date: normDate(selDay) || selDay }, { op: false });
    toast(`已把「${c.title || '未命名'}」加入 ${fmtYMD(normDate(selDay) || selDay!)}`, 'ok');
  };
  // 组选：加入一段范围
  const addGroup = () => {
    if (!rangeOk || !selStart || !selEnd) return;
    const ids = Object.keys(poolSel).filter((id) => poolSel[id]);
    if (ids.length === 0) { toast('先勾选要加入这段时间的卡片', 'err'); return; }
    const s = normDate(selStart) || selStart;
    const e = selEnd === selStart ? undefined : (normDate(selEnd) || selEnd);
    for (const id of ids) updateCard(id, { date: s, endDate: e }, { op: false });
    toast(`已把 ${ids.length} 张卡设为 ${fmtYMD(s)} ~ ${fmtYMD(e || s)}`, 'ok');
    clearRange();
  };
  const removeCard = (c: Card) => {
    updateCard(c.id, { date: undefined, endDate: undefined, daypart: undefined, time: undefined }, { op: false });
    toast(`已移除「${c.title || '未命名'}」的排期`, 'ok');
  };

  // 每日备注
  const notes = meta?.calNotes || {};
  const openNote = (day: string) => { setNoteDay(day); setNoteDraft(notes[day] || ''); };
  const saveNote = () => {
    if (!noteDay) return;
    patchMeta({ calNotes: { ...notes, [noteDay]: noteDraft || '' } });
    setNoteDay(null);
    toast(noteDraft ? '已保存备注' : '已清空备注', 'ok');
  };

  return (
    <div className="cal-root">
      {!embedded && (
      <div className="tl-top cal-top">
        <div className="tl-title">
          <b><CalendarColorIcon size={16} /> 日历排期</b>
          <span className="tl-title-sub">按过去/现在/未来分段 → 框选一段时间，整组添加卡片并写备注</span>
        </div>
        <div className="tl-tools">
          <button className="btn small ghost" onClick={onClose}><CloseIcon size={14} /></button>
        </div>
      </div>
      )}

      {hasContent ? (
      <>
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={() => moveYear(-1)}>«</button>
        <button className="cal-nav-btn" onClick={() => move(-1)}>‹</button>
        <div className="cal-nav-mid">
          <b>{ym.y}年{ym.m}月</b>
        </div>
        <button className="cal-nav-btn" onClick={() => move(1)}>›</button>
        <button className="cal-nav-btn" onClick={() => moveYear(1)}>»</button>
      </div>

      {/* 按 过去/现在/未来 筛选（点已选段可取消筛选，回到全部） */}
      <div className="cal-era-tabs">
        {ERA_ORDER.map((k) => (
          <button key={k} className={eraTab === k ? 'on' : ''} onClick={() => goEra(k)} style={eraTab === k ? { background: ERA_META[k].bar } : undefined}>{ERA_META[k].label}</button>
        ))}
      </div>
      {/* 分区图例：本月有排期卡的分区，色点+emoji+名称+数量一目了然 */}
      {(() => {
        const cnt = new Map<string, number>();
        for (const cs of dayCards.values()) for (const c of cs) cnt.set(c.sectionId, (cnt.get(c.sectionId) || 0) + 1);
        const items = sections.map((s) => ({ s, n: cnt.get(s.id) || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
        if (!items.length) return null;
        return (
          <div className="cal-sec-legend">
            <span className="lbl"><FolderIcon size={13} /> 分区</span>
            {items.map(({ s, n }) => (
              <button key={s.id} type="button" title={`${s.name}：本月 ${n} 张排期卡`}>
                <i style={{ background: s.color }} /><SectionIcon emoji={s.emoji} size={13} />{s.name}<em>{n}</em>
              </button>
            ))}
          </div>
        );
      })()}
      {/* 伏笔回收提醒：本月到期 + 已过回收点未回收（以当前查看月为时间基准） */}
      {(() => {
        if (!payList.length) return null;
        const mk = monthKey(ym.y, ym.m);
        const due = payList.filter((p) => p.payDate && p.payDate.slice(0, 7) === mk && p.status !== 'done');
        const over = payList.filter((p) => payOverdue(p));
        const unset = Object.values(cards).filter((c) => c.evType === 'seed' && !c.payDate && !c.writingOnly).length;
        if (!due.length && !over.length && !unset) return null;
        const items = [...over, ...due.filter((p) => !over.includes(p))].slice(0, 4);
        return (
          <div className="cal-pay-alert">
            {over.length > 0 && <span className="cal-pay-badge over">⚠ {over.length}条已过回收点</span>}
            {due.length > 0 && <span className="cal-pay-badge">🔖 本月 {due.length}条到期待回收</span>}
            <span className="cal-pay-list">
              {items.map((p) => (
                <button key={p.id} type="button" className={payOverdue(p) ? 'over' : ''} title="跳到回收日并打开伏笔卡（可标记状态）" onClick={() => gotoPayCard(p)}>{p.title || '未命名'}</button>
              ))}
              {over.length + due.length > items.length && <em>…共{over.length + due.length}条</em>}
            </span>
            {unset > 0 && <span className="cal-pay-hint">另有 {unset} 条伏笔未设回收目标</span>}
            <button className="btn tiny ghost cal-pay-ai" title="把伏笔台账交给 AI 审稿：找出漏回收、建议回收时机" onClick={aiPayCheck}><RobotIcon size={13} /> AI检查回收</button>
          </div>
        );
      })()}

      <div className="cal-body">
        <div className="cal-weekhead">
          {WEEK_HEAD.map((w) => <div key={w} className={w === '日' ? 'sun' : w === '六' ? 'sat' : ''}>{w}</div>)}
        </div>
        <div className="cal-grid">
          {cellDays.map((cd, i) => {
            if (cd.blank) return <div key={'bk' + i} className="cal-cell cal-blank" />;
            const era = eraOf(eras, cd.key);
            // 不在设定时段内的日期：不显示（避免出现“没设定”的日子）
            if (!inSegDay(cd.key)) return <div key={'out' + i} className="cal-cell cal-blank" />;
            const list = dayCards.get(cd.key) || [];
            const pays = payList.filter((p) => p.payDate === cd.key);
            const mt = era ? ERA_META[era] : null;
            const isSel = selDay === cd.key;
            const dimOut = eraTab !== 'all' && mt && era !== eraTab;
            const inRangeSel = rangeOk && cd.key >= selStart! && cd.key <= selEnd!;
            const isStart = pickMode && cd.key === selStart;
            const isEnd = pickMode && cd.key === selEnd;
            return (
              <div key={cd.key}
                className={`cal-cell ${cd.inMonth ? '' : 'dim'} ${isSel ? 'sel' : ''} ${dimOut ? 'cal-dim-out' : ''} ${inRangeSel ? 'cal-range' : ''} ${isStart ? 'cal-range-ed' : ''} ${isEnd ? 'cal-range-ed' : ''} ${mt ? 'cal-era-' + era : ''}`}
                style={mt && !dimOut ? { background: mt.soft } : undefined}
                onTouchStart={(e) => touchCellStart(cd.key, e)}
                onTouchMove={touchCellMove}
                onTouchEnd={() => touchCellEnd(cd.key)}
                onContextMenu={(e) => cellCtx(cd.key, e)}
                onClick={() => cellClick(cd.key)}
                title={fmtYMD(cd.key)}>
                <div className="cal-cell-top">
                  <span className="cal-day">{+cd.key.slice(8, 10)}</span>
                  {mt && <span className="cal-era-tag" style={{ background: mt.bar }}>{ERA_META[era!].label}</span>}
                </div>
                {list.length > 0 && (
                  <div className="cal-cell-list">
                    {list.slice(0, 3).map((c) => {
                      const st = c.status ? CAL_STATUS[c.status] : null;
                      const colr = c.color || secColor.get(c.sectionId) || st?.dot || '#9aa0a6';
                      return (
                        <div key={c.id} className="cal-cell-chip"
                          style={{ borderLeft: `3px solid ${colr}`, background: `color-mix(in srgb, ${colr} 10%, transparent)` }}
                          title={`${c.title || '未命名'}${secName.get(c.sectionId) ? '｜' + secName.get(c.sectionId) : ''}${c.evType ? ' · ' + EV_TYPE_META[c.evType].t : ''}${c.evRank ? ' · ' + EV_RANK_META[c.evRank] : ''}${(c.tags || []).length ? ' · 🏷 ' + (c.tags || []).join('、') : ''}${(c.relIds?.length) ? ' · 关联' + c.relIds.length : ''}${c.note ? ' · 备注：' + c.note.slice(0, 20) : ''}${c.endDate && c.endDate > c.date! ? ` · ${c.date!.slice(5)}~${c.endDate.slice(5)}` : ''}`}>
                          <i style={{ background: st ? st.dot : colr }} />
                          {c.evType && <em className="chip-ev" style={{ background: evTypeColor(c.evType) }}>{EV_TYPE_META[c.evType].t}</em>}
                          <span>{c.title || '未命名'}</span>
                          {c.evRank && <em className="chip-rank">{EV_RANK_META[c.evRank]}</em>}
                          {(c.relIds?.length) ? <em className="chip-rel">🔗{c.relIds.length}</em> : null}
                          {c.note ? <em className="chip-note">📝</em> : null}
                        </div>
                      );
                    })}
                    {list.length > 3 && <em className="cal-more">＋{list.length - 3}</em>}
                  </div>
                )}
                {pays.length > 0 && (
                  <div className="cal-cell-pays">
                    {pays.slice(0, 2).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`cal-cell-pay ${payOverdue(p) ? 'over' : ''}`}
                        title={`伏笔回收：${p.title || '未命名'}（${fmtYMD(normDate(p.payDate) || p.payDate!)}${payOverdue(p) ? ' · 已过回收点未回收' : ' · 到期待回收'}），点此打开卡片管理`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); gotoPayCard(p); }}
                      >
                        🔖 {p.title || '回收'}{payOverdue(p) ? ' ⚠' : ''}
                      </button>
                    ))}
                    {pays.length > 2 && <em className="cal-more">＋{pays.length - 2}</em>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(rangeOk || pickMode) && <div className="cal-sheet-space" />}
      </div>

      {/* 底部操作区：框选时间段 / 当日详情 */}
      {pickMode ? (
        <div className="cal-sheet">
          <div className="cal-sheet-head">
            <b><TimeSettingIcon size={14} /> 框选时间段</b>
            {rangeOk
              ? <span className="cal-sheet-era" style={{ color: '#1ea393' }}>{fmtYMD(selStart!)} ~ {fmtYMD(selEnd!)} · {rangeDays} 天</span>
              : <span className="cal-sheet-era" style={{ color: '#4a90dd' }}>{selStart ? '再点一个日期作为结束' : '点一个日期作为开始'}</span>}
            <button className="btn tiny ghost" onClick={() => setPickMode(false)}>收起</button>
          </div>
          {rangeOk ? (
            <div className="cal-add-pool">
              <div className="cal-add-title">＋ 从画布加入这 {rangeDays} 天（多选，加入后一起成为这段时间的事件）</div>
              <button className="btn small" style={{ marginBottom: 6 }} onClick={() => setPoolOpen(!poolOpen)}>
                {poolOpen ? '收起卡片池' : `选择卡片（${Object.keys(poolSel).filter((id) => poolSel[id]).length} 已选）`}
              </button>
              {poolOpen && (
                <div className="cal-add-list">
                  {pool.length === 0 && <div className="hint">画布上没有未排期的卡片</div>}
                  {pool.slice(0, 60).map((c) => (
                    <button key={c.id} type="button" className={`cal-add-btn ${poolSel[c.id] ? 'sel' : ''}`}
                      onClick={() => setPoolSel((s) => ({ ...s, [c.id]: !s[c.id] }))}>
                      <span>{c.title || '未命名'}</span>
                      <em>{secName.get(c.sectionId) || ''}</em>
                      <b>{poolSel[c.id] ? '✓' : '＋'}</b>
                    </button>
                  ))}
                  {pool.length > 60 && <em className="hint">…还有 {pool.length - 60} 张</em>}
                </div>
              )}
              <div className="tl-detail-actions" style={{ marginTop: 8 }}>
                <button className="btn small" onClick={addGroup}><CheckCircleIcon size={14} /> 加入这个时间段</button>
                <button className="btn small ghost" onClick={cancelPick}>清除</button>
              </div>
            </div>
          ) : (
            <div className="cal-add-pool">
              <div className="cal-add-title">{selStart ? '已选开始 ' + fmtYMD(selStart) : '在月历上点两个日期，框出要排期的时间段'}</div>
              <button className="btn small" onClick={cancelPick}>← 重新选择</button>
            </div>
          )}
        </div>
      ) : selDay ? (
        <div className="cal-daymenu-mask" onClick={() => { setSelDay(null); setNoteDay(null); }}>
          <div className="cal-daymenu" onClick={(e) => e.stopPropagation()}>
        <div className="cal-daymenu-body">
          <div className="cal-sheet-head">
            <b><CalendarColorIcon size={14} /> {fmtYMD(selDay)}</b>
            {eraOf(eras, selDay) && <span className="cal-sheet-era" style={{ color: ERA_META[eraOf(eras, selDay)!].bar }}>· {ERA_META[eraOf(eras, selDay)!].label}时段</span>}
            <span className="cal-sheet-cnt">已排 {(dayCards.get(selDay) || []).length} 张</span>
            <button className="btn tiny ghost" onClick={() => { setSelDay(null); setNoteDay(null); }}>收起</button>
          </div>

          {(dayCards.get(selDay) || []).length > 0 && (
            <div className="cal-day-list">
              {(dayCards.get(selDay) || []).map((c) => {
                const st = c.status ? CAL_STATUS[c.status] : null;
                const colr = c.color || secColor.get(c.sectionId) || st?.dot || '#9aa0a6';
                return (
                  <div key={c.id} className="cal-day-item clickable" title="点击预览 / 编辑备注、类型、等级" onClick={() => openPreview(c)}>
                    <i style={{ background: colr }} />
                    <b>{c.title || '未命名'}</b>
                    {c.evType && <em className="ev-type" style={{ background: evTypeColor(c.evType), color: '#fff', fontWeight: 600, border: 0, padding: '0 4px', borderRadius: 3 }}>{EV_TYPE_META[c.evType].t}</em>}
                    {c.evRank && <em className="ev-rank">{EV_RANK_META[c.evRank]}</em>}
                    {(c.relIds?.length) ? <em className="chip-rel">🔗{c.relIds.length}</em> : null}
                    {c.note ? <em className="chip-note">📝</em> : null}
                    <em>{c.endDate && c.endDate > c.date! ? `${normDate(c.date!)!.slice(5)}~${normDate(c.endDate!)!.slice(5)}` : '全天'}</em>
                    <span className="cal-day-sec">{secName.get(c.sectionId) || ''}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 当日备注 */}
          {noteDay === selDay ? (
            <div className="cal-note">
              <textarea className="cal-note-ta" placeholder="给这一天写点备注（多张卡共享）" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
              <div className="tl-detail-actions">
                <button className="btn small" onClick={saveNote}><CheckCircleIcon size={14} /> 保存备注</button>
                <button className="btn small ghost" onClick={() => setNoteDay(null)}>取消</button>
              </div>
            </div>
          ) : (
            <button className="btn small ghost cal-note-btn" onClick={() => openNote(selDay)}><DocIcon size={13} /> {notes[selDay] ? `${notes[selDay]}` : '给这一天写备注'}</button>
          )}

          {/* 单日加入 */}
          <div className="cal-add-pool">
            <div className="cal-add-title">＋ 从画布加入卡片到这一天（{pool.length} 张未排期）</div>
            {pool.length === 0 ? <div className="hint">画布上已没有未排期的卡片</div> : (
              <div className="cal-add-list" style={{ maxHeight: 160 }}>
                {pool.slice(0, 40).map((c) => (
                  <button key={c.id} type="button" className="cal-add-btn" onClick={() => addCardDay(c)}>
                    <span>{c.title || '未命名'}</span><em>{secName.get(c.sectionId) || ''}</em><b>＋</b>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cal-menu-hint"><AskIcon size={12} /> 点卡片管理 · 长按日期可「框选一段时间（编组排期）」</div>
          </div>
          </div>
        </div>
      ) : null}

      {groupMenu && (
        <div className="cal-daymenu-mask" onClick={() => setGroupMenu(null)}>
          <div className="cal-daymenu" onClick={(e) => e.stopPropagation()}>
          <div className="cal-daymenu-body">
            <div className="cal-sheet-head">
              <b><GearColorIcon size={14} /> {fmtYMD(groupMenu)}</b>
              {eraOf(eras, groupMenu) && <span className="cal-sheet-era" style={{ color: ERA_META[eraOf(eras, groupMenu)!].bar }}>· {ERA_META[eraOf(eras, groupMenu)!].label}时段</span>}
              <button className="btn tiny ghost" onClick={() => setGroupMenu(null)}>收起</button>
            </div>
            <button className="btn small" style={{ justifyContent: 'flex-start' }} onClick={() => { setPickMode(true); setSelStart(groupMenu); setSelEnd(null); setGroupMenu(null); }}><TimeSettingIcon size={14} /> 框选一段时间（编组排期）</button>
            <button className="btn small ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setModal('timeline'); setGroupMenu(null); }}><GearColorIcon size={14} /> 设定过去 / 现在 / 未来时段</button>
            <span className="hint">框选：以这一天为起点，再点另一个日期，把这期间的卡片编到一起。</span>
          </div>
          </div>
        </div>
      )}
      </>
      ) : (
        <div className="cal-empty">
          <div className="cal-empty-ico"><TimeSettingIcon size={26} /></div>
          <p>还没有设定时间段或排期</p>
          <p className="hint">先到「时间轴 → ⚙ 设定时段」设定过去/现在/未来，再回日历框选一段时间加入卡片</p>
        </div>
      )}

      {/* 卡片预览：备注 / 事件类型 / 等级 */}
      {preview && (
        <div className="cal-preview-mask" onClick={closePreview}>
          <div className="cal-preview" onClick={(e) => e.stopPropagation()}>
            <div className="cal-preview-head">
              <i style={{ background: preview.color || secColor.get(preview.sectionId) || '#9aa0a6' }} />
              <b>{preview.title || '未命名卡片'}</b>
              <span className="cal-sec">{secName.get(preview.sectionId) || ''}</span>
              <button className="tl-edit-x" onClick={closePreview}><CloseIcon size={14} /></button>
            </div>
            <div className="cal-preview-body">
              <div className="cal-preview-meta">
                <span>📅 {preview.date ? fmtYMD(normDate(preview.date) || preview.date!) : '未排期'}</span>
                {preview.endDate && preview.endDate !== preview.date && <span>→ {fmtYMD(normDate(preview.endDate) || preview.endDate!)}</span>}
                {preview.time && <span>⏰ {preview.time}</span>}
                {preview.status && CAL_STATUS[preview.status] && <span style={{ color: CAL_STATUS[preview.status].dot }}>{CAL_STATUS[preview.status].label}</span>}
                {preview.evType === 'seed' && preview.payDate && (
                  <span style={{ color: payOverdue(preview) ? '#e0564f' : '#c98a3d', fontWeight: 600 }}>
                    {payOverdue(preview) ? `⚠ 已过回收点（原定 ${fmtYMD(normDate(preview.payDate) || preview.payDate!)}）` : `🔖 计划回收 ${fmtYMD(normDate(preview.payDate) || preview.payDate!)}`}
                  </span>
                )}
              </div>
              <div className="cal-preview-text">{plainTextOf(preview.content).slice(0, 300) || <em>（此卡暂无正文）</em>}</div>
              <div className="cal-preview-row">
                <em>卡片备注</em>
                <textarea className="cal-note-ta" placeholder="给这张卡写点备注（日历里显示）" value={pvNote} onChange={(e) => setPvNote(e.target.value)} />
              </div>
              <div className="cal-preview-row">
                <em>事件类型</em>
                <span className="pv-picks">{EV_TYPE_ORDER.map((t) => {
                  const tc = evTypeColor(t); const on = pvType === t;
                  return (
                    <span key={t} className="pv-pick-wrap">
                      <span
                        className={`pv-type-dot${colorPick === t ? ' open' : ''}`}
                        style={{ background: tc }}
                        role="button"
                        aria-label={`设置${EV_TYPE_META[t].t}标签颜色`}
                        title="自定义标签颜色（内置色板）"
                        onClick={() => setColorPick(colorPick === t ? null : t)}
                      ><i /></span>
                      <button type="button" className={`pv-pick ${on ? 'on' : ''}`} style={on ? { background: tc, color: '#fff' } : { color: tc }} onClick={() => setPvType(on ? '' : t)}>{EV_TYPE_META[t].t}</button>
                      {colorPick === t && (
                        <div className="cal-color-pop" onClick={(e) => e.stopPropagation()}>
                          <div className="cal-pop-title">选择「{EV_TYPE_META[t].t}」标签颜色</div>
                          <div className="cal-color-grid">
                            {EV_PALETTE.map((c) => (
                              <button
                                key={c}
                                type="button"
                                title={c}
                                className={tc === c ? 'on' : ''}
                                style={{ background: c }}
                                onClick={() => { setTypeColor(t, c); setColorPick(null); }}
                              />
                            ))}
                          </div>
                          <button type="button" className="cal-pop-reset" onClick={() => { setTypeColor(t, EV_TYPE_META[t].c); setColorPick(null); }}>↺ 还原默认色</button>
                        </div>
                      )}
                    </span>
                  );
                })}</span>
              </div>
              <div className="cal-preview-row">
                <em>事件等级</em>
                <span className="pv-picks">{EV_RANK_ORDER.map((r) => (
                  <button key={r} type="button" className={`pv-pick ${pvRank === r ? 'on' : ''}`} onClick={() => setPvRank(pvRank === r ? '' : r)}>{EV_RANK_META[r]}</button>
                ))}</span>
              </div>
              <div className="cal-preview-row">
                <em>卡片状态</em>
                <span className="pv-picks">{(['todo', 'doing', 'done', 'hold'] as const).map((s) => {
                  const cs = CAL_STATUS[s]; const on = pvStatus === s;
                  return (
                    <button key={s} type="button" className={`pv-pick ${on ? 'on' : ''}`} style={on ? { background: cs.dot, color: '#fff' } : { color: cs.dot }} onClick={() => setPvStatus(on ? '' : s)}>{cs.label}</button>
                  );
                })}</span>
              </div>
              {pvType === 'seed' && (
                <div className="cal-preview-row">
                  <em>伏笔 · 计划回收</em>
                  <span className="pv-picks cal-pay-row">
                    <span className="cal-pay-wrap">
                    <button
                      type="button"
                      className="cal-pay-trigger"
                      onClick={() => {
                        if (!payOpen) {
                          const d = /^\d{4}-\d{2}-\d{2}$/.test(pvPay || '') ? parseKey(pvPay!) : new Date();
                          setPayYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
                        }
                        setPayOpen((v) => !v);
                      }}
                    >
                      {pvPay ? `📅 ${fmtYMD(normDate(pvPay) || pvPay!)}` : '📅 选择日期…'}
                    </button>
                    {pvPay && (
                      <button type="button" className="cal-pay-clear" title="清除回收日期" onClick={() => setPvPay('')}>✕ 清除</button>
                    )}
                    {payOpen && (
                      <div className="cal-date-pop" onClick={(e) => e.stopPropagation()}>
                        <div className="cal-date-head">
                          <button type="button" aria-label="上一月" onClick={() => setPayYm((p) => (p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 }))}>‹</button>
                          <b>{payYm.y}年{payYm.m}月</b>
                          <button type="button" aria-label="下一月" onClick={() => setPayYm((p) => (p.m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: p.m + 1 }))}>›</button>
                        </div>
                        <div className="cal-date-grid">
                          {WEEK_HEAD.map((w) => <i key={w} className={w === '日' ? 'sun' : w === '六' ? 'sat' : ''}>{w}</i>)}
                          {Array.from({ length: new Date(payYm.y, payYm.m - 1, 1).getDay() }).map((_, i) => <i key={'b' + i} />)}
                          {Array.from({ length: new Date(payYm.y, payYm.m, 0).getDate() }).map((_, i) => {
                            const k = `${pad4(payYm.y)}-${pad(payYm.m)}-${pad(i + 1)}`;
                            const isSel = pvPay === k;
                            const isToday = keyOf(new Date()) === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                className={`${isSel ? 'sel' : ''}${isToday ? ' today' : ''}`}
                                onClick={() => { setPvPay(k); setPayOpen(false); }}
                              >{i + 1}</button>
                            );
                          })}
                        </div>
                        <div className="cal-date-foot">
                          <button type="button" onClick={() => { setPvPay(keyOf(new Date())); setPayOpen(false); }}>今天</button>
                          <button type="button" onClick={() => { setPvPay(''); setPayOpen(false); }}>清除</button>
                        </div>
                      </div>
                    )}
                  </span>
                    <span className="hint">在该日期回收伏笔。日历会提示到期；过点仍未完成会标 ⚠。留空=不追踪回收。</span>
                  </span>
                </div>
              )}
              <div className="cal-preview-row">
                <em>关联事件（勾选排期卡，点下方标签可跳到该事件）</em>
                <span className="pv-picks">
                  {relChoices.length === 0 ? <span className="hint">暂无其他排期卡</span> : relChoices.map((rc) => (
                    <button key={rc.id} type="button" className={`pv-pick ${pvRel.includes(rc.id) ? 'on' : ''}`} onClick={() => setPvRel((l) => l.includes(rc.id) ? l.filter((x) => x !== rc.id) : [...l, rc.id])}>{rc.title || '未命名'}</button>
                  ))}
                </span>
                {(preview.relIds || []).length > 0 && (
                  <span className="cal-rel-list">
                    {preview.relIds!.map((id) => {
                      const rc = cards[id];
                      if (!rc || !rc.date) return null;
                      return <button key={id} type="button" className="era-out-chip clickable" onClick={() => jumpRel(rc)}>📅 {normDate(rc.date)!.slice(5).replace('-', '/')} {rc.title || '未命名'}</button>;
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="tl-detail-actions">
              <button className="btn small" onClick={savePreview}><CheckCircleIcon size={14} /> 保存</button>
              <button className="btn small ghost" onClick={closePreview}>取消</button>
              {preview && <button className="btn small danger" onClick={() => { removeCard(preview); closePreview(); }}><TrashColorIcon size={14} /> 移除排期</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}