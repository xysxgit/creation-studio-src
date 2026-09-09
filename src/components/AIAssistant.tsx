/**
 * ============ 悬浮 AI 助手面板 ============
 * 全局悬浮按钮 → 打开右侧 AI 面板：
 *  · 快捷指令（续写/扩写/润色/大纲）、Agent 选择、技能库、灵感/模板入口
 *  · 生成结果写入当前卡片/文档（经 editorAiStore 桥），支持“替换/追加”
 *  · 与富文本编辑器联动；无编辑器时操作整卡正文
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 全局悬浮 AI 助手（对话 + 过往对话记录 + AI 改动回退） ============
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../store';
import { AI_AGENTS, DEFAULT_AGENT_KEY, getAgent, parseAiActions, applyAiActions, selCtx, type AIAction, type AIQuick } from '../aiAgents';
import { loadSkills, saveSkills, parseSkillMd, makeSkill, type AISkill } from '../skills';
import AIModelSelect from './AIModelSelect';
import { AddIcon, RobotIcon, PuzzleIcon, BookIcon, GearColorIcon, DocIcon, ImportIcon, CloseIcon, CheckIcon, PencilIcon, SearchIcon, BrainIcon, TalkIcon, BoxIcon, TrashColorIcon, ClipboardIcon, EyeIcon, SyncIcon, RestoreIcon, SaveIcon, AskIcon, PaintbrushIcon, StarColorIcon, FlashIcon } from './icons';
import { useEditorAI } from '../editorAiStore';
import { canvasViewCenter, copyText, toast, uid } from '../util';
import { docWordCount, mdToDoc } from '../tiptap';
import { renderAiMd, stripAiMd } from '../lib/aiMd';
import type { Card, JSONDoc } from '../types';

type AiMsg = { role: 'user' | 'ai'; text: string; actions?: AIAction[]; raw?: string; thinking?: string };
type Conv = { id: string; agentKey: string; title: string; ts: number; msgs: AiMsg[] };
const CONVS_KEY = 'cs.aiConvs';
const FAB_KEY = 'cs.aiFab';

function plainTextOf(doc: JSONDoc | null | undefined): string {
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

function freshConv(agentKey: string): Conv {
  return { id: uid('aiC'), agentKey, title: '', ts: Date.now(), msgs: [] };
}

function loadConvs(): Conv[] {
  try {
    const l = JSON.parse(localStorage.getItem(CONVS_KEY) || '[]');
    if (Array.isArray(l)) return l as Conv[];
  } catch { /* ignore */ }
  return [];
}

function saveConvs(list: Conv[]) {
  try { localStorage.setItem(CONVS_KEY, JSON.stringify(list.slice(0, 30))); } catch { /* ignore */ }
}

const LEVELS: { v: 'low' | 'medium' | 'high'; t: string }[] = [
  { v: 'low', t: '浅' },
  { v: 'medium', t: '中' },
  { v: 'high', t: '深' },
];

export default function AIAssistant() {
  const ai = useStudio((s) => s.settings.ai);
  const aiHistory = useStudio((s) => s.aiHistory);
  const restoreAiHistory = useStudio((s) => s.restoreAiHistory);
  const clearAiHistoryBySource = useStudio((s) => s.clearAiHistoryBySource);
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [miniShrink, setMiniShrink] = useState(false); // 迷你面板缩小成小条（不关闭对话）
  // AI 应用记录：保存被替换/插入处的原文，可查看/恢复/删除（正文带 data-ai 标记可区分）
  type AiApplyLog = { id: string; ts: number; mode: 'replace' | 'after'; orig: string; ai: string; where: string };
  const [aiLogs, setAiLogs] = useState<AiApplyLog[]>(() => {
    try { return JSON.parse(localStorage.getItem('cs.aiLogs') || '[]'); } catch { return []; }
  });
  const [aiLogOpen, setAiLogOpen] = useState(false);
  const [aiViewId, setAiViewId] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.setItem('cs.aiLogs', JSON.stringify(aiLogs.slice(0, 60))); } catch { /* 忽略 */ }
  }, [aiLogs]);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  // 富文本选中文字点「AI 写作」时自动打开面板
  useEffect(() => {
    const h = () => { setOpen(true); setCompact(false); };
    // 日历等模块通过 window 事件唤起 AI 提问（携带 prompt）
    const q = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt) return;
      setOpen(true); setCompact(false);
      askRef.current(prompt);
    };
    window.addEventListener('ai-focus-selection', h);
    window.addEventListener('ai-ask', q);
    return () => {
      window.removeEventListener('ai-focus-selection', h);
      window.removeEventListener('ai-ask', q);
    };
  }, []);
  // 动态测量顶部栏（TopBar）高度，避免面板被其遮挡
  const [topBarH, setTopBarH] = useState(0);
  useEffect(() => {
    const el = document.querySelector('.topbar');
    if (!el) return;
    const update = () => setTopBarH(Math.max(0, el.getBoundingClientRect().bottom));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const [view, setView] = useState<'chat' | 'rec'>('chat');
  const [optOpen, setOptOpen] = useState(false);
  const [convs, setConvs] = useState<Conv[]>(loadConvs);
  const [curId, setCurId] = useState<string | null>(() => loadConvs()[0]?.id ?? null);
  const [agentKey, setAgentKey] = useState<string>(() => localStorage.getItem('cs.aiAgent') || DEFAULT_AGENT_KEY);
  // ---- 创作技能（Skill，兼容 goink-skills 格式）----
  const [skills, setSkills] = useState<AISkill[]>(() => loadSkills());
  const [activeSkills, setActiveSkills] = useState<string[]>(() => {
    try { const l = JSON.parse(localStorage.getItem('cs.aiActiveSkills') || '[]'); return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem('cs.aiActiveSkills', JSON.stringify(activeSkills)); } catch { /* ignore */ } }, [activeSkills]);
  const [skillOpen, setSkillOpen] = useState(false);
  const [skMode, setSkMode] = useState<'list' | 'edit' | 'import'>('list');
  const [skDraft, setSkDraft] = useState<AISkill | null>(null);
  const [skRaw, setSkRaw] = useState('');
  const persistSkills = (list: AISkill[]) => { setSkills(list); saveSkills(list); };
  const toggleActive = (id: string) => setActiveSkills((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAlways = (s: AISkill) => { persistSkills(skills.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled, updatedAt: Date.now() } : x))); };
  const rmSkill = async (s: AISkill) => {
    if (!await csConfirm(`删除技能「${s.name}」？`)) return;
    persistSkills(skills.filter((x) => x.id !== s.id));
    setActiveSkills((p) => p.filter((x) => x !== s.id));
  };
  const saveDraft = () => {
    if (!skDraft) return;
    if (!skDraft.name.trim() || !skDraft.content.trim()) { toast('名称与正文不能为空', 'warn'); return; }
    const existed = skills.find((x) => x.id === skDraft.id);
    const ns = { ...makeSkill(skDraft), createdAt: existed?.createdAt || Date.now() };
    persistSkills(existed ? skills.map((x) => (x.id === ns.id ? ns : x)) : [...skills, ns]);
    toast(existed ? '技能已更新' : '技能已保存', 'ok');
    setSkDraft(null); setSkMode('list'); setSkRaw('');
  };
  const startEdit = (s: AISkill | null) => {
    setSkDraft(s ? { ...s } : makeSkill({ name: '', description: '', category: '自定义', mode: 'auto', content: '' }));
    setSkMode('edit');
  };
  // 组装技能注入段：always（常驻，受 enabled 控制）+ 手动注入的 auto/manual
  const skillInjectionOf = (): string => {
    const inj = [
      ...skills.filter((x) => x.enabled && x.mode === 'always').map((x) => x.content).filter(Boolean),
      ...skills.filter((x) => x.mode !== 'always' && activeSkills.includes(x.id)).map((x) => x.content).filter(Boolean),
    ];
    if (!inj.length) return '';
    return `\n\n【本次生效的创作技能（请严格按其方法论执行；与助手基础设定冲突时，以技能为准）】\n${inj.map((c, i) => `【技能 ${i + 1}】\n${c}`).join('\n\n')}`;
  };
  const [input, setInput] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 记录视图：折叠状态
  const [expHis, setExpHis] = useState<Record<string, boolean>>({});
  const [expMsg, setExpMsg] = useState<Record<string, boolean>>({});
  const [expMini, setExpMini] = useState<number | null>(null); // 迷你面板中展开查看全文的消息序号
  const [logOpen, setLogOpen] = useState(false);
  const [thinkOpen, setThinkOpen] = useState<Record<string, boolean>>({});
  const [fullText, setFullText] = useState<Record<string, boolean>>({});
  // 完整面板消息默认形态：fold=折叠单行 / open=展开全文（设置里可切换，持久化）
  const [msgDefault, setMsgDefault] = useState<'fold' | 'open'>(() => (localStorage.getItem('cs.aiMsgDefault') === 'open' ? 'open' : 'fold'));
  const setMsgDefaultMode = (mode: 'fold' | 'open') => {
    setMsgDefault(mode);
    try { localStorage.setItem('cs.aiMsgDefault', mode); } catch { /* ignore */ }
    setFullText({}); // 重置各条显式开合，整列按新默认刷新
    toast(`消息默认${mode === 'fold' ? '折叠单行' : '展开全文'}`, 'ok');
  };
  // 消息显示形态：false=富文本排版 / true=纯文本（去 Markdown 符号）
  const [msgPlain, setMsgPlain] = useState<boolean>(() => localStorage.getItem('cs.aiMsgPlain') === '1');
  const setMsgPlainMode = (plain: boolean) => {
    setMsgPlain(plain);
    try { localStorage.setItem('cs.aiMsgPlain', plain ? '1' : '0'); } catch { /* ignore */ }
    toast(`消息显示：${plain ? '纯文本（去符号）' : '富文本排版'}`, 'ok');
  };
  // 存卡/应用到卡片/替换插入正文的落点格式：rich=解析为富文本 / plain=保留 Markdown 原文
  const [applyRich, setApplyRich] = useState<'rich' | 'plain'>(() => (localStorage.getItem('cs.aiApplyRich') === 'plain' ? 'plain' : 'rich'));
  const setApplyRichMode = (mode: 'rich' | 'plain') => {
    setApplyRich(mode);
    try { localStorage.setItem('cs.aiApplyRich', mode); } catch { /* ignore */ }
    toast(`存卡/插入格式：${mode === 'rich' ? '富文本（解析标题·列表·表格等）' : '纯文本（保留原文符号）'}`, 'ok');
  };
  /** 依据落点格式偏好把文本转成卡片/正文文档 */
  const applyDocOf = (txt: string): JSONDoc => (applyRich === 'rich' ? (mdToDoc(txt) as JSONDoc) : textToDoc(txt));
  // 正文选中文字缓存：迷你面板打开期间即使高亮被系统清掉，提问/显示仍可用上次选中的文字
  const [latestSel, setLatestSel] = useState('');
  const latestSelRef = useRef('');
  const stopRef = useRef<AbortController | null>(null);
  const askRef = useRef<(p: string, system?: string) => void>(() => undefined);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const miniScrollRef = useRef<HTMLDivElement | null>(null);

  const cur = convs.find((c) => c.id === curId) ?? null;
  const msgs = cur?.msgs ?? [];
  const agent = getAgent(cur?.agentKey || agentKey);
  const selCard = useStudio((x) => (x.selection.length === 1 ? x.cards[x.selection[0]] : undefined));
  const edB = useEditorAI((s) => s.bridge);
  // 迷你面板「正文选中」：优先实时选区，被系统清掉时回退到最近缓存（高亮保持）
  const liveSel = edB ? edB.getSelection() : '';
  const shownSel = liveSel || latestSel;
  const busy = !!curId && busyKey === curId;
  const showThink = ai.showThinking !== false;
  const s = useStudio.getState;
  // 迷你面板快捷操作可用性：最近一条已完成的 AI 回复；是否有可润色/续写的内容（正文选中或选中卡片）
  const lastAiDone = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const mm = msgs[i];
      if (mm.role === 'ai' && (mm.text || '').trim() && !(busy && i === msgs.length - 1)) return mm.text;
    }
    return '';
  })();
  const miniPolishAvail = !!selCard || !!shownSel;
  const miniQuickAvail = miniPolishAvail || (!!edB && !!lastAiDone);

  // 初始无会话时自动建一个
  useEffect(() => {
    if (!convs.length) {
      const n = freshConv(agentKey);
      setConvs([n]);
      setCurId(n.id);
      saveConvs([n]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 键盘避让（可视视口变化） ----
  const [vh, setVh] = useState<number>(() => (typeof window !== 'undefined' ? Math.min(window.visualViewport?.height || window.innerHeight, window.innerHeight) : 600));
  useEffect(() => {
    const upd = () => {
      const vv = window.visualViewport;
      setVh(Math.min(vv ? vv.height : window.innerHeight, window.innerHeight));
    };
    upd();
    window.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('resize', upd);
    return () => { window.removeEventListener('resize', upd); window.visualViewport?.removeEventListener('resize', upd); };
  }, []);
  const kbOpen = vh < (typeof window !== 'undefined' ? window.innerHeight : 600) - 60;

  // 消息滚动到底
  useEffect(() => {
    const el = msgEndRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
  }, [msgs.length, busy, open, view]);
  // 迷你面板：新消息时聊天记录区自动滚到底
  useEffect(() => {
    const el = miniScrollRef.current;
    if (el && open && compact) el.scrollTop = el.scrollHeight;
  }, [msgs.length, open, compact]);
  // 切换会话（迷你面板每次打开=新对话）时收起消息展开态
  useEffect(() => { setExpMini(null); }, [curId]);
  // 关闭面板时退出“缩小”状态，避免下次打开直接是小条
  useEffect(() => { if (!open) setMiniShrink(false); }, [open]);

  // ---- 悬浮球位置（可拖动 + 贴边收纳） ----
  const [fab, setFab] = useState<{ side: 'left' | 'right'; y: number }>(() => {
    try {
      const raw = localStorage.getItem(FAB_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if ((p.side === 'left' || p.side === 'right') && typeof p.y === 'number') return p;
      }
    } catch { /* ignore */ }
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return { side: 'right', y: Math.max(160, Math.round(h * 0.6)) };
  });
  const [fabFree, setFabFree] = useState<{ x: number; y: number } | null>(null);

  // 悬浮球拖动：窗口级监听保证连续流畅；位移 >6px 视为拖动，否则视为点击
  const onFabDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 800;
    const baseX = fab.side === 'right' ? w - 23 : 23;
    const baseY = fab.y;
    const sx = e.clientX;
    const sy = e.clientY;
    let lastX = baseX;
    let lastY = baseY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 6) moved = true;
      if (moved) {
        lastX = Math.min(Math.max(23, baseX + dx), w - 23);
        lastY = Math.min(Math.max(60, baseY + dy), h - 70);
        setFabFree({ x: lastX, y: lastY });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!moved) {
        if (open) {
          setOpen(false);
        } else {
          // 迷你面板每次打开 = 新建对话（旧对话保留在会话记录里）
          if (compact) {
            const n = freshConv(agentKey);
            setConvs((prev) => { const l = [n, ...prev]; saveConvs(l); return l; });
            setCurId(n.id);
            setInput('');
          }
          setOpen(true);
        }
        return;
      }
      const py = Math.min(Math.max(60, lastY), h - 70);
      const side: 'left' | 'right' = lastX < w / 2 ? 'left' : 'right';
      setFab({ side, y: py });
      try { localStorage.setItem(FAB_KEY, JSON.stringify({ side, y: py })); } catch { /* ignore */ }
      setFabFree(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onPanelDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input')) return;
    // 聊天记录区内：允许手指上下滑动查看历史，不拖动面板
    if (t.closest('.ai-mini-scroll')) return;
    // 面板打开/拖动期间禁用系统文本选择（复制弹窗），避免选中文字导致弹窗/跳动
    e.preventDefault();
    document.body.classList.add('ai-no-select');
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    let moved = false;
    let raf = 0;
    let nx = 0, ny = 0;
    const apply = () => {
      raf = 0;
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
      el.style.right = 'auto';
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 6) moved = true;
      if (moved) {
        ev.preventDefault();
        // 禁止面板移出屏幕边框：左右/上下都限制在可视区内
        const bw = Math.min(el.offsetWidth, window.innerWidth);
        const bh = Math.min(el.offsetHeight, window.innerHeight);
        const maxX = window.innerWidth - bw;
        const maxY = window.innerHeight - bh;
        nx = Math.min(Math.max(0, ev.clientX - ox), maxX);
        ny = Math.min(Math.max(0, ev.clientY - oy), maxY);
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    const finish = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
      document.body.classList.remove('ai-no-select');
      if (moved) setPanelPos({ x: nx, y: ny });
    };
    const up = () => finish();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
  };

  // ---- 当前会话 ----
  const commit = (id: string, fn: (c: Conv) => Conv, save = true) => {
    setConvs((prev) => {
      const list = prev.map((c) => (c.id === id ? fn(c) : c));
      if (save) saveConvs(list);
      return list;
    });
  };

  const startNew = () => {
    const n = freshConv(agentKey);
    setConvs((prev) => { const l = [n, ...prev]; saveConvs(l); return l; });
    setCurId(n.id);
    setView('chat');
    setOptOpen(false);
    setInput('');
    toast('已新建对话', 'ok');
  };

  const openConv = (id: string) => {
    setCurId(id);
    setView('chat');
    setOptOpen(false);
    setInput('');
  };

  const delConv = async (id: string) => {
    if (!await csConfirm('删除该对话记录？')) return;
    let list = convs.filter((c) => c.id !== id);
    if (!list.length) { const n = freshConv(agentKey); list = [n]; }
    if (curId === id) { setCurId(list[0].id); setView('chat'); }
    setConvs(list);
    saveConvs(list);
    toast('已删除对话', 'ok');
  };

  const pickAgent = (key: string) => {
    try { localStorage.setItem('cs.aiAgent', key); } catch { /* ignore */ }
    setAgentKey(key);
    if (curId) commit(curId, (c) => ({ ...c, agentKey: key }));
  };

  const setAiPatch = (patch: { thinking?: boolean; thinkLevel?: 'low' | 'medium' | 'high'; showThinking?: boolean }) => {
    const st = useStudio.getState();
    st.updateSettings({ ai: { ...st.settings.ai, ...patch } });
  };

  const stopGenerate = () => { stopRef.current?.abort(); };

  // ---- AI 应用正文：带标记写入 + 记录原文（可恢复/删除） ----
  const addAiLog = (mode: 'replace' | 'after', orig: string, aiText: string, where: string) => {
    const id = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    setAiLogs((p) => [{ id, ts: Date.now(), mode, orig, ai: aiText, where }, ...p].slice(0, 60));
    return id;
  };
  const applyAi = (text: string, mode: 'replace' | 'after') => {
    const eb2 = useEditorAI.getState().bridge;
    if (!eb2) { toast('请先打开正文编辑器（卡片 / 正文创作 / 全屏编辑）', 'warn'); return; }
    const sel = eb2.getSelection();
    if (!sel) { toast('请先在正文中选中要处理的文字', 'warn'); return; }
    const id = addAiLog(mode, mode === 'replace' ? sel : '', text, eb2.label || '正文');
    eb2.insertResult(text, mode, id);
    toast(mode === 'replace' ? '已替换正文选中文字（带 AI 标记，可到 📝 恢复原文）' : '已插入正文（带 AI 标记，可到 📝 恢复原文）', 'ok');
  };
  const revertAiLog = (log: AiApplyLog) => {
    const eb2 = useEditorAI.getState().bridge;
    if (!eb2) { toast('请先打开当初应用的那张卡片 / 正文编辑器再恢复', 'warn'); return; }
    const ok = eb2.applyAiRevert?.(log.id, log.orig, log.mode);
    if (ok) {
      setAiLogs((p) => p.filter((x) => x.id !== log.id));
      toast('已恢复原文', 'ok');
    } else {
      toast('在当前正文中找不到该段 AI 内容（可能已被改动，或不在当前打开的正文里）', 'warn');
    }
  };
  const delAiLog = (log: AiApplyLog) => {
    const eb2 = useEditorAI.getState().bridge;
    if (eb2?.clearAiMark) {
      const ok = eb2.clearAiMark(log.id);
      setAiLogs((p) => p.filter((x) => x.id !== log.id));
      toast(ok ? '已删除记录（正文标记已清除，文字保留）' : '已删除记录（当前正文未找到标记，文字不受影响）', 'ok');
    } else {
      setAiLogs((p) => p.filter((x) => x.id !== log.id));
      toast('已删除记录', 'ok');
    }
  };

  const ask = async (prompt: string, system?: string) => {
    if (busyKey) return;
    // 富文本编辑器活跃时，自动读取当前正文选中文字作为上下文（高亮被清除时用缓存）
    const eb = useEditorAI.getState().bridge;
    if (eb) {
      const selTxt = eb.getSelection() || latestSelRef.current;
      if (selTxt && !prompt.includes('【当前正文选中】')) {
        prompt = `${prompt}\n\n【当前正文选中（${selTxt.length} 字）】\n${selTxt.slice(0, 1600)}`;
      }
    }
    let tid = curId;
    if (!tid || !convs.some((c) => c.id === tid)) {
      tid = uid('aiC');
      const n: Conv = { id: tid, agentKey, title: '', ts: Date.now(), msgs: [] };
      setConvs((prev) => { const l = [n, ...prev]; saveConvs(l); return l; });
      setCurId(tid);
    }
    setBusyKey(tid);
    setInput('');
    commit(tid, (c) => ({
      ...c, ts: Date.now(),
      title: c.title || prompt.slice(0, 16),
      msgs: [...c.msgs, { role: 'user', text: prompt } as AiMsg].slice(-80),
    }));
    // 追加占位 AI 消息，流式填充
    commit(tid, (c) => ({ ...c, ts: Date.now(), msgs: [...c.msgs, { role: 'ai', text: '', thinking: '' } as AiMsg].slice(-80) }));
    const patchLast = (patch: Partial<AiMsg>, save = false) => {
      commit(tid, (c) => {
        const ms = [...c.msgs];
        const last = ms[ms.length - 1];
        if (last && last.role === 'ai') ms[ms.length - 1] = { ...last, ...patch };
        return { ...c, ts: Date.now(), msgs: ms.slice(-80) };
      }, save);
    };
    const ctrl = new AbortController();
    stopRef.current = ctrl;
    const thinkingOn = !!ai.thinking;
    const level = ai.thinkLevel || 'medium';
    let accText = '';
    let accThink = '';
    let finished = false;
    const persistNow = () => commit(tid, (c) => ({ ...c }));
    const finish = (aborted: boolean) => {
      if (finished) return;
      finished = true;
      if (aborted) {
        patchLast({ text: accText || '（已中断，可继续提问）', thinking: accThink || undefined }, true);
      } else if (!accText && !accThink) {
        patchLast({ text: '（无回复）', thinking: undefined }, true);
      } else {
        const parsed = parseAiActions(accText);
        patchLast({
          text: parsed ? parsed.rest || accText : accText,
          actions: parsed ? parsed.actions : undefined,
          raw: accText,
          thinking: accThink || undefined,
        }, true);
      }
      stopRef.current = null;
      setBusyKey(null);
    };
    const scrollToBottom = () => {
      const el = msgEndRef.current;
      const wrap = el?.closest('.ai-msgs') as HTMLElement | null;
      if (wrap && wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 160) {
        el?.scrollIntoView({ block: 'end' });
      }
    };
    try {
      const endpoint = ai.endpoint.replace(/\/+$/, '');
      const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
      const sysContent = (system || agent.system) + skillInjectionOf();
      const body: Record<string, unknown> = {
        model: ai.model || 'gpt-4o-mini',
        stream: true,
        messages: [
          { role: 'system', content: sysContent },
          { role: 'user', content: prompt },
        ],
      };
      if (thinkingOn) {
        body.reasoning_effort = level;
        body.thinking = { type: 'enabled', budget_tokens: level === 'high' ? 8192 : level === 'medium' ? 4096 : 2048 };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream')) {
        // 服务端不支持流式：一次性 JSON 回退
        const data = await res.json();
        const choice = data.choices?.[0]?.message || {};
        accText = typeof choice.content === 'string' ? choice.content : '';
        accThink = typeof choice.reasoning_content === 'string' ? choice.reasoning_content : '';
        patchLast({ text: accText, thinking: accThink || undefined }, false);
        finish(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');
      const dec = new TextDecoder();
      let buf = '';
      const flushLine = (line: string) => {
        const t = line.trim();
        if (!t.startsWith('data:')) return;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          const ev = JSON.parse(payload);
          const delta = ev.choices?.[0]?.delta || ev.choices?.[0]?.message || {};
          let changed = false;
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
            accThink += delta.reasoning_content;
            changed = true;
          }
          if (typeof delta.content === 'string' && delta.content) {
            accText += delta.content;
            changed = true;
          }
          if (changed) {
            if (accThink && showThink) patchLast({ thinking: accThink });
            if (accText) patchLast({ text: accText, thinking: accThink || undefined });
            scrollToBottom();
          }
        } catch { /* 忽略非 JSON 行 */ }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          flushLine(line);
          nl = buf.indexOf('\n');
        }
      }
      finish(false);
    } catch (e) {
      if (ctrl.signal.aborted) { finish(true); return; }
      patchLast({
        text: `调用失败：${(e as Error).message}。请在设置中检查 API 地址与密钥（本地模型可选用 Ollama / LM Studio，无需密钥）。`,
        thinking: accThink || undefined,
      }, false);
      persistNow();
      stopRef.current = null;
      setBusyKey(null);
    }
  };
  askRef.current = ask;

  const quick = (q: AIQuick) => {
    const st = s();
    const sel = st.selection.length === 1 ? st.cards[st.selection[0]] : null;
    const prompt = q.build(sel, { project: st.meta?.name || '', sections: st.sections.map((x) => x.name) });
    ask(prompt);
  };

  // ---- 写完自查：整章正文 × 伏笔台账 × 日历排期 ----
  const selfCheckNow = () => {
    const st = s();
    const stMap: Record<string, string> = { todo: '待定', doing: '推进中', done: '已完成', hold: '搁置' };
    const evT: Record<string, string> = { main: '主线', side: '支线', daily: '日常', seed: '伏笔' };
    const eb2 = useEditorAI.getState().bridge;
    const chapter = (eb2?.getDocPlain?.() || '').trim();
    const all = Object.values(st.cards).filter((c) => !c.writingOnly);
    const seeds = all.filter((c) => c.evType === 'seed');
    const seedLines = seeds.length
      ? seeds.map((c) => `• ${c.title || '未命名'}${c.date ? `｜埋设 ${c.date}` : ''}${c.payDate ? `｜计划回收 ${c.payDate}` : '｜未设回收目标'}｜状态 ${stMap[c.status || ''] || c.status || '未设'}${c.note ? `｜备注 ${c.note.slice(0, 50)}` : ''}`).join('\n')
      : '（暂无伏笔卡）';
    const evs = all.filter((c) => !!c.date)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(-60);
    const evLines = evs.map((c) => `${c.date!}${c.endDate && c.endDate > c.date! ? '~' + c.endDate : ''} ${c.title || '未命名'}${c.evType ? `（${evT[c.evType]}）` : ''}${c.status ? `·${stMap[c.status] || c.status}` : ''}`).join('\n');
    const prompt =
      '你是「写完自查」审稿人（创作助手用）。下面给出：当前正写的正文、项目伏笔台账、故事日历排期摘要。请做三件事：\n' +
      '1.【建议更新台账】找出正文里已经出现或收束的伏笔（按标题/设定元素辨认）。若某伏笔已在正文落地回收，逐条建议把它在日历中标为「✅已完成」；若只是铺垫则说明保持即可。\n' +
      '2.【漏回收预警】若有伏笔的「计划回收日期」对应情节已写到（正文时间线已越过/接近该日期）但正文未出现它，提醒：补一笔回收，或把它改期。\n' +
      '3.【一致性】对照日历排期摘要，指出正文与排期冲突的细节（时间/地点/人物在场等），只报确凿的，不要臆测。\n' +
      '输出用【建议更新台账】/【预警】/【一致性冲突】三段条目，没有就写「无」。不要重写正文。\n\n' +
      `【当前正文${chapter ? `（${chapter.length} 字）】\n${chapter.slice(0, 8000)}` : '（未读到打开的正文章节，可按台账做检查）】\n'}` +
      `\n\n【伏笔台账】\n${seedLines}\n\n【日历排期摘要（近 60 条，按日期）】\n${evLines || '（暂无排期事件）'}`;
    if (!chapter) toast('提示：未读取到打开的正文全文（请先打开正文编辑器），将按台账做检查', 'info');
    ask(prompt);
  };

  const applyToCard = (actions: AIAction[]) => {
    const st = s();
    const selId = st.selection.length === 1 ? st.selection[0] : null;
    const done = applyAiActions(actions, selId, {
      cards: st.cards,
      sections: st.sections,
      updateCard: (id, patch) => st.updateCard(id, patch),
      addCard: (partial, opts) => st.addCard(partial, opts),
      setSelection: (ids) => st.setSelection(ids),
      viewport: st.viewport,
    });
    done.forEach((d) => toast(d, d.startsWith('已') ? 'ok' : 'warn'));
    if (!done.length) toast('没有可执行的操作', 'warn');
    if (selId && actions.some((a) => a.op === 'update')) {
      const st2 = useStudio.getState();
      const c = st2.cards[selId];
      if (c) {
        st2.pushAiHistory({
          id: uid('aih'), cardId: selId, title: c.title || '未命名卡片', mode: 'replace',
          content: c.content as JSONDoc, prevContent: null, source: 'canvas', ts: Date.now(),
        });
      }
    }
  };

  const thinking = !!ai.thinking;
  const level = ai.thinkLevel || 'medium';
  const levelText = level === 'high' ? '深' : level === 'low' ? '浅' : '中';
  const modeText = (m: string) => (m === 'replace' ? '替换' : m === 'append' ? '追加' : '恢复');
  const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---- 文本 ↔ 卡片正文 / 保存为模板比例卡片 / 替换与追加 ----
  const textToDoc = (text: string): JSONDoc => ({
    type: 'doc',
    content: text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  });
  const autoTitleOf = (text: string): string => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const first = lines[0] || '';
    const m = first.match(/^#{1,6}\s*(.+)$/);
    const raw = (m ? m[1] : first).replace(/^[*\-•]\s*/, '').replace(/^【.*?】/, '').replace(/[:：].*$/, '').trim();
    return raw.slice(0, 16) || 'AI灵感';
  };
  const saveAsCard = async (text: string) => {
    if (!text.trim()) { toast('回复为空，无法保存', 'warn'); return; }
    const st = useStudio.getState();
    const title = await csPrompt('保存为卡片（名称将显示在卡片顶部，参考模板卡片样式）：', autoTitleOf(text));
    if (title === null) return;
    const t = (title || '').trim() || autoTitleOf(text);
    const vp = st.viewport;
    const center = canvasViewCenter(vp);
    const sel = st.selection.length === 1 ? st.cards[st.selection[0]] : undefined;
    const secId = sel ? sel.sectionId : (st.sections.find((x) => x.name === '便签')?.id || st.sections[0]?.id || '');
    const card: Card = {
      id: uid('card'), kind: 'note', sectionId: secId, title: t,
      content: applyDocOf(text),
      x: center.x - 120, y: center.y - 170, w: 240, h: 340, z: 1, paper: 'a4',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    st.addCardsAt([card]);
    st.setSelection([card.id]);
    toast(`已按模板比例(240×340)保存卡片「${t}」`, 'ok');
  };
  const applyTextToCard = (mode: 'replace' | 'append', text: string) => {
    const st = useStudio.getState();
    const id = st.selection.length === 1 ? st.selection[0] : null;
    if (!id) { toast('请先选中一张画布卡片', 'warn'); return; }
    if (!text.trim()) { toast('回复为空', 'warn'); return; }
    const c = st.cards[id];
    if (!c) return;
    const prev = c.content as JSONDoc | null;
    const newDoc = mode === 'replace'
      ? applyDocOf(text)
      : { type: 'doc' as const, content: [...(prev?.content || ([] as JSONDoc[])), ...(applyDocOf(text).content || ([] as JSONDoc[]))] };
    st.pushAiHistory({ id: uid('aih'), cardId: id, title: c.title || '未命名卡片', mode, content: newDoc, prevContent: prev, source: 'canvas', ts: Date.now() });
    st.updateCard(id, { content: newDoc });
    toast(mode === 'replace' ? '已替换卡片正文' : '已追加到卡片末尾', 'ok');
  };

  // 记录视图：分组（正文创作 / 画布 的 AI 改动回退）
  const recGroups: { key: string; label: string; items: { e: (typeof aiHistory)[number]; i: number }[] }[] = [
    { key: 'writing', label: '正文创作', items: aiHistory.map((e, i) => ({ e, i })).filter((x) => x.e.source !== 'canvas') },
    { key: 'canvas', label: '画布', items: aiHistory.map((e, i) => ({ e, i })).filter((x) => x.e.source === 'canvas') },
  ];
  const histOpen = expHis['__all'] !== false;

  const fabLeft = fabFree ? fabFree.x - 23 : (fab.side === 'right' ? undefined : 0);
  const fabRight = fabFree ? undefined : (fab.side === 'right' ? 0 : undefined);
  const fabTop = fabFree ? fabFree.y - 23 : fab.y - 23;
  // 面板顶部避让：优先取顶栏底部高度（动态测量）；无顶栏时按状态栏安全区 + 留白；键盘弹出时贴顶
  const topVal = kbOpen ? 6 : (topBarH > 0 ? topBarH + 6 : 46);
  const topPx = `calc(${topVal}px + env(safe-area-inset-top, 0px))`;
  const maxHPanel = `calc(${vh}px - ${topVal + 12}px - env(safe-area-inset-top, 0px))`;

  // 当前手动注入的技能 chips（完整面板：名称列表；迷你：数量入口）
  const chipsBar = (mini: boolean) => {
    if (!activeSkills.length) return null;
    const list = activeSkills.map((id) => skills.find((x) => x.id === id)).filter((x): x is AISkill => !!x);
    if (!list.length) return null;
    return (
      <div className={`ai-skill-chips ${mini ? 'mini' : ''}`}>
        <span className="ai-skill-chip-lab"><PuzzleIcon /> 技能生效</span>
        {mini ? (
          <button className="ai-skill-chip-open" onClick={() => setSkillOpen(true)}>查看/管理 ×{list.length}</button>
        ) : (
          <>
            {list.map((sk) => (
              <button key={sk.id} className="ai-skill-chip" title={`${sk.category} · ${sk.mode === 'auto' ? '自动' : '手动'}：点击可移除，不再注入`} onClick={() => toggleActive(sk.id)}>
                {sk.name}<span className="x">✕</span>
              </button>
            ))}
            <button className="ai-skill-chip-cfg" title="打开技能管理" onClick={() => setSkillOpen(true)}>管理</button>
          </>
        )}
      </div>
    );
  };

  // 迷你面板位置：仅由 DOM 直接管理（React 不参与 left/top/right），避免流式重渲染把拖拽位置“弹回”
  useEffect(() => {
    // 兜底：清理可能残留的全局禁选，保证正文可正常选中
    document.body.classList.remove('ai-no-select');
    const el = miniRef.current;
    if (!el || !(open && compact)) return;
    if (panelPos) {
      el.style.left = `${panelPos.x}px`;
      el.style.top = `${panelPos.y}px`;
      el.style.right = 'auto';
    } else {
      el.style.left = fab.side === 'left' ? '8px' : 'auto';
      el.style.right = fab.side === 'right' ? '8px' : 'auto';
      el.style.top = topPx;
    }
}, [open, compact, panelPos, fab.side, topPx, miniShrink]);

  // 迷你面板打开期间：当前富文本编辑器切为“只读但可选中” → 点击不弹输入法，长按仍可选中文字供 AI 读取
  useEffect(() => {
    edB?.setReadonly?.(open && compact);
  }, [open, compact, edB]);
  // 迷你面板打开期间：持续缓存最新选中的正文文字（高亮若被系统清除，提问/显示仍有内容可用）
  useEffect(() => {
    if (!(open && compact)) return;
    const upd = () => {
      if (!edB) return;
      try {
        const t = edB.getSelection();
        if (t) { latestSelRef.current = t; setLatestSel(t); }
      } catch { /* 忽略 */ }
    };
    document.addEventListener('selectionchange', upd);
    return () => document.removeEventListener('selectionchange', upd);
  }, [open, compact, edB]);

  // 迷你面板打开期间：禁止弹出输入法（仅迷你面板内的 textarea/input 允许聚焦弹键盘）
  useEffect(() => {
    if (!(open && compact)) return;
    const doc = document;
    const allowSel = '.ai-mini-panel input, .ai-mini-panel textarea';
    const ED_SEL = 'input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
    const onDown = (e: Event) => {
      const t = e.target as Element | null;
      if (!t || !t.closest) return;
      if (t.closest('.ai-mini-panel')) return; // 面板内按钮/输入框正常
      if (t.closest(ED_SEL)) e.preventDefault(); // 阻止聚焦 → 不弹输入法
    };
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest) return;
      if (t.closest(allowSel)) return;
      if (t.matches(ED_SEL) || t.closest(ED_SEL)) t.blur(); // 兜底：已获焦则移除，收起输入法
    };
    // 若打开面板时焦点还在其它可输入元素上，先收焦点（收起已弹出的输入法）
    const ae = doc.activeElement as HTMLElement | null;
    if (ae && ae !== doc.body && ae.blur && !(ae.closest && ae.closest(allowSel))) {
      if (ae.matches(ED_SEL) || (ae.closest && ae.closest(ED_SEL))) ae.blur();
    }
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('focusin', onFocusIn, true);
    return () => {
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('focusin', onFocusIn, true);
    };
  }, [open, compact]);

  return (
    <>
      <button
        className={`ai-float-btn ${fab.side === 'left' ? 'fab-left' : 'fab-right'}`}
        style={{ left: fabLeft, right: fabRight, top: fabTop }}
        title="AI 助手（按住拖动可贴边收纳，点击展开）"
        onPointerDown={onFabDown}
      >
        <RobotIcon size={24} />
      </button>

      {open && !compact && !aiLogOpen && !skillOpen && (
        <div className="ai-float-panel" style={{ left: fab.side === 'left' ? 8 : undefined, right: fab.side === 'right' ? 8 : undefined, top: topPx, maxHeight: maxHPanel }}>
          <div className="ai-float-head">
            <b><RobotIcon /> AI 助手</b>
            <span className="ai-float-tools">
              <button className="ai-tool" title="新建对话" onClick={startNew}><AddIcon /></button>
              <button className={`ai-tool ${skillOpen ? 'on' : ''}`} title="🧩创作技能（Skill）：把写作方法论注入 AI——常驻/手动注入，兼容 goink-skills 社区技能" onClick={() => { setSkillOpen((v) => !v); setOptOpen(false); setView('chat'); }}><PuzzleIcon />{activeSkills.length ? <i className="ai-log-badge">{activeSkills.length > 9 ? '9+' : activeSkills.length}</i> : null}</button>
              <button className={`ai-tool ${view === 'rec' ? 'on' : ''}`} title="过往对话记录" onClick={() => { setOptOpen(false); setView(view === 'rec' ? 'chat' : 'rec'); }}><BookIcon /></button>
              <button className={`ai-tool ${optOpen ? 'on' : ''}`} title="展开/收起选项" onClick={() => { setView('chat'); setOptOpen((o) => !o); }}><GearColorIcon /></button>
              <button className={`ai-tool ai-log-tool ${aiLogOpen ? 'on' : ''}`} title={`AI 应用记录（${aiLogs.length}）——查看/恢复/删除已应用到正文的 AI 内容`} onClick={() => { setAiLogOpen((v) => !v); setView('chat'); }}>
                <DocIcon />{aiLogs.length ? <i className="ai-log-badge">{aiLogs.length > 9 ? '9+' : aiLogs.length}</i> : null}
              </button>
              <button className="ai-tool" title="迷你输入模式（只留输入框，方便边选卡片边提问）" onClick={() => setCompact(true)}><ImportIcon /></button>
              <button className="modal-x" onClick={() => setOpen(false)}><CloseIcon /></button>
            </span>
          </div>

          {optOpen ? (
        <div className="ai-float-opt ai-float-opt--full">
          <div className="ai-opt-topbar">
            <b><GearColorIcon /> AI 助手设置</b>
            <button className="ai-opt-back" onClick={() => { setOptOpen(false); setView('chat'); }}><CheckIcon /> 完成对话</button>
          </div>
                  <div className="ai-agents" title="选择智能体：不同创作需求的预设角色">
                    {AI_AGENTS.map((a) => (
                      <button
                        key={a.key}
                        className={`ai-agent ${(cur?.agentKey || agentKey) === a.key ? 'active' : ''}`}
                        title={`${a.emoji} ${a.name}：${a.desc}`}
                        onClick={() => pickAgent(a.key)}
                      >
                        {a.emoji} {a.name}
                      </button>
                    ))}
                  </div>
                  <div className="ai-agent-desc">{agent.emoji} {agent.name} · {agent.desc}</div>
                  <div className="ai-quick">
                    {agent.quick.map((q) => (
                      <button key={q.key} onClick={() => quick(q)}>{q.label}</button>
                    ))}
                  </div>
                  <div className="ai-gen-row">
                    <button className="btn small"
                      title="让 AI 以 JSON 操作直接修改/新建画布卡片"
                      onClick={() => {
                        const st = s();
                        const sel = st.selection.length === 1 ? st.cards[st.selection[0]] : null;
                        ask('请以「AI 协同编辑」模式工作：' + (sel
                          ? `修改当前选中卡片「${sel.title}」（正文见下），直接给出改写后的完整正文。` + selCtx(sel)
                          : '基于你目前对本次对话的了解，构思一张新的创作卡片（标题+正文），并在 JSON 中声明创建。') + '\n\n请务必在回复末尾附上 JSON 操作块。');
                      }}
                    ><PencilIcon /> 协同编辑</button>
                    <button className="btn small"
                      title="写完自查：对照整章正文、伏笔台账与日历排期，给出「该标记完成的伏笔 / 漏回收预警 / 时间排期冲突」"
                      onClick={selfCheckNow}
                    ><SearchIcon /> 写完自查</button>
                  </div>
                  <AIModelSelect />
                  <div className="ai-opt-head"><BrainIcon /> 思考过程</div>
                  <div className="ai-think-row">
                    <span><BrainIcon /> 思考</span>
                    <div className="btn-row">
                      <button className={`ai-tg ${!thinking ? 'active' : ''}`} onClick={() => { setAiPatch({ thinking: false }); toast('思考模式：关', 'ok'); }}>关</button>
                      {LEVELS.map((l) => (
                        <button
                          key={l.v}
                          className={`ai-tg ${thinking && level === l.v ? 'active' : ''}`}
                          onClick={() => { setAiPatch({ thinking: true, thinkLevel: l.v }); toast(`思考模式：开 · ${l.t}`, 'ok'); }}
                        >
                          {l.t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ai-think-row">
                    <span><TalkIcon /> 显示思考过程</span>
                    <div className="btn-row">
                      <button className={`ai-tg ${showThink ? 'active' : ''}`} onClick={() => { setAiPatch({ showThinking: true }); toast('显示思考过程：开（流式展示）', 'ok'); }}>开</button>
                      <button className={`ai-tg ${!showThink ? 'active' : ''}`} onClick={() => { setAiPatch({ showThinking: false }); toast('显示思考过程：关', 'ok'); }}>关</button>
                    </div>
                  </div>
                  <div className="ai-opt-head"><ClipboardIcon /> 消息与落卡偏好</div>
                  <div className="ai-think-row">
                    <span><DocIcon /> 消息默认</span>
                    <div className="btn-row">
                      <button className={`ai-tg ${msgDefault === 'fold' ? 'active' : ''}`} onClick={() => setMsgDefaultMode('fold')}>折叠单行</button>
                      <button className={`ai-tg ${msgDefault === 'open' ? 'active' : ''}`} onClick={() => setMsgDefaultMode('open')}>展开全文</button>
                    </div>
                  </div>
                  <div className="ai-think-row">
                    <span><EyeIcon /> 消息显示</span>
                    <div className="btn-row">
                      <button className={`ai-tg ${!msgPlain ? 'active' : ''}`} onClick={() => setMsgPlainMode(false)}>富文本</button>
                      <button className={`ai-tg ${msgPlain ? 'active' : ''}`} onClick={() => setMsgPlainMode(true)}>纯文本</button>
                    </div>
                  </div>
                  <div className="ai-think-row">
                    <span><BoxIcon /> 存卡/插入</span>
                    <div className="btn-row">
                      <button className={`ai-tg ${applyRich === 'rich' ? 'active' : ''}`} onClick={() => setApplyRichMode('rich')}>富文本</button>
                      <button className={`ai-tg ${applyRich === 'plain' ? 'active' : ''}`} onClick={() => setApplyRichMode('plain')}>纯文本</button>
                    </div>
                  </div>
              </div>
            ) : view === 'chat' ? (
              <>
              {!ai.enabled || !ai.endpoint.trim() ? (
                <div className="muted pad">请先在「设置 → AI 助手」中启用并填写 API 地址/密钥后使用。</div>
              ) : (
                <div className="ai-panel">
                  <div className="ai-msgs">
                    {msgs.map((m, i) => {
                      const streaming = busy && i === msgs.length - 1;
                      const tk = `cur-${i}`;
                      const thinkOn = thinkOpen[tk] === true;
                      const thinkBodyOpen = showThink && !!m.thinking && (thinkOn || streaming);
                      const isAI = m.role === 'ai';
                      const body = m.text || '';
                      const ft = fullText[tk];
                      // 折叠单行与否：显式点过按显式，未点过跟随“消息默认”设置
                      const folded = !streaming && !!body && (ft === false || (ft === undefined && msgDefault === 'fold'));
                      // 需要“纯文本化”正文的情形：折叠摘要 / 消息纯文本显示（避免每次渲染都解析）
                      const needPlain = (folded && !streaming) || (isAI && !streaming && msgPlain);
                      const plainBody = needPlain ? stripAiMd(body) : body;
                      const toggleOne = (k: string) =>
                        setFullText((p) => ({ ...p, [k]: p[k] === undefined ? msgDefault === 'fold' : !(p[k] === true) }));
                      return (
                        <div
                          key={i}
                          className={`ai-msg ${m.role} ${streaming ? 'streaming' : ''} ${folded ? 'folded' : ''}`}
                          onClick={(e) => {
                            // 点整条消息 = 展开/收起（折叠态单行、展开态全文）；内部按钮/思考/操作区除外
                            const t = e.target as HTMLElement;
                            if (!body || streaming || (t.closest && t.closest('button, .ai-actions, .ai-think-block'))) return;
                            toggleOne(tk);
                          }}
                        >
                          {folded ? (
                            <div className="ai-msg-row" title="点击展开全文">
                              <span className="r">{isAI ? agent.emoji : '🙂'}</span>
                              <span className="n">{isAI ? agent.name : '我'}</span>
                              <span className="t">{plainBody.replace(/\s+/g, ' ').trim()}</span>
                              <span className="x">▸</span>
                            </div>
                          ) : (
                            <>
                              <div className="ai-msg-top">
                                <span className="ai-who">{m.role === 'user' ? '🙂 我' : `${agent.emoji} ${agent.name}`}</span>
                                {!isAI && body ? (
                                  <span
                                    className="ai-msg-copy"
                                    title="复制这条消息"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyText(body).then((ok2) => toast(ok2 ? '已复制该消息' : '复制失败', ok2 ? 'ok' : 'err'));
                                    }}
                                  >⧉ 复制</span>
                                ) : null}
                              </div>
                              {showThink && !!m.thinking && (
                                <div className={`ai-think-block ${streaming ? 'streaming' : ''}`}>
                                  <button className="ai-think-toggle" onClick={() => setThinkOpen((p) => ({ ...p, [tk]: !(p[tk] === true) }))}>
                                    💭 思考过程 {thinkBodyOpen ? '▾' : '▸'}{streaming ? '（生成中…）' : ''}
                                  </button>
                                  {thinkBodyOpen && <div className="ai-think-body" style={{ maxHeight: streaming ? 'none' : 180 }}>{m.thinking}</div>}
                                </div>
                              )}
                              {isAI && body && !streaming && !msgPlain ? (
                                <div className="ai-text ai-rt" dangerouslySetInnerHTML={{ __html: renderAiMd(body) }} />
                              ) : isAI && body && !streaming ? (
                                <span className="ai-text" style={{ whiteSpace: 'pre-wrap' }}>{plainBody}</span>
                              ) : (
                                <span className="ai-text" style={{ whiteSpace: 'pre-wrap' }}>
                                  {body || (streaming ? (showThink && m.thinking ? '💭 思考中…' : '生成中…') : '')}
                                  {streaming && <span className="ai-caret" />}
                                </span>
                              )}
                              {!streaming && body && (
                                <span
                                  className="ai-more"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleOne(tk);
                                  }}
                                >▴ 收起</span>
                              )}
                              {isAI && (
                                <span className="ai-actions">
                                  {streaming && (
                                    <button className="ai-stop-btn" title="中断本次生成" onClick={stopGenerate}>⏹ 停止</button>
                                  )}
                                  {m.actions && m.actions.length > 0 && (
                                    <button title="把 AI 声明的操作应用到画布（修改选中卡片/新建卡片）" onClick={() => applyToCard(m.actions!)}>
                                      <PencilIcon /> 应用
                                    </button>
                                  )}
                                  {edB && (
                                    <>
                                      <button title="用这条回复替换当前正文中选中的文字（带 AI 标记，可到 📝 恢复原文）" onClick={() => applyAi(body, 'replace')}><SyncIcon /> 替换</button>
                                      <button title="把这条回复插入到当前正文选中文字之后（带 AI 标记，可到 📝 恢复原文）" onClick={() => applyAi(body, 'after')}><ImportIcon /> 插入</button>
                                    </>
                                  )}
                                  <button title="存为模板比例新卡片（240×340，命名后插入画布）" onClick={() => saveAsCard(m.raw || body)}><SaveIcon /> 存卡</button>
                                  <button
                                    title={msgPlain ? '复制为纯文本（已去 Markdown 符号）' : '复制回复（Markdown 源）'}
                                    onClick={() => {
                                      const src = msgPlain ? stripAiMd(m.raw || body) : (m.raw || body);
                                      copyText(src).then((ok2) => toast(ok2 ? (msgPlain ? '已复制纯文本' : '已复制') : '复制失败', ok2 ? 'ok' : 'err'));
                                    }}
                                  >
                                    ⧉
                                  </button>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                    {!msgs.length && (
                      <div className="muted pad">
                        {cur ? (cur.title ? `「${cur.title}」` : '新对话') : 'AI 助手'} · 先选中一张卡片再提问，AI 会自动读取内容。
                        <br />
                        点上方加号新建对话；可查看过往对话记录。
                      </div>
                    )}
                    <div ref={msgEndRef} />
                  </div>
                  {chipsBar(false)}
                  <div className="ai-input">
                    <textarea
                      value={input}
                      placeholder={`${thinking ? `思考(${levelText}) ` : ''}${agent.name}：提问…（Enter）`}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (input.trim()) ask(input.trim());
                        }
                      }}
                    />
                    {busy ? (
                      <button className="ai-stop" onClick={stopGenerate}>⏹ 停止</button>
                    ) : (
                      <button disabled={!!busyKey || !input.trim()} onClick={() => ask(input.trim())}>发送</button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="ai-rec">
              <div className="ai-rec-bar">
                <b><BookIcon /> 过往对话</b>
                <button className="btn small" onClick={startNew}><AddIcon /> 新对话</button>
              </div>
              <div className="ai-rec-body">
                <div className="ai-his-all-head" onClick={() => setExpHis((p) => ({ ...p, __all: !(p.__all !== false) }))}>
                  <span className="ai-rec-glabel">{histOpen ? '▾' : '▸'} 对话列表（{convs.filter((c) => c.msgs.length).length}）</span>
                  <button className="btn small" onClick={async (e) => { e.stopPropagation(); if (await csConfirm('清空所有对话记录？')) { const n = freshConv(agentKey); setConvs([n]); setCurId(n.id); saveConvs([n]); toast('对话记录已清空', 'ok'); } }}>清空</button>
                </div>
                {histOpen && convs.filter((c) => c.msgs.length).length === 0 && (
                  <div className="muted pad">暂无过往对话。发消息开始对话后会自动记录。</div>
                )}
                {histOpen && convs.map((c) => {
                  if (!c.msgs.length) return null;
                  const o = expHis[c.id] === true;
                  return (
                    <div key={c.id} className={`ai-his-item ${c.id === curId ? 'current' : ''}`}>
                      <div className="ai-his-row" onClick={() => setExpHis((p) => ({ ...p, [c.id]: !o }))}>
                        <span className="ai-his-fold">{o ? '▾' : '▸'}</span>
                        <span className="ai-his-title">{c.title || '新对话'}{c.id === curId ? ' · 当前' : ''}</span>
                        <span className="ai-his-meta">{c.msgs.length}条 · {fmt(c.ts)}</span>
                        <span className="ai-his-ops" onClick={(e) => e.stopPropagation()}>
                          <button title="继续该对话" onClick={() => openConv(c.id)}><RestoreIcon /> 继续</button>
                          <button title="删除" onClick={() => delConv(c.id)}><TrashColorIcon /></button>
                        </span>
                      </div>
                      {o && (
                        <div className="ai-his-msgs">
                          {c.msgs.map((m, mi) => {
                            const mk = `${c.id}-${mi}`;
                            const mo = expMsg[mk] === true;
                            const preview = (m.role === 'user' ? '我：' : `${getAgent(c.agentKey).emoji} AI：`) + m.text.replace(/\s+/g, ' ').slice(0, 40);
                            return (
                              <div key={mi} className={`ai-his-msg ${m.role}`} onClick={() => setExpMsg((p) => ({ ...p, [mk]: !mo }))}>
                                <span className="ai-his-msg-preview">{mo ? '▾ ' : '▸ '}{preview}{m.text.length > 40 ? '…' : ''}</span>
                                {mo && (
                                  <div className="ai-his-msg-full" onClick={(e) => e.stopPropagation()}>
                                    <div className="ai-his-msg-text">{m.text}</div>
                                    {m.thinking && (
                                      <details className="ai-think-detail">
                                        <summary>💭 思考过程</summary>
                                        <div className="ai-think-body">{m.thinking}</div>
                                      </details>
                                    )}
                                    <div className="ai-his-msg-ops">
                                      <button className="btn small" onClick={() => openConv(c.id)}>继续对话</button>
                                      <button className="btn small" onClick={() => copyText(m.text).then((ok2) => toast(ok2 ? '已复制' : '复制失败', ok2 ? 'ok' : 'err'))}>复制</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="ai-his-all-head" onClick={() => setLogOpen((v) => !v)}>
                  <span className="ai-rec-glabel">{logOpen ? '▾' : '▸'} <PencilIcon /> AI 改动回退（{aiHistory.length}）</span>
                  <button className="btn small" onClick={async (e) => { e.stopPropagation(); if (await csConfirm('清空全部 AI 改动回退记录？')) { clearAiHistoryBySource('writing'); clearAiHistoryBySource('canvas'); } }}>清空</button>
                </div>
                {logOpen && (
                  <div className="ai-rec-body-sub">
                    {aiHistory.length === 0 ? (
                      <div className="muted pad">暂无 AI 改动记录。「应用到画布」等 AI 修改会自动记录，可回退。</div>
                    ) : (
                      recGroups.map((g) => {
                        if (!g.items.length) return null;
                        const grpOpen = expHis[`__log_${g.key}`] !== false;
                        return (
                          <div key={g.key} className="ai-rec-group">
                            <div className="ai-rec-group-head" onClick={() => setExpHis((p) => ({ ...p, [`__log_${g.key}`]: !grpOpen }))}>
                              <span className="ai-rec-glabel">{grpOpen ? '▾' : '▸'} {g.key === 'writing' ? <DocIcon /> : <PaintbrushIcon />} {g.label} · {g.items.length}</span>
                              <button className="btn small" onClick={async (e) => { e.stopPropagation(); if (await csConfirm(`清空「${g.label}」的记录？`)) clearAiHistoryBySource(g.key as 'writing' | 'canvas'); }}>清空</button>
                            </div>
                            {grpOpen && g.items.map(({ e, i }) => {
                              const mk = `log-${e.id}`;
                              const o = expMsg[mk] === true;
                              return (
                                <div key={e.id} className="ai-rec-item">
                                  <div className="ai-rec-row" onClick={() => setExpMsg((p) => ({ ...p, [mk]: !o }))}>
                                    <span className={`aih-mode ${e.mode}`}>{modeText(e.mode)}</span>
                                    <span className="ai-rec-title">{e.title || '未命名'}</span>
                                    <span className="ai-rec-meta">{docWordCount(e.content).toLocaleString()}字</span>
                                    <span className="ai-rec-fold">{o ? '▾' : '▸'}</span>
                                  </div>
                                  {o && (
                                    <div className="ai-rec-expand">
                                      <div className="ai-rec-preview">{plainTextOf(e.content)}</div>
                                      <div className="ai-rec-actions">
                                        <button className="btn small" onClick={() => restoreAiHistory(i)} title="回退到该版本（当前内容先备份到正文回收站）"><RestoreIcon /> 恢复此版本</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    {open && compact && !miniShrink && (
        <div className="ai-float-panel ai-mini-panel" ref={miniRef} onPointerDown={onPanelDown} style={{ maxHeight: maxHPanel }}>
          <div className="ai-mini">
            {edB ? (
              <div className="ai-mini-read" title={shownSel || '正文编辑'}>
                <span className="tx">📖 正文选中：{shownSel ? (shownSel.slice(0, 70) + (shownSel.length > 70 ? '…' : '')) : '（请先在正文中选中文字）'}</span>
                {!liveSel && latestSel ? (
                  <span className="ai-mini-sel-clear" title="清除已记住的选中文字" onClick={(e) => { e.stopPropagation(); setLatestSel(''); latestSelRef.current = ''; }}>✕</span>
                ) : null}
              </div>
            ) : selCard ? (
              <div className="ai-mini-read" title={selCard.title}>
                📖 「{selCard.title.length > 10 ? selCard.title.slice(0, 10) + '…' : selCard.title}」：{plainTextOf(selCard.content).slice(0, 70)}
              </div>
            ) : null}
            {miniQuickAvail && (
              <div className="ai-mini-quick">
                {miniPolishAvail && (
                  <>
                    <button
                      title={selCard ? `AI 润色卡片「${selCard.title}」正文` : 'AI 润色正文中选中的文字'}
                      disabled={!miniPolishAvail}
                      onClick={() => selCard
                        ? ask('请润色下面这张卡片的正文：保持原意与结构，让表达更通顺、自然、有感染力。直接输出润色后的完整正文，不要解释、不要 JSON。\n\n' + selCtx(selCard))
                        : ask('请润色当前正文中选中的文字：保持原意与结构，让表达更通顺、自然、有感染力。直接输出润色后的文字本身，不要解释、不要 JSON。')}
                    ><PencilIcon color="#6a5cf5" /> 润色</button>
                    <button
                      title={selCard ? `AI 续写卡片「${selCard.title}」` : 'AI 顺着正文选中的文字续写'}
                      disabled={!miniPolishAvail}
                      onClick={() => selCard
                        ? ask('请阅读下面这张卡片的内容与主题，续写一段自然衔接的新内容（保持风格一致）。直接输出续写段落，不要解释、不要 JSON。\n\n' + selCtx(selCard))
                        : ask('请顺着当前正文中选中的文字，续写一段自然衔接的内容（保持风格一致，不重复原文）。直接输出续写内容，不要解释、不要 JSON。')}
                    ><AddIcon color="#6a5cf5" /> 续写</button>
                  </>
                )}
                {!!edB && (
                  <button
                    className="ai-mini-selfcheck"
                    title="写完自查：对照整章正文、伏笔台账与日历排期，找漏回收/该标记完成的伏笔与冲突"
                    onClick={selfCheckNow}
                  ><SearchIcon /> 自查本章</button>
                )}
                {!!edB && !!lastAiDone && (
                  <>
                    <span className="sep" />
                    <button title="用最近一条 AI 回复替换正文中选中的文字（带标记，可到 📝 恢复原文）" onClick={() => applyAi(lastAiDone, 'replace')}><SyncIcon /> 替换</button>
                    <button title="把最近一条 AI 回复插入到正文选中文字之后（带标记，可到 📝 恢复原文）" onClick={() => applyAi(lastAiDone, 'after')}><ImportIcon /> 插入</button>
                  </>
                )}
              </div>
            )}
            {msgs.length ? (
              <div className="ai-mini-scroll" ref={miniScrollRef}>
                {msgs.map((m, i) => {
                  const isLast = i === msgs.length - 1;
                  const txt = m.text || (m.role === 'ai' && busy && isLast ? '思考中…' : '');
                  const exp = expMini === i;
                  return (
                    <div
                      className={`ai-mini-msg ${m.role === 'user' ? 'user' : ''} ${exp ? 'expanded' : ''}`}
                      key={i}
                      title={exp ? '点击收起' : (txt || (m.role === 'ai' ? 'AI 回复' : '我的提问'))}
                      onClick={() => setExpMini(exp ? null : i)}
                    >
                      <span className="r">{m.role === 'ai' ? <RobotIcon /> : <AskIcon />}</span>
                      <span className="t">{txt || (m.role === 'ai' ? '…' : '')}</span>
                      {txt ? (
                        <span
                          className="cp"
                          title="复制这条消息"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyText(txt).then((ok2) => toast(ok2 ? '已复制该消息' : '复制失败', ok2 ? 'ok' : 'err'));
                          }}
                        >⧉</span>
                      ) : null}
                      <span className={`x ${exp ? 'on' : ''}`}>{exp ? '▾' : '▸'}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ai-mini-scroll ai-mini-empty"><TalkIcon /> 新对话：输入问题即可开始，聊天记录可上下滑动查看</div>
            )}
            {chipsBar(true)}
            <div className="ai-input">
              <textarea
                rows={1}
                value={input}
                placeholder={selCard ? `针对「${selCard.title}」提问…` : '提问 AI（可先选中卡片/正文文字）…'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) ask(input.trim());
                  }
                }}
              />
              {busy ? (
                <button className="ai-stop" title="中断" onClick={stopGenerate}>⏹</button>
              ) : (
                <button className="ai-mini-btn ai-mini-send" disabled={!!busyKey || !input.trim()} onClick={() => ask(input.trim())}>发送</button>
              )}
              <button className="ai-mini-btn ai-mini-aux" title="展开完整面板" onClick={() => setCompact(false)}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg></button>
              <button className="ai-mini-btn ai-shrink-btn ai-mini-aux" title="缩小成小条（不关闭对话，点小条恢复）" onClick={() => setMiniShrink(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="currentColor" /></svg></button>
              <button className="ai-mini-btn ai-mini-aux" title="关闭" onClick={() => setOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg></button>
            </div>
          </div>
        </div>
      )}
      {open && compact && miniShrink && (
        <div
          className="ai-mini-shrunk"
          style={{ left: fab.side === 'left' ? 8 : undefined, right: fab.side === 'right' ? 8 : undefined, top: topPx }}
          onClick={() => setMiniShrink(false)}
        >
          <span className="ai-mini-shrunk-ic"><TalkIcon /></span>
          <span className="ai-mini-shrunk-t">继续对话{msgs.length ? `（${msgs.length} 条）` : ''} ▸</span>
        </div>
      )}
      {aiLogOpen && !compact && (
        <div className="ai-log-mask" onClick={() => setAiLogOpen(false)}>
          <div className="ai-log-pop" onClick={(e) => e.stopPropagation()}>
            <div className="ai-log-head">
              <b><DocIcon /> AI 应用记录</b>
              <span className="ai-log-sub">已应用到正文的内容都带紫色标记，这里保存了原文，可恢复/删除</span>
              <button className="modal-x" onClick={() => setAiLogOpen(false)}><CloseIcon /></button>
            </div>
            {!aiLogs.length ? (
              <div className="muted pad">暂无应用记录。把 AI 回复「⤵️替换 / ⬇️插入」到正文后会自动保存原文。</div>
            ) : (
              <div className="ai-log-body">
                {aiLogs.map((log) => {
                  const v = aiViewId === log.id;
                  return (
                    <div key={log.id} className={`ai-log-item ${v ? 'open' : ''}`}>
                      <div className="ai-log-meta">
                        {fmt(log.ts)} · {log.where}{log.mode === 'replace' ? ' · 替换' : ' · 插入'}
                      </div>
                      <div className="ai-log-preview">
                        <span className="tag">AI</span>{log.ai.replace(/\s+/g, ' ').slice(0, 60)}{log.ai.length > 60 ? '…' : ''}
                      </div>
                      <div className="ai-log-preview orig">
                        <span className="tag">原文</span>{log.orig ? log.orig.replace(/\s+/g, ' ').slice(0, 60) + (log.orig.length > 60 ? '…' : '') : '（插入，无原文）'}
                      </div>
                      <div className="ai-log-ops">
                        <button onClick={() => setAiViewId(v ? null : log.id)}>{v ? '▴ 收起' : <EyeIcon />}</button>
                        <button title="把正文中该段 AI 内容恢复成应用前的原文" onClick={() => revertAiLog(log)}><RestoreIcon /> 恢复原文</button>
                        <button title="删除此记录（正文文字保留，紫色标记清除）" onClick={() => delAiLog(log)}><TrashColorIcon /> 删除</button>
                      </div>
                      {v && (
                        <div className="ai-log-full">
                          <div className="ai-log-sec"><b>原文：</b></div>
                          <div className="ai-log-ori-txt">{log.orig || '（插入模式，无原文）'}</div>
                          <div className="ai-log-sec"><b>AI 内容（正文中带紫色标记的部分）：</b></div>
                          <div className="ai-log-ai-txt">{log.ai}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {skillOpen && (
        <div className="ai-skill-mask" onClick={() => setSkillOpen(false)}>
          <div className="ai-skill-pop" onClick={(e) => e.stopPropagation()}>
            <div className="ai-skill-head">
              <b><PuzzleIcon /> 创作技能</b>
              <span className="ai-skill-sub">写作方法论注入 AI。⭐常驻=每次自动生效；🤖自动/⚡手动=点「注入」后对后续提问持续生效。可直接导入 goink-skills 社区 .md。</span>
              <span className="ai-skill-head-btns">
                {skMode !== 'list' ? <button className="btn small" onClick={() => { setSkMode('list'); setSkDraft(null); setSkRaw(''); }}>‹ 返回</button> : null}
                <button className="modal-x" onClick={() => setSkillOpen(false)}><CloseIcon /></button>
              </span>
            </div>
            <div className="ai-skill-body">
              {skMode === 'list' && (
                <>
                  <div className="ai-skill-bar">
                    <button className="btn small" onClick={() => startEdit(null)}><AddIcon /> 新建技能</button>
                    <button className="btn small" onClick={() => setSkMode('import')}><ImportIcon /> 导入 goink-skills .md</button>
                    <span className="hint">已内置 3 个示例（去AI味 / 英雄之旅 / 情感弧线）</span>
                  </div>
                  <div className="ai-skill-list">
                    {skills.map((sk) => {
                      const injected = sk.mode !== 'always' && activeSkills.includes(sk.id);
                      return (
                        <div key={sk.id} className={`ai-skill-item ${sk.mode} ${injected ? 'injected' : ''} ${sk.mode === 'always' && !sk.enabled ? 'off' : ''}`}>
                          <div className="ai-skill-title">
                            <span className={`ai-skill-mode m-${sk.mode}`}>{sk.mode === 'always' ? <><StarColorIcon /> 常驻</> : sk.mode === 'manual' ? <><FlashIcon /> 手动</> : <><RobotIcon /> 自动</>}</span>
                            <b>{sk.name}</b>
                            <span className="ai-skill-ver">v{sk.version || 1}{sk.author ? ` · ${sk.author}` : ''}</span>
                          </div>
                          <div className="ai-skill-desc">{sk.description || '（无描述）'}<span className="muted"> · {sk.category || '自定义'}</span></div>
                          <div className="ai-skill-ops">
                            {sk.mode === 'always' ? (
                              <button className={`ai-tg ${sk.enabled ? 'active' : ''}`} onClick={() => toggleAlways(sk)}>{sk.enabled ? '常驻：开' : '常驻：关'}</button>
                            ) : (
                              <button className={`ai-tg ${injected ? 'active' : ''}`} onClick={() => toggleActive(sk.id)}>{injected ? '✔ 已注入（点此移除）' : '↗ 注入本次对话'}</button>
                            )}
                            <button className="btn small" onClick={() => startEdit(sk)}><PencilIcon /> 编辑</button>
                            <button className="btn small" title="删除" onClick={() => rmSkill(sk)}><TrashColorIcon /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {skMode === 'import' && (
                <div className="ai-skill-import">
                  <div className="muted pad">粘贴一个 goink-skills / 自写的技能 Markdown（带 --- frontmatter），点「解析并编辑」后可改模式与正文再保存：</div>
                  <textarea className="ai-skill-ta" rows={9} placeholder={'---\nname: my-skill\ndescription: 简述这个技能的功能，以及 AI 应在何时使用它\ncategory: 分类\nmode: auto\nauthor: \nversion: 1\n---\n（正文内容自由编写，Markdown 格式）'} value={skRaw} onChange={(e) => setSkRaw(e.target.value)} />
                  <div className="btn-row">
                    <button className="btn small" onClick={() => {
                      const r = parseSkillMd(skRaw);
                      if (r.error) { toast(r.error, 'err'); return; }
                      const s = r.skill!;
                      setSkDraft(makeSkill({ name: s.name, description: s.description, category: s.category, mode: s.mode, author: s.author, version: s.version, content: s.content }));
                      setSkMode('edit');
                      toast('已解析，可在下方编辑后保存', 'ok');
                    }}>解析并编辑</button>
                    <button className="btn small" onClick={() => setSkMode('list')}>取消</button>
                  </div>
                </div>
              )}
              {skMode === 'edit' && skDraft && (
                <div className="ai-skill-form">
                  <label>名称
                    <input className="ai-skill-in" value={skDraft.name} onChange={(e) => setSkDraft({ ...skDraft, name: e.target.value })} placeholder="如：末世先知回归模式" />
                  </label>
                  <label>触发模式
                    <span className="btn-row">
                      {(['auto', 'manual', 'always'] as const).map((m) => (
                        <button key={m} className={`ai-tg ${skDraft.mode === m ? 'active' : ''}`} onClick={() => setSkDraft({ ...skDraft, mode: m })}>
                          {m === 'auto' ? <><RobotIcon /> 自动</> : m === 'manual' ? <><FlashIcon /> 手动</> : <><StarColorIcon /> 常驻</>}
                        </button>
                      ))}
                    </span>
                  </label>
                  <label>分类
                    <input className="ai-skill-in" value={skDraft.category} onChange={(e) => setSkDraft({ ...skDraft, category: e.target.value })} placeholder="文笔 / 结构 / 情节 / 对白 / 角色…" />
                  </label>
                  <label>描述（AI 何时使用它）
                    <textarea className="ai-skill-in" rows={2} value={skDraft.description} onChange={(e) => setSkDraft({ ...skDraft, description: e.target.value })} placeholder="一句话描述 + AI 何时应自动使用它" />
                  </label>
                  <label>正文（方法论，Markdown）
                    <textarea className="ai-skill-ta" rows={10} value={skDraft.content} onChange={(e) => setSkDraft({ ...skDraft, content: e.target.value })} />
                  </label>
                  <div className="btn-row">
                    <button className="btn small" onClick={saveDraft}><SaveIcon /> 保存</button>
                    <button className="btn small" onClick={() => { setSkDraft(null); setSkMode('list'); }}>取消</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}