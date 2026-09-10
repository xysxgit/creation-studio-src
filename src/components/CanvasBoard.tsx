/**
 * ============ 主画布 CanvasBoard（核心 2000+ 行）============
 * 结构速览（后续增改请按分区定位）：
 *  · 45 行起  组件主体：state 订阅 → 拖拽/选区/缩放/连线手势 → 渲染
 *  · 1125 行起 return 主 JSX：画布容器 + 卡片层 + 连线层 + 框选/右键/工具条
 *  · 所有交互状态集中在组件闭包内（Drag/CtxState），拆子组件时注意透传
 *  · 卡片渲染在 CardView（已 memo）；连线几何在 utils/geometry
 * ================================================================
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 主画布 ============
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Annotation, Card, Edge } from '../types';
import { useStudio, getClientId } from '../store';
import { busEmit, busOn } from '../canvasBus';
import { clamp, fileToDataURL, PALETTE, paperRatio, toast, uid, compressImageDataUrl } from '../util';
import { pickImage, isNative as isNativeEnv } from '../native/nativeActions';
import { cardTemplates, templatesForBoard } from '../contentData';
import { templateToCard } from '../defaults';
import { saveCardAsTemplate, loadTemplates, customTemplateToCard } from '../templates';
import { saveCardAsInspiration } from '../inspiration';
import CardView from './CardView';
import { TrashIcon, NoteIcon, StarColorIcon, ImportantUserIcon, FlashIcon, BackpackIcon, TalkIcon, ImageIcon, ClipboardIcon, BrushIcon, FolderIcon, SelectIcon, PuzzleIcon, LockColorIcon, UnlockIcon, BookIcon, TrashColorIcon, GroupIcon, ImportIcon, FitViewIcon, EraserIcon, PaintbrushIcon, HandIcon, ArrowIcon, ArrowBackIcon, ScissorsIcon, UngroupIcon, PinIcon, PencilIcon, CheckIcon, CloseIcon, DocIcon, CursorIcon, SaveIcon, SectionIcon } from './icons';
import { PageSwitcher } from './TopBar';
import { createPortal } from 'react-dom';
import EdgesLayer from './EdgesLayer';
import { edgeGeometry, anchorPoint } from '../utils/geometry';
import { getStroke } from 'perfect-freehand';
import { computeZoomAnchor, toWorldPoint } from '../utils/coords';
import MiniMap from './MiniMap';
import { publishPresence } from '../sync/ws';

type Drag =
  | { type: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { type: 'band'; startX: number; startY: number }
  | { type: 'none'; startX: number; startY: number }
  | { type: 'cards'; ids: string[]; startX: number; startY: number; origins: Record<string, { x: number; y: number }> }
  | { type: 'resize'; id: string; dir: string; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } }
  | { type: 'connect'; from: string; dir: string }
  | { type: 'branch'; edgeId: string }
  | { type: 'zoomBox'; startX: number; startY: number }
  | { type: 'pen'; annId: string };

interface CtxItem {
  label: ReactNode;
  danger?: boolean;
  fn: () => void;
}
interface CtxState {
  x: number;
  y: number;
  cardId?: string;
  items: CtxItem[];
}

export default function CanvasBoard() {
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const edges = useStudio((s) => s.edges);
  const annotations = useStudio((s) => s.annotations);
  const groups = useStudio((s) => s.groups);
  const vp = useStudio((s) => s.viewport);
  const selection = useStudio((s) => s.selection);
  const selectedGroupId = useStudio((s) => s.selectedGroupId);
  const edgeSelection = useStudio((s) => s.edgeSelection);
  const saving = useStudio((s) => s.saving);
  const editingCardId = useStudio((s) => s.editingCardId);
  const peers = useStudio((s) => s.peers);
  const sectionFilter = useStudio((s) => s.sectionFilter);
  const tool = useStudio((s) => s.tool);
  const globalLock = useStudio((s) => s.globalLock);
  const canUndo = useStudio((s) => s.historyIdx >= 0);
  const canRedo = useStudio((s) => (s.redoStack?.length ?? 0) > 0);
  const cardList = useMemo(() => Object.values(cards).filter((c) => !c.writingOnly), [cards]);
    const selectionSet = useMemo(() => new Set(selection), [selection]);
    const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
    const peerEditingMap = useMemo(() => {
      const m = new Map<string, string>();
      for (const p of Object.values(peers)) {
        if (p.editingCardId && p.id !== getClientId()) m.set(p.editingCardId, p.name);
      }
      return m;
    }, [peers]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const spaceRef = useRef(false);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const lastPresence = useRef(0);

  const [animating, setAnimating] = useState(false);
  const [bandRect, setBandRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tempEdge, setTempEdge] = useState<{ from: string; toX: number; toY: number; branch?: boolean; fromDir?: string } | null>(null);
  // 拖线目标卡片：连线末端实时悬停命中的卡片（拖动中高亮提示可连接）
  const [connectTargetId, setConnectTargetId] = useState<string | null>(null);
  // 命中检测：连线末端坐标落在哪张卡片内（排除起点/原两端，按层级取最上层）；
  // 若未命中单卡但落在某编组包围框内，则命中该编组（编组作为整体节点可连线）
  // 连线类型规则：卡片只能连卡片，编组只能连编组（由源节点 areGroup 决定命中目标类型）
  const pickConnectHit = (list: Card[], exclude: string, x: number, y: number, exclude2?: string): string | null => {
    const gs = useStudio.getState();
    const srcIsGroup = !!gs.groups[exclude];
    // 需要排除的 id：源自身 + 源所属的对应编组锚点
    const excludeIds = new Set<string>([exclude, exclude2].filter((x): x is string => !!x));
    if (srcIsGroup) {
      // 源是编组 → 跳过其成员卡片（编组连线不连回自己组内）
      for (const c of list) if (c.groupId === exclude) excludeIds.add(c.id);
    } else {
      // 源是卡片 → 跳过所属编组框（避免连回自己所在的组）
      const srcCard = list.find((c) => c.id === exclude);
      if (srcCard?.groupId) excludeIds.add(srcCard.groupId);
    }
    // 卡片优先命中：卡片与编组同处一个层级森林，卡片源与编组源都允许命中目标卡片
    //（编组源仅须跳过自身成员卡，已在上面 excludeIds 排除；卡片也支持连编组）
    for (const c of [...list].sort((a, b) => b.z - a.z)) {
      if (excludeIds.has(c.id)) continue;
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c.id;
    }
    // 再检测编组框（卡片源连编组、编组源连编组均命中编组）
    for (const gid of Object.keys(gs.groups)) {
      if (excludeIds.has(gid)) continue;
      const box = groupBoxes[gid];
      if (box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return gid;
    }
    return null;
  };
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [ctxSec, setCtxSec] = useState(false);   // 右键菜单是否正在显示“移动到分区”二级子菜单
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [branchMenu, setBranchMenu] = useState<{ x: number; y: number; world: { x: number; y: number }; edge: Edge | null; from?: string } | null>(null);
  const [edgeCtx, setEdgeCtx] = useState<{ x: number; y: number; edge: Edge } | null>(null);
  // 连线菜单实时取最新连线（edgeCtx.edge 是打开时的快照，更新后选中标记会失效）
  const edgeCtxLiveId = edgeCtx?.edge?.id;
  const liveEdge = useStudio((s) => (edgeCtxLiveId ? s.edges[edgeCtxLiveId] : undefined));
  const [toolPanelOpen, setToolPanelOpen] = useState(false);
  const [vtGroup, setVtGroup] = useState(0);
  const vtStart = useRef(0);
  // 两两一组翻页（用户方案）：分组循环切换，顶部/底部 ↑↓ 箭头 + 触摸滑动均可
  const vtGroupCount = 3;
  const goVtGroup = (dir: -1 | 1) => setVtGroup((g) => (g + dir + vtGroupCount) % vtGroupCount);
  // 整条工具条滚轮 = 切换分组（阻断冒泡，避免同时缩放画布）
  const vToolbarRef = useRef<HTMLDivElement>(null);
  const vtWheelAt = useRef(0);
  useEffect(() => {
    const el = vToolbarRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - vtWheelAt.current < 220) return;
      vtWheelAt.current = now;
      goVtGroup(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const vtGroups = [
    [
      <PageSwitcher key="ps" />,
      <button key="new" className="vt-btn" title="新建卡片（便签）｜不依赖双击，任意设备可用" aria-label="新建卡片" onClick={() => { const st = useStudio.getState(); if (st.globalLock) return; const vp = st.viewport; const w = 170, h = 240; const wrap = wrapRef.current; let cx: number, cy: number; if (wrap) { const r = wrap.getBoundingClientRect(); cx = (r.left + r.width / 2 - vp.x) / vp.zoom - w / 2; cy = (r.top + r.height / 2 - vp.y) / vp.zoom - h / 2; } else { cx = vp.x + (window.innerWidth / 2 - w / 2) / vp.zoom; cy = vp.y + (window.innerHeight / 2 - h / 2) / vp.zoom; } const id = st.addCard({ x: cx, y: cy }, { op: true }); st.setSelection([id]); ensureCardInView(id); toast('已新建便签卡', 'ok'); }}>＋</button>,
    ],
    [
      <button key="undo" className={`vt-btn ${canUndo ? '' : 'disabled'}`} title="撤销 Ctrl+Z" aria-label="撤销" onClick={() => useStudio.getState().undo()}>↩</button>,
      <button key="redo" className={`vt-btn ${canRedo ? '' : 'disabled'}`} title="重做 Ctrl+Y" aria-label="重做" onClick={() => useStudio.getState().redo()}>↪</button>,
    ],
    [
      <button key="save" className="vt-btn" title="保存 Ctrl+S" aria-label="保存" onClick={() => useStudio.getState().saveNow(true)}><SaveIcon size={16} /></button>,
      <button key="del" className={`vt-btn ${selection.length || edgeSelection.length ? '' : 'disabled'}`} title="删除选中（Delete）" aria-label="删除选中" onClick={() => { const st = useStudio.getState(); if (st.edgeSelection.length) st.deleteEdges(st.edgeSelection); if (st.selection.length) st.deleteCards(st.selection); }}><TrashIcon size={16} /></button>,
    ],
  ];
  const orientation = useStudio((s) => s.settings.orientation);

  const [zoomLocked, setZoomLocked] = useState(false);
  // 锁定状态同时镜像到 ref，避免 wheel 等 useEffect（依赖为空、只绑定一次的闭包）读到过时的 zoomLocked：
  // 否则切换锁后滚轮缩放仍生效、与按钮/双指锁定行为不一致（“切换锁后出现缩放/手势异常”）。
  const zoomLockedRef = useRef(zoomLocked);
  zoomLockedRef.current = zoomLocked;
  const [tplMenu, setTplMenu] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  /** 触屏多选模式：轻点卡片加入/移出选择（ref 穿透 memo 卡片组件） */
  const [multiSelect, setMultiSelectState] = useState(false);
  const multiSelectRef = useRef(false);
  const setMultiSelect = (v: boolean) => {
    multiSelectRef.current = v;
    setMultiSelectState(v);
  };
  const menuOpenedAt = useRef(0);
    const lastCardCtxAt = useRef(0);
    const lastCardCtxId = useRef<string | null>(null);
    const visibleIdsRef = useRef<string[]>([]);
  const [selAnnotation, setSelAnnotation] = useState<string | null>(null);
  const selAnnotationRef = useRef<string | null>(null);
  selAnnotationRef.current = selAnnotation;
  let pendingBranchImage: { edge: Edge | null; world: { x: number; y: number }; from?: string } | null = null;
  // 统一图片落地：无论图片来自原生相册（base64/dataUrl）还是 Web file input，都走同一处理
  // 场景：a) 从连线新建「图片」分支 b) 替换当前图片卡 c) 在空白处新建图片卡
  const handleImageSrc = async (src: string) => {
    const st = useStudio.getState();
    // 性能增强：统一压缩/缩放大图，避免大图 base64 撑爆内存与 localStorage（不影响已存图片）
    const finalSrc = await compressImageDataUrl(src);
    if (pendingBranchImage) {
      const { edge, world, from } = pendingBranchImage;
      pendingBranchImage = null;
      const id = st.addImageCard(finalSrc, world.x - 160, world.y - 130);
      if (edge) {
        st.deleteEdges([edge.id]);
        st.addEdge(edge.from, id);
        st.addEdge(id, edge.to);
      } else if (from) {
        st.addEdge(from, id);
      }
      st.setSelection([id]);
      toast('已创建图片节点并连线', 'ok');
      setBranchMenu(null);
      return;
    }
    const c = st.cards[ctx?.cardId || ''];
    if (c && c.kind === 'image') {
      st.updateCard(c.id, { imageSrc: finalSrc });
    } else {
      const w = toWorldPoint(vpRef.current, wrapRef.current, ctx?.x ?? window.innerWidth / 2, ctx?.y ?? window.innerHeight / 2);
      const id = st.addImageCard(finalSrc, w.x - 160, w.y - 130);
      st.setSelection([id]);
    }
  };
  // 统一打开图片选择：原生端走系统相册（NativeGallery），Web 端走 file input 兜底
  const openImagePicker = async () => {
    if (isNativeEnv()) {
      try {
        const r = await pickImage();
        if (r?.dataUrl) await handleImageSrc(r.dataUrl);
        return;
      } catch { /* 原生相册失败，回退 web */ }
    }
    fileRef.current?.click();
  };
  const branchItems = [
    { key: 'note', label: <><NoteIcon size={14} /> 便签</>, tpl: null as null, image: false, title: '' },
    { key: 'main', label: <><ImportantUserIcon size={14} /> 重要角色</>, tpl: cardTemplates.find((t) => t.key === 'main-character') || null, image: false, title: '' },
    { key: 'event', label: <><FlashIcon size={14} /> 事件</>, tpl: cardTemplates.find((t) => t.key === 'event') || null, image: false, title: '' },
    { key: 'item', label: <><BackpackIcon size={14} /> 道具</>, tpl: cardTemplates.find((t) => t.key === 'item') || null, image: false, title: '' },
    { key: 'talk', label: <><TalkIcon size={14} /> 对白</>, tpl: cardTemplates.find((t) => t.key === 'dialogue') || null, image: false, title: '' },
    { key: 'image', label: <><ImageIcon size={14} /> 图片</>, tpl: null, image: true, title: '' },
  ];
  const bgLongPress = useRef<number | null>(null);
  const bgLongPressFiredAt = useRef(0);
  const clearBgLongPress = () => {
    if (bgLongPress.current !== null) {
      clearTimeout(bgLongPress.current);
      bgLongPress.current = null;
    }
  };
  // —— 画布手势去闪统一开关：任意持续改视野/移动元素（滚轮缩放、拖动/平移、触控捏合、拖卡/改尺寸、±按键）——
//    只在“手指/指针正在移动内容”期间于 <body> 挂 .cs-zooming，抑制卡片 hover 抬升过渡与 3D 层逐帧重建，
//    停手约 160ms 后移除，消除放大与拖动时卡片“浮起↔落下/闪跳”。
  const bodyCls = 'cs-zooming';
  const wheelBuf = useRef({ on: false, pan: false, accDx: 0, accDy: 0, accFactor: 1, ax: 0, ay: 0 });
  const wheelFrame = useRef(0);
  const gestureT = useRef(0);
  const gestureClear = () => {
    gestureT.current = 0;
    document.body.classList.remove(bodyCls);
  };
  const gestureRelease = () => {
    if (gestureT.current) clearTimeout(gestureT.current);
    // 若还有未 flush 的滚轮帧，等它完成再移除
    if (wheelFrame.current) { gestureSettle(); return; }
    gestureClear();
  };
  const gestureSettle = () => {
    if (gestureT.current) clearTimeout(gestureT.current);
    gestureT.current = window.setTimeout(gestureRelease, 40);
  };
  const gestureOn = () => {
    document.body.classList.add(bodyCls);
    if (gestureT.current) { clearTimeout(gestureT.current); gestureT.current = 0; }
    gestureT.current = window.setTimeout(gestureClear, 160);
  };
  const flushWheelBuf = () => {
    wheelFrame.current = 0;
    const b = wheelBuf.current;
    if (!b.on) { gestureRelease(); return; }
    b.on = false;
    const st = useStudio.getState();
    if (b.pan) {
      st.setViewport({ zoom: st.viewport.zoom, x: st.viewport.x + b.accDx, y: st.viewport.y });
    } else if (Math.abs(b.accFactor - 1) > 0.0005) {
      zoomAtAnchor(b.accFactor, b.ax, b.ay, { preferSelection: false });
    }
    b.accDx = 0; b.accDy = 0; b.accFactor = 1;
    gestureOn();
  };
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const penStart = useRef<{ color: string; width: number; eraser: boolean; points: [number, number][] } | null>(null);
  const [penPreview, setPenPreview] = useState<[number, number][] | null>(null);
  const erasedAnyRef = useRef(false); // 实时擦除标记（松手时合并为一次撤销）
  const [penColor, setPenColor] = useState<string>(() => localStorage.getItem('cs.pen.color') || '#e17055');
  const [penWidth, setPenWidth] = useState<number>(() => Number(localStorage.getItem('cs.pen.width')) || 3);
  const [eraserWidth, setEraserWidth] = useState<number>(() => Number(localStorage.getItem('cs.eraser.width')) || 14);
  const [penEraser, setPenEraser] = useState<boolean>(() => localStorage.getItem('cs.pen.eraser') === '1');
  const setPenColorP = (c: string) => { setPenColor(c); try { localStorage.setItem('cs.pen.color', c); } catch { /* ignore */ } };
  const setPenWidthP = (w: number) => { setPenWidth(w); try { localStorage.setItem('cs.pen.width', String(w)); } catch { /* ignore */ } };
  const setEraserWidthP = (w: number) => { setEraserWidth(w); try { localStorage.setItem('cs.eraser.width', String(w)); } catch { /* ignore */ } };
  const setPenEraserP = (b: boolean) => { setPenEraser(b); try { localStorage.setItem('cs.pen.eraser', b ? '1' : '0'); } catch { /* ignore */ } };

  // 触屏双击空白新建（touch-action:none 下浏览器不派发 dblclick，需手动检测）
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTouchCreate = useRef(0);

  
  /** 确保某张卡片至少出现在当前视野内；如果不在，则把视野中心移到卡片上 */
  const ensureCardInView = (id: string) => {
    const st = useStudio.getState();
    let c = st.cards[id];
    if (!c) return;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      const rect = wrapRef.current?.getBoundingClientRect();
      const w = rect?.width || window.innerWidth;
      const h = rect?.height || window.innerHeight;
      const vp = st.viewport;
      st.updateCard(id, { x: (w / 2 - vp.x) / vp.zoom - c.w / 2, y: (h / 2 - vp.y) / vp.zoom - c.h / 2 });
      c = st.cards[id];
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;
    const vp = st.viewport;
    const x0 = -vp.x / vp.zoom;
    const y0 = -vp.y / vp.zoom;
    const x1 = (w - vp.x) / vp.zoom;
    const y1 = (h - vp.y) / vp.zoom;
    const margin = 60;
    const inside = c.x >= x0 - margin && c.x + c.w <= x1 + margin && c.y >= y0 - margin && c.y + c.h <= y1 + margin;
    if (!inside) {
      st.setViewport({
        zoom: vp.zoom,
        x: w / 2 - (c.x + c.w / 2) * vp.zoom,
        y: h / 2 - (c.y + c.h / 2) * vp.zoom,
      });
    }
  };

  // ---------- 键盘 ----------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const inInput = !!el.closest('input, textarea, [contenteditable="true"]');
      if (e.code === 'Space' && !inInput) {
        spaceRef.current = true;
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        const stEsc = useStudio.getState();
        // 全屏编辑器：焦点不在编辑器内时也能用 Escape 关闭
        if (stEsc.fullscreenCardId) stEsc.setFullscreenCard(null);
        // 仅在确实退出编辑器时刷新 lastEditExit（否则会误触发移动端双击新建的防误触）
        if (stEsc.editingCardId) stEsc.setEditingCard(null);
        setCtx(null);
        setEdgeCtx(null);
        setGroupCtx(null);
        setBranchMenu(null);
        setTplMenu(null);
        setTempEdge(null);
        if (stEsc.selection.length || stEsc.edgeSelection.length) {
          stEsc.setSelection([], { edge: false });
        }
        return;
      }
      if (inInput || e.isComposing) return;
      const s = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        s.copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        s.pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        s.copySelection();
        s.deleteCards(s.selection);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateCards(s.selection);
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.saveNow(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const ids = Object.keys(s.cards).filter((id) => s.sectionFilter === 'all' || s.cards[id].sectionId === s.sectionFilter);
        s.setSelection(ids);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selAnnotationRef.current) {
          s.deleteAnnotation(selAnnotationRef.current);
          selAnnotationRef.current = null;
          return;
        }
        if (s.edgeSelection.length) s.deleteEdges(s.edgeSelection);
        if (s.selection.length) s.deleteCards(s.selection);
      }
        // 常用工具/视图快捷键（不干扰输入框）
        const k = e.key.toLowerCase();
        if (k === 'v') {
          e.preventDefault();
          s.setTool('select');
          return;
        }
        if (k === 'm') {
          e.preventDefault();
          s.setTool('move');
          return;
        }
        if (k === 'e') {
          e.preventDefault();
          s.setTool('edit');
          return;
        }
        if (k === 'p') {
          e.preventDefault();
          s.setTool('pen');
          return;
        }
        if (k === 'f') {
          e.preventDefault();
          s.fitView();
          return;
        }
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomAtAnchor(1.18);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          zoomAtAnchor(0.85);
          return;
        }
        if (k === '0') {
          e.preventDefault();
          s.setViewport({ ...s.viewport, zoom: 1 });
          return;
        }
        if (e.key === '?' || (e.shiftKey && k === '/')) {
          e.preventDefault();
          s.setModal('help');
          return;
        }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ---------- 点击空白处关闭所有弹出菜单（捕获阶段；仅真正的“点击”，拖动/长按不关闭）----------
  useEffect(() => {
    const isPopup = (t: EventTarget | null) => !!(t instanceof HTMLElement && t.closest?.('.ctx-menu, .zc-panel, .modal, .drawer-mask, .minimap, .page-switcher, .multi-bar, .v-toolbar'));
    let down: { t: number; x: number; y: number; button: number } | null = null;
    let lastPointerWasTouch = false;
    const onDown = (e: PointerEvent) => {
      lastPointerWasTouch = e.pointerType === 'touch';
      down = { t: Date.now(), x: e.clientX, y: e.clientY, button: e.button };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d) return;

      if (d.button !== 0) return; // 右键/中键不触发关闭（右键刚打开菜单）
      if (isPopup(e.target)) return;
      if (Date.now() - d.t > 350) return; // 长按不算点击
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return; // 拖动不算点击
      setCtx(null);
      setEdgeCtx(null);
      setGroupCtx(null);
      setBranchMenu(null);
      setTplMenu(null);
      // 点击画布空白处：右下角悬浮面板自动收纳（点在卡片/面板/其他 UI 上不触发）
      const tgt = e.target as HTMLElement;
      // 画笔/橡皮工具下点击画布不收纳工具面板（保持连续作画/擦除）
      if (useStudio.getState().tool !== 'pen' && tgt.closest?.('.canvas-wrap') && !tgt.closest('.card, .zc-panel, .minimap, .v-toolbar, .page-switcher, .ctx-menu, .multi-bar')) {
        setToolPanelOpen(false);
        if (multiSelect) setMultiSelect(false);
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      // 仅触屏：长按弹出菜单后抬手，touchend 生成的 click 会落在菜单上误触按钮，这里吞掉
      // （鼠标点击不受影响，可立即操作菜单项）
      if (lastPointerWasTouch && Date.now() - menuOpenedAt.current < 400) {
        const t = e.target as HTMLElement;
        if (t.closest?.('.ctx-menu, .tpl-menu')) {
          e.stopPropagation();
          e.preventDefault();
          menuOpenedAt.current = 0;
        }
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  // ---------- 滚轮（平移 / 缩放）----------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // 触点在可滚动内容（卡片正文 / 预览 / 锁定卡 / 卡内菜单）上时，优先滚动内容本身（3.10 滚动兜底），
      // 不缩放画布；若沿途没有真正可滚动的容器，仍按画布滚轮缩放处理
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.rich-scroll, .card-preview-body, .rich-static, .card.locked .card-body, .rtb-more-pop, .rtb-color-pop, .ctx-menu, .tpl-menu')) {
        let el = t as HTMLElement;
        while (el && el !== e.currentTarget) {
          if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return;
          el = el.parentElement as HTMLElement;
        }
      }
      e.preventDefault();
      // 滚轮缩放（3.8 电脑端）：普通滚轮与 Ctrl/⌘+滚轮均缩放，以鼠标位置为锚点（0.2~3 倍，内部钳制）；
      // 横向滚轮（deltaX 为主）仍用于左右平移，保留触控板双指手势的平移能力
      // rAF 合帧：同一帧内多条 wheel 先累计，帧末一次性提交 viewport，避免整板多次重渲造成“放大闪跳”
      const b = wheelBuf.current;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        b.on = true; b.pan = true;
        b.accDx += e.deltaX;
      } else {
        b.on = true; b.pan = false;
        b.accFactor *= Math.exp(-e.deltaY * 0.002);
        b.ax = e.clientX; b.ay = e.clientY;
      }
      gestureOn();
      if (!wheelFrame.current) {
        wheelFrame.current = requestAnimationFrame(flushWheelBuf);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelFrame.current) cancelAnimationFrame(wheelFrame.current);
      clearTimeout(gestureT.current);
      document.body.classList.remove('cs-zooming');
    };
  }, []);

  // ---------- 悬浮工具面板自动收纳已取消（用户要求：打开后保持展开，不再 15 秒自动收起）----------
  // 面板展开/收起完全由用户通过「圆钮展开 / ▾ 折叠按钮」手动控制，点击画布空白处收纳保留。

  // ---------- 布局完成动画 ----------
  useEffect(() => {
    const off = busOn('layout-done', () => {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 700);
      return () => clearTimeout(t);
    });
    return off;
  }, []);

  // ---------- 指针辅助 ----------
  const attachDrag = useCallback((e: PointerEvent | React.PointerEvent) => {
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // 拖动期间(平移/拖卡/改尺寸)持续挂去闪标记，抑制光标扫过卡界引起的卡片 hover “浮起↔落下”闪跳
      if (d.type === 'pan' || d.type === 'cards' || d.type === 'resize') gestureOn();
      // 移动超过阈值：取消空白长按（避免长按菜单与拖动冲突）
      if (bgLongPress.current && (d.type === 'pan' || d.type === 'band' || d.type === 'none') &&
          (Math.abs(ev.clientX - d.startX) > 8 || Math.abs(ev.clientY - d.startY) > 8)) {
        clearBgLongPress();
      }
      const s = useStudio.getState();
      if (d.type === 'pan') {
        s.setViewport({ zoom: s.viewport.zoom, x: d.vx + (ev.clientX - d.startX), y: d.vy + (ev.clientY - d.startY) });
      } else if (d.type === 'band') {
        const rect = wrapRef.current?.getBoundingClientRect();
        const ox = rect?.left || 0;
        const oy = rect?.top || 0;
        const x = Math.min(d.startX, ev.clientX) - ox;
        const y = Math.min(d.startY, ev.clientY) - oy;
        const r = { x, y, w: Math.abs(ev.clientX - d.startX), h: Math.abs(ev.clientY - d.startY) };
        bandRectRef.current = r;
        setBandRect(r);
      } else if (d.type === 'cards') {
        const dx = (ev.clientX - d.startX) / s.viewport.zoom;
        const dy = (ev.clientY - d.startY) / s.viewport.zoom;
        const next: Record<string, Card> = {};
        for (const id of d.ids) {
          const o = d.origins[id];
          if (o) next[id] = { ...s.cards[id], x: o.x + dx, y: o.y + dy };
        }
        s.setCardsLocal(next);
      } else if (d.type === 'resize') {
        const dx = (ev.clientX - d.startX) / s.viewport.zoom;
        const dy = (ev.clientY - d.startY) / s.viewport.zoom;
        const o = d.orig;
        let { x, y, w, h } = o;
        const dir = d.dir;
        const resizing = s.cards[d.id];
        const ratio = paperRatio(resizing || { kind: 'note', mode: 'note', paper: 'a4' });
        const minW = 120;
        const minH = 80;
        if (dir.includes('e')) w = Math.max(minW, o.w + dx);
        if (dir.includes('s')) h = Math.max(minH, o.h + dy);
        if (dir.includes('w')) {
          w = Math.max(minW, o.w - dx);
          x = o.x + (o.w - w);
        }
        if (dir.includes('n')) {
          h = Math.max(minH, o.h - dy);
          y = o.y + (o.h - h);
        }
        if (ratio) {
          if (dir.includes('e') || dir.includes('w')) {
            h = w / ratio;
            if (h < minH) { h = minH; w = h * ratio; }
            if (dir.includes('n')) y = o.y + (o.h - h);
          } else {
            w = h * ratio;
            if (w < minW) { w = minW; h = w / ratio; }
            if (dir.includes('w')) x = o.x + (o.w - w);
          }
        }
        s.setCardsLocal({ [d.id]: { ...s.cards[d.id], x, y, w, h } });
      } else if (d.type === 'connect') {
        const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
        setTempEdge({ from: d.from, toX: w.x, toY: w.y, fromDir: d.dir });
        // 拖动中实时检测连线末端命中的卡片 → 目标卡高亮（松手即连到它）
        setConnectTargetId(pickConnectHit(Object.values(s.cards), d.from, w.x, w.y));
      } else if (d.type === 'branch') {
        const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
        setTempEdge({ from: d.edgeId, toX: w.x, toY: w.y });
        const bEdge = s.edges[d.edgeId];
        if (bEdge) setConnectTargetId(pickConnectHit(Object.values(s.cards), bEdge.from, w.x, w.y, bEdge.to));
      } else if (d.type === 'pen') {
        const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
        if (penStart.current) {
          const last = penStart.current.points[penStart.current.points.length - 1];
          const minDist = 2 / vpRef.current.zoom;
          if (!last || Math.hypot(w.x - last[0], w.y - last[1]) >= minDist) {
            penStart.current.points.push([w.x, w.y]);
            if (penStart.current.eraser && last) {
              // 橡皮：滑动过程中实时擦除（橡皮经过即消失，无需松手）
              if (liveEraseSegment(last, [w.x, w.y], penStart.current.width)) {
                erasedAnyRef.current = true;
              }
            }
            setPenPreview([...penStart.current.points]);
          }
        }
      } else if (d.type === 'zoomBox') {
        const rect = wrapRef.current?.getBoundingClientRect();
        const ox = rect?.left || 0;
        const oy = rect?.top || 0;
        const x = Math.min(d.startX, ev.clientX) - ox;
        const y = Math.min(d.startY, ev.clientY) - oy;
        const r = { x, y, w: Math.abs(ev.clientX - d.startX), h: Math.abs(ev.clientY - d.startY) };
        bandRectRef.current = r;
        setBandRect(r);
      }
    };
    const cancel = (ev: PointerEvent) => {
      up(ev);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const d = dragRef.current;
      // 是否属于「点击」（band 或 pan 且几乎未移动）——用于双击新建与取消长按
      const isTap = !!d && (d.type === 'band' || d.type === 'pan' || d.type === 'none') &&
        Math.abs(ev.clientX - d.startX) < 6 && Math.abs(ev.clientY - d.startY) < 6;
      if (d && d.type === 'pan' && Math.abs(ev.clientX - d.startX) < 5 && Math.abs(ev.clientY - d.startY) < 5) {
        // 点击空白（未拖动）：清除选择
        useStudio.getState().setSelection([]);
      }
      dragRef.current = null;
      const s = useStudio.getState();
      if (!d) return;
      if (d.type === 'none') {
        setBandRect(null);
        if (isTap) {
          s.setSelection([]);
          s.setSelection([], { edge: true });
        }
      } else if (d.type === 'band') {
        setBandRect(null);
        if (!bandRectRef.current) {
          // 点击空白（无拖动）：清除选择与连线选择
          s.setSelection([]);
          s.setSelection([], { edge: true });
        } else if (bandRectRef.current) {
          const r = bandRectRef.current;
          const rect = wrapRef.current?.getBoundingClientRect();
          const ox = rect?.left || 0;
          const oy = rect?.top || 0;
          const w0 = toWorldPoint(vpRef.current, wrapRef.current, r.x + ox, r.y + oy);
          const w1 = toWorldPoint(vpRef.current, wrapRef.current, r.x + r.w + ox, r.y + r.h + oy);
          const ids = Object.values(s.cards)
            .filter((c) => {
              if (s.sectionFilter !== 'all' && c.sectionId !== s.sectionFilter) return false;
              return c.x < w1.x && c.x + c.w > w0.x && c.y < w1.y && c.y + c.h > w0.y;
            })
            .sort((a, b) => b.z - a.z)
            .map((c) => c.id);
          if (ids.length) s.setSelection(ids);
          else if (r.w < 5 && r.h < 5) s.setSelection([]);
        }
        bandRectRef.current = null;
      } else if (d.type === 'cards') {
        // 结束拖拽：广播最终位置
        const patches: Record<string, Partial<Card>> = {};
        for (const id of d.ids) {
          const c = s.cards[id];
          if (c) patches[id] = { x: c.x, y: c.y };
        }
        s.emitCardPatches(patches);
      } else if (d.type === 'resize') {
        const c = s.cards[d.id];
        if (c) s.emitCardPatches({ [d.id]: { x: c.x, y: c.y, w: c.w, h: c.h } });
      } else if (d.type === 'connect') {
        const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
        const rawHit = pickConnectHit(Object.values(s.cards), d.from, w.x, w.y);
        if (rawHit) {
          // 只要一端落在某编组里，就把两端都提升到其各自所属的编组级再连线：
          // 从组内卡片拖起、或落点在组框/组内卡片上，均稳定建立“编组→编组”连线。
          const eff = (id: string): string => { const cc = s.cards[id]; return cc && cc.groupId ? cc.groupId : id; };
          const fromNode = eff(d.from);
          const toNode = eff(rawHit);
          if (fromNode !== toNode) {
            s.addEdge(fromNode, toNode);
            toast('已连线', 'ok');
          }
        }
        setTempEdge(null);
        setConnectTargetId(null);
      } else if (d.type === 'pen') {
        setPenPreview(null);
        const st = useStudio.getState();
        const raw = penStart.current;
        penStart.current = null;
        if (!raw) return;
        const pts = simplifyPoints(raw.points, 2 / st.viewport.zoom);
        if (raw.eraser) {
          // 橡皮：擦除已在滑动过程中实时完成；松手时合并为一次撤销步骤
          if (erasedAnyRef.current) {
            st.pushHistory();
            toast('已擦除标注', 'ok');
          }
        } else if (pts.length >= 1) {
          const a: Annotation = {
            id: uid('ann'),
            points: pts,
            color: raw.color,
            width: raw.width,
            createdAt: Date.now(),
          };
          st.addAnnotation(a);
          st.pushHistory();
          toast('已添加画笔标注（用 🧽 橡皮擦可擦除）', 'ok');
        }
      } else if (d.type === 'zoomBox') {
        setBandRect(null);
        // 点击（无移动）时 bandRectRef 为空：用按下点作为点击位置
        const r = bandRectRef.current || { x: d.startX, y: d.startY, w: 0, h: 0 };
        bandRectRef.current = null;
        if (r) {
          const rect = wrapRef.current?.getBoundingClientRect();
          const ox = rect?.left || 0;
          const oy = rect?.top || 0;
          if (r.w < 12 && r.h < 12) {
            // 点击：以点击点为锚放大（用户明确指定位置，不锚定选中对象）
            zoomAtAnchor(1.6, r.x + ox + r.w / 2, r.y + oy + r.h / 2, { preferSelection: false });
          } else if (r.w > 20 && r.h > 20) {
            // 框选放大：将框区域放大到视口
            const w0 = toWorldPoint(vpRef.current, wrapRef.current, r.x + ox, r.y + oy);
            const w1 = toWorldPoint(vpRef.current, wrapRef.current, r.x + r.w + ox, r.y + r.h + oy);
            const cur = vpRef.current;
            const zoom = clamp((window.innerWidth - 60) / Math.max(40, Math.abs(w1.x - w0.x)), 0.2, 3);
            useStudio.getState().setViewport({
              zoom,
              x: (window.innerWidth - 60) / 2 / zoom - (w0.x + w1.x) / 2,
              y: (window.innerHeight - 60) / 2 / zoom - (w0.y + w1.y) / 2,
            });
          }
        }
      } else if (d.type === 'branch') {
        const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
        setTempEdge(null);
        setConnectTargetId(null);
        const edge = s.edges[d.edgeId];
        if (edge) {
          const hit = Object.values(s.cards)
            .filter((c) => (c.id !== edge.from && c.id !== edge.to) && w.x >= c.x && w.x <= c.x + c.w && w.y >= c.y && w.y <= c.y + c.h)
            .sort((a, b) => b.z - a.z)[0];
          if (hit) {
            // 拖到已有卡片：原线重连为新卡两端
            s.deleteEdges([edge.id]);
            s.addEdge(edge.from, hit.id);
            s.addEdge(hit.id, edge.to);
            toast('已重连到 ' + (hit.title || '该卡片'), 'ok');
          } else {
            // 空白处：弹出分支创建菜单
            setBranchMenu({ x: ev.clientX, y: ev.clientY, world: w, edge });
          }
        }
      }
      // 触屏点击空白：双击 → 新建便签（band 与 pan 点击统一检测；默认移动工具也生效）
      if (isTap && ev.pointerType === 'touch') {
        const now = Date.now();
        const prev = lastTapRef.current;
        if (prev && now - prev.t < 350 && Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) < 12) {
          // 长按空白刚弹出菜单后 / 菜单刚关闭后，紧接着的触屏双击不应再新建卡片
          const suppressAfterLongPress = now - bgLongPressFiredAt.current < 800 || now - menuOpenedAt.current < 500;
          lastTapRef.current = null;
          clearBgLongPress(); // 双击视为非长按
          if (!suppressAfterLongPress) {
            const stt = useStudio.getState();
            if (!stt.globalLock && now - stt.lastEditExit >= 1200) {
              const w = toWorldPoint(vpRef.current, wrapRef.current, ev.clientX, ev.clientY);
              const sectionId = stt.sectionFilter !== 'all' ? stt.sectionFilter : '';
              const id = stt.addCard({ x: w.x - 130, y: w.y - 90, sectionId }, { op: true });
              stt.setSelection([id]);
              lastTouchCreate.current = now;
              ensureCardInView(id);
              toast('已新建便签卡', 'ok');
            }
          }
        } else {
          lastTapRef.current = { x: ev.clientX, y: ev.clientY, t: now };
        }
      } else if (ev.pointerType !== 'touch') {
        if (isTap) {
          const now = Date.now();
          const prev = lastTapRef.current;
          if (!prev || now - prev.t >= 450 || Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) >= 32) {
            lastTapRef.current = { x: ev.clientX, y: ev.clientY, t: now };
          }
        } else {
          lastTapRef.current = null;
        }
      }
      pointers.current.delete(ev.pointerId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    // toWorldPoint 为模块级纯函数（稳定），无需列入依赖
  }, []);

  const bandRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // ---------- 背景指针 ----------
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      if ((window as unknown as { __dbg?: boolean }).__dbg) console.log('[bg] pan via space/middle');
      e.preventDefault();
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      attachDrag(e);
      return;
    }
    if (e.button !== 0) return;
    if (pointers.current.size >= 2) return;
    // 输入法/键盘优化：点击画布空白处收起软键盘
    if (document.activeElement instanceof HTMLElement &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.getAttribute('contenteditable') === 'true')) {
      document.activeElement.blur();
    }
    // 触屏空白长按：弹出空白新建菜单（新建便签卡 / 图片卡 / 插入模板 等选项）
    if (e.pointerType === 'touch' && tool !== 'pen') {
      clearBgLongPress();
      const x = e.clientX;
      const y = e.clientY;
      bgLongPress.current = window.setTimeout(() => {
        bgLongPress.current = null;
        bgLongPressFiredAt.current = Date.now();
        menuOpenedAt.current = Date.now();
        try { navigator.vibrate?.(24); } catch { /* 不支持振动时忽略 */ }
        // 弹空白菜单（新建便签卡 / 图片卡 / 插入模板 / 粘贴 等）；浏览器随后派发的 contextmenu 会被 onContextMenu 抑制，避免双菜单
        onCtxMenu({ clientX: x, clientY: y } as React.MouseEvent);
      }, 450);
    }
    if (tool === 'pen') {
      // 画笔工具：拖动绘制 / 橡皮擦除
      e.preventDefault();
      const w = toWorldPoint(vpRef.current, wrapRef.current, e.clientX, e.clientY);
      penStart.current = { color: penColor, width: penEraser ? eraserWidth : penWidth, eraser: penEraser, points: [[w.x, w.y]] };
      erasedAnyRef.current = false;
      dragRef.current = { type: 'pen', annId: '' };
      attachDrag(e);
      return;
    }
    // 移动工具：若点击落在某编组包围框内（未命中卡片），选中该编组整体，便于拖动/显示调节控件
    if (tool === 'move' && e.button === 0) {
      const wpt = toWorldPoint(vpRef.current, wrapRef.current, e.clientX, e.clientY);
      const st = useStudio.getState();
      const hitGid = (() => {
        for (const gid of Object.keys(st.groups)) {
          const g = st.groups[gid];
          if (g.writingOnly) continue;
          const list = Object.values(st.cards).filter((c) => !c.writingOnly && c.groupId === gid);
          if (list.length < 2) continue;
          const minX = Math.min(...list.map((c) => c.x)) - 14;
          const minY = Math.min(...list.map((c) => c.y)) - 14;
          const maxX = Math.max(...list.map((c) => c.x + c.w)) + 14;
          const maxY = Math.max(...list.map((c) => c.y + c.h)) + 14;
          if (wpt.x >= minX && wpt.x <= maxX && wpt.y >= minY && wpt.y <= maxY) return gid;
        }
        return null;
      })();
      if (hitGid) {
        st.selectGroup(hitGid);
        return;
      }
    }
    if (tool === 'move') {
      if ((window as unknown as { __dbg?: boolean }).__dbg) console.log('[bg] pan via move-tool');
      // 移动工具：左键拖动画布
      e.preventDefault();
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      attachDrag(e);
      return;
    }
    if (tool === 'edit') {
      // “选择”工具：点选/双击写作，拖空白可平移画布
      e.preventDefault();
      dragRef.current = { type: 'pan', startX: e.clientX, startY: e.clientY, vx: vpRef.current.x, vy: vpRef.current.y };
      attachDrag(e);
      return;
    }
    dragRef.current = { type: 'band', startX: e.clientX, startY: e.clientY };
    if ((window as unknown as { __dbg?: boolean }).__dbg) console.log('[bg] band start', e.clientX, e.clientY, 'space:', spaceRef.current, 'tool:', tool);
    attachDrag(e);
  };

  // 卡片拖拽
  // 整卡统一拖拽：按下时记录起点，移动超过阈值后正式进入拖拽
  const pendingDrag = useRef<{ id: string; x: number; y: number } | null>(null);

  const attachPendingDrag = useCallback(() => {
    const move = (ev: PointerEvent) => {
      const p = pendingDrag.current;
      if (!p) return;
      if ((ev.clientX - p.x) * (ev.clientX - p.x) + (ev.clientY - p.y) * (ev.clientY - p.y) < 25) return;
      pendingDrag.current = null;
      const s = useStudio.getState();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      let ids = s.selection.includes(p.id) ? s.selection : [p.id];
      if (!s.selection.includes(p.id)) s.setSelection(ids);
      // 浏览(排版只读, card.preview=true/文档)与锁定卡不可拖动；选中仍可，仅过滤掉移动
      ids = ids.filter((id) => { const c = s.cards[id]; return !!(c && !c.locked && !c.preview); });
      if (!ids.length) return;
      // 直接移动组内单张卡片（不带动整个编组）
      s.bringToFront(p.id);
      const origins: Record<string, { x: number; y: number }> = {};
      for (const i of ids) {
        const c = s.cards[i];
        if (c) origins[i] = { x: c.x, y: c.y };
      }
      dragRef.current = { type: 'cards', ids, startX: p.x, startY: p.y, origins };
      attachDrag(ev);
    };
    const up = () => {
      pendingDrag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => {
      up();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }, [attachDrag]);

  const onCardResizeStart = (e: React.PointerEvent, id: string, dir: string) => {
    const s = useStudio.getState();
    const c = s.cards[id];
    if (!c) return;
    dragRef.current = { type: 'resize', id, dir, startX: e.clientX, startY: e.clientY, orig: { x: c.x, y: c.y, w: c.w, h: c.h } };
    attachDrag(e);
  };

  // 移动工具下：按住编组框内“空白”（非卡片）也能像拖卡片一样整体拖动整组；
  // 点按(不拖动)只选中该组（显示外框用于连线）；不再把空白落成“长按弹空白菜单”。
  const pickGroupFrameDown = (e: React.PointerEvent, gid: string) => {
    if (e.button !== 0) return;
    const st = useStudio.getState();
    if (st.globalLock || spaceRef.current) return;
    if (st.tool !== 'move') return;
    if (multiSelectRef.current) return;
    if (pointers.current.size >= 2) return;
    e.preventDefault();
    e.stopPropagation();
    clearBgLongPress?.();
    const sx = e.clientX, sy = e.clientY;
    const st2 = useStudio.getState();
    const draggable = Object.values(st2.cards)
      .filter((c) => !c.writingOnly && c.groupId === gid && !c.locked && !c.preview)
      .map((c) => c.id);
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of draggable) { const cc = st2.cards[id]; if (cc) origins[id] = { x: cc.x, y: cc.y }; }
    // 点按即选中该编组（selectedGroupId），立即显示组外框 + 4 个连线锚点，便于继续拉线
    st2.selectGroup(gid);
    if (!draggable.length) { e.stopPropagation(); return; }
    let started = false;
    const detach = () => {
      window.removeEventListener('pointermove', onmv);
      window.removeEventListener('pointerup', onup);
      window.removeEventListener('pointercancel', onup);
    };
    const onmv = (mv: PointerEvent) => {
      if (started) return;
      if (Math.hypot(mv.clientX - sx, mv.clientY - sy) < 6) return;
      started = true;
      detach();
      dragRef.current = { type: 'cards', ids: draggable, startX: sx, startY: sy, origins };
      attachDrag(mv);
    };
    const onup = () => { detach(); };
    window.addEventListener('pointermove', onmv);
    window.addEventListener('pointerup', onup);
    window.addEventListener('pointercancel', onup);
  };

  const onConnectStart = (e: React.PointerEvent, id: string, dir = 'e') => {
    const s = useStudio.getState();
    let c = s.cards[id];
    // 编组也作为可连线节点：从编组整体拖线
    if (!c && s.groups[id]) {
      const box = groupBoxes[id];
      if (box) c = { id, x: box.x, y: box.y, w: box.w, h: box.h, groupId: id } as Card;
    }
    if (!c) return;
    const mid = anchorPoint(c, dir);
    dragRef.current = { type: 'connect', from: id, dir };
    setTempEdge({ from: id, toX: mid.x, toY: mid.y, fromDir: dir });
    attachDrag(e);
  };

  /** 缩放：优先以选中对象（卡片/连线）中心为锚点；sx/sy 为客户端坐标。preferSelection=false 时尊重传入的锚点 */
  const zoomAtAnchor = (factor: number, sx?: number, sy?: number, opts?: { preferSelection?: boolean }) => {
    if (zoomLockedRef.current) return;
    const st = useStudio.getState();
    const { ox, oy, cx, cy } = computeZoomAnchor(st, wrapRef.current, { sx, sy, preferSelection: opts?.preferSelection !== false });
    // 锚点需换算为「相对画布内容区原点」的坐标，与 viewport.x/y 同一坐标系
    st.zoomBy(factor, cx - ox, cy - oy);
  };

  /** 从连线中段拖出分支节点 */
  const onBranchStart = (e: React.PointerEvent, edge: Edge) => {
    const st = useStudio.getState();
    let from = st.cards[edge.from];
    let to = st.cards[edge.to];
    if (!from && st.groups[edge.from]) { const gb = groupBoxes[edge.from]; if (gb) from = { id: edge.from, x: gb.x, y: gb.y, w: gb.w, h: gb.h, groupId: edge.from } as Card; }
    if (!to && st.groups[edge.to]) { const gb = groupBoxes[edge.to]; if (gb) to = { id: edge.to, x: gb.x, y: gb.y, w: gb.w, h: gb.h, groupId: edge.to } as Card; }
    if (!from || !to) return;
    const geo = edgeGeometry(edge, from, to);
    dragRef.current = { type: 'branch', edgeId: edge.id };
    setTempEdge({ from: edge.id, toX: geo.mid.x, toY: geo.mid.y, branch: true });
    attachDrag(e);
  };

  const onCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button === 2) return;
    if (useStudio.getState().globalLock) return;
    const s = useStudio.getState();
    // 触屏多选模式：轻点 = 加入/移出选择，不进入拖拽
    if (multiSelectRef.current) {
      if (e.button === 0) s.toggleSelect(id);
      return;
    }
    // 输入法优化：点击卡片非输入区域时收起软键盘（避免键盘不适宜地弹出）
    const t = e.target as HTMLElement;
    if (document.activeElement instanceof HTMLElement && !t.closest('input, textarea, [contenteditable="true"]') &&
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' ||
         document.activeElement.getAttribute('contenteditable') === 'true')) {
      document.activeElement.blur();
    }
    const card = s.cards[id];
    if (s.tool === 'move' && !e.shiftKey && card?.groupId) {
      // 移动模式下点击编组内卡片 = 选中整个编组，便于整体拖动/定位
      const gid = card.groupId;
      const groupIds = Object.values(s.cards).filter((c) => c.groupId === gid).map((c) => c.id);
      s.setSelection(groupIds);
    } else if (e.shiftKey) s.toggleSelect(id);
    else if (!s.selection.includes(id)) s.setSelection([id]);
    // 记录潜在拖拽起点（锁定卡不可拖）
    if (e.button !== 0 || s.cards[id]?.locked) return;
    pendingDrag.current = { id, x: e.clientX, y: e.clientY };
    attachPendingDrag();
  };

  const onDoubleClickBg = (e: React.MouseEvent) => {
    const st = useStudio.getState();
    // 触屏上已通过手动双击检测创建（touch-action:none 下不派发 dblclick），避免重复
    if (Date.now() - lastTouchCreate.current < 2000) return;
    // 长按空白刚弹出菜单后 / 菜单刚关闭后，紧接着的一次“双击”不应再新建卡片，避免手势冲突
    if (Date.now() - bgLongPressFiredAt.current < 800 || Date.now() - menuOpenedAt.current < 500) return;
    // 刚退出编辑后防误触
    if (Date.now() - st.lastEditExit < 1800 && navigator.maxTouchPoints > 0) return;
    // 桌面端也要求两次点击足够近、足够快，避免误触
    // 仅当「确有上一次点击」且其与本次双击距离/时间不合理时才拒绝；
    // 首次进入时 lastTapRef 尚未建立（浏览器原生 dblclick 本身已判定为双击），应放行，避免「一开始双击无效、要多次才生效」。
    const prevTap = lastTapRef.current;
    if (prevTap && (Date.now() - prevTap.t >= 450 || Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) >= 12)) {
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = null;
    if (st.globalLock) return;
    const w = toWorldPoint(vpRef.current, wrapRef.current, e.clientX, e.clientY);
    const sectionId = useStudio.getState().sectionFilter !== 'all' ? useStudio.getState().sectionFilter : '';
    const id = useStudio.getState().addCard({ x: w.x - 130, y: w.y - 90, sectionId }, { op: true });
    useStudio.getState().setSelection([id]);
    lastTouchCreate.current = Date.now();
    ensureCardInView(id);
  };

  const onDoubleClickCard = (id: string) => {
    const s = useStudio.getState();
    if (s.globalLock) return;
    // 双击空白新建卡片后，浏览器 dblclick 会落到新卡片上：抑制误入全屏编辑
    if (Date.now() - lastTouchCreate.current < 600) return;
      // 长按/右键刚弹出卡片菜单后，紧接着的“双击”不应再进入编辑，避免手势冲突
      if (Date.now() - lastCardCtxAt.current < 800 && lastCardCtxId.current === id) return;
    // 多选模式下双击：退出多选并进入全屏编辑
    setMultiSelect(false);
    // 双击卡片统一进入类 Word 的全屏编辑界面
    s.setFullscreenCard(id);
    s.setSelection([id]);
  };

  // ---------- 右键菜单 ----------
  const onCtxMenu = (e: React.MouseEvent, card?: Card) => {
    setCtx(null);
    setCtxSec(false);
    const sx = e.clientX;
    const sy = e.clientY;
    const s = useStudio.getState();
    const w = toWorldPoint(vpRef.current, wrapRef.current, sx, sy);
    const items: CtxItem[] = [];
    if (card) {
        lastCardCtxAt.current = Date.now();
        lastCardCtxId.current = card.id;
      // 触屏多选模式下：右键/长按某张已选卡不应清空整批（否则“编组所选/整批复制/删除”会用不了），
      // 只当作“再补一张”的入口；仅非多选时把当前长按卡设为受控对象供常规操作。
      if (multiSelectRef.current) {
        if (!s.selection.includes(card.id)) s.toggleSelect(card.id);
      } else if (!s.selection.includes(card.id)) s.setSelection([card.id]);
      items.push(
        { label: <><ClipboardIcon size={14} /> 复制卡片</>, fn: () => s.duplicateCards(s.selection) },
        { label: card.kind === 'image' ? <><ImageIcon size={14} /> 编辑图片面（反面）</> : <><BrushIcon size={14} /> 编辑文字面（正面）</>, fn: () => s.setFullscreenCard(card.id) },
        { label: <><FolderIcon size={14} /> 移动到分区</>, fn: () => { setCtxSec(true); } },
        { label: <><SelectIcon size={14} /> 多选</>, fn: () => { setCtx(null); setMultiSelect(true); } },
        { label: <><PuzzleIcon size={14} /> 插入模板…</>, fn: () => { setCtx(null); setMultiSelect(false); setTplMenu({ x: sx, y: sy, world: w }); } },
        { label: card.locked ? <><UnlockIcon size={14} /> 解锁</> : <><LockColorIcon size={14} /> 锁定</>, fn: () => s.updateCard(card.id, { locked: !card.locked }) },
        { label: <><StarColorIcon size={14} /> 存为模板</>, fn: () => saveCardAsTemplate(card) },
        { label: <><BookIcon size={14} /> 收藏为灵感文库</>, fn: () => saveCardAsInspiration(card) },
        { label: <><TrashColorIcon size={14} /> 删除</>, danger: true, fn: () => s.deleteCards(s.selection) },
      );
      if (s.selection.length > 1) {
        items.unshift({ label: <><GroupIcon size={14} /> 编组所选卡片</>, fn: () => s.createGroup(s.selection) });
      }
      menuOpenedAt.current = Date.now();
      setCtx({ x: sx, y: sy, cardId: card.id, items });
      return;
    }
    items.push(
      { label: <><NoteIcon size={14} /> 新建便签卡</>, fn: () => {
        const id = s.addCard({ x: w.x - 130, y: w.y - 90 });
        s.setSelection([id]);
        ensureCardInView(id);
      } },
      { label: <><PuzzleIcon size={14} /> 插入模板…</>, fn: () => { setCtx(null); setTplMenu({ x: sx, y: sy, world: w }); } },
      { label: <><ImportIcon size={14} /> 粘贴</>, fn: () => s.pasteClipboard() },
      { label: '全选', fn: () => s.setSelection(Object.keys(s.cards)) },
      { label: <><FitViewIcon size={14} /> 适配视图</>, fn: () => s.fitView() },
    );
    menuOpenedAt.current = Date.now();
    setCtx({ x: sx, y: sy, cardId: undefined, items });
  };

  // ---------- 存在感（协同光标）----------
  // 桌面鼠标高频移动合帧：一帧内首事件立即处理，其余保留最新在帧尾处理（触屏直通）
  const pmGate = { pending: null as React.PointerEvent | null, raf: 0, raw: null as ((e: React.PointerEvent) => void) | null };
  useEffect(() => {
    const flush = () => {
      const g = pmGate;
      if (g.raf) {
        cancelAnimationFrame(g.raf);
        g.raf = 0;
        const p = g.pending;
        g.pending = null;
        if (p && g.raw) g.raw(p);
      }
    };
    window.addEventListener('pointerup', flush, true);
    return () => window.removeEventListener('pointerup', flush, true);
  }, []);
  const onCanvasPointerMoveRaw = (e: React.PointerEvent) => {
    const now = Date.now();
    if (now - lastPresence.current > 120) {
      lastPresence.current = now;
      const w = toWorldPoint(vpRef.current, wrapRef.current, e.clientX, e.clientY);
      publishPresence({ px: w.x, py: w.y });
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if ((window as unknown as { __dbg?: boolean }).__dbg) console.log('[pm]', e.pointerType, e.pointerId, 'size', pointers.current.size, 'type', dragRef.current?.type);
    // 双指：捏合缩放 + 双指平移画布（触屏）
    if (pointers.current.size === 2) {
      // 双指开始捏合时，取消所有长按，避免缩放过程中弹出菜单
      clearBgLongPress();
      busEmit('cancel-long-press');
      const pts = [...pointers.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      if (!pinchRef.current) {
        pinchRef.current = { dist: d, midX, midY };
      } else {
        const prev = pinchRef.current;
        const factor = d / prev.dist;
        const dx = midX - prev.midX;
        const dy = midY - prev.midY;
        gestureOn(); // 触控捏合期间持续去闪，抑制卡片 hover/3D 层闪跳
        if ((window as unknown as { __dbg?: boolean }).__dbg) console.log('[pinch] d', d, 'factor', factor, 'dx', dx, 'dy', dy);
        // 锚点换算为相对画布内容区原点的坐标（与 viewport.x/y 同坐标系），否则捏合会漂移
        const vp0 = useStudio.getState().viewport;
        const scaling = !zoomLocked && Math.abs(factor - 1) > 0.004;
        if (scaling) {
          // 一次性计算新缩放+位移。锚点优先「选中物件（卡片/连线）中心」——
          // 有选中时以选中物为中心缩放（符合“缩放我选中的东西”的直觉）；
          // 未选中任何物件时，回退到双指中点，避免缩放时画面漂移。
          // dx/dy 保留双指平移增量，捏合与平移可同时生效。
          const vp0b = useStudio.getState();
          const anchor = computeZoomAnchor(vp0b, wrapRef.current, { sx: midX, sy: midY, preferSelection: true });
          const zoom = clamp(vp0.zoom * factor, 0.2, 3);
          const ax = anchor.cx - anchor.ox; // 锚点（相对画布内容区原点）
          const ay = anchor.cy - anchor.oy;
          const wx = (ax - vp0.x) / vp0.zoom; // 锚点对应的世界坐标
          const wy = (ay - vp0.y) / vp0.zoom;
          const nx = ax - wx * zoom + dx;
          const ny = ay - wy * zoom + dy;
          useStudio.getState().setViewport({ zoom, x: nx, y: ny });
        } else {
          const nvp = useStudio.getState().viewport;
          useStudio.getState().setViewport({ ...nvp, x: nvp.x + dx, y: nvp.y + dy });
        }
        pinchRef.current = { dist: d, midX, midY };
      }
      // 双指操作时停止单指平移
      if (dragRef.current?.type === 'pan') dragRef.current = null;
      return;
    }
    pinchRef.current = null;
  };
  pmGate.raw = onCanvasPointerMoveRaw;
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') { onCanvasPointerMoveRaw(e); return; }
    pmGate.pending = e;
    if (pmGate.raf) return;
    onCanvasPointerMoveRaw(e);
    pmGate.raf = requestAnimationFrame(() => {
      pmGate.raf = 0;
      const p = pmGate.pending;
      pmGate.pending = null;
      if (p) onCanvasPointerMoveRaw(p);
    });
  };
  const onPointerUpLocal = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (e.pointerType === 'touch') clearBgLongPress();
  };
  const onPointerCancelLocal = (e: React.PointerEvent) => {
    // 长按会被浏览器以 pointercancel 打断：这里只清理指针，不取消长按定时器
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  };

  // ---------- 可见裁剪 ----------
  // 选中连线的目标卡片集合（链接目标选中效果）
  const edgeTargetIds = useMemo(() => {
    const set = new Set<string>();
    for (const eid of edgeSelection) {
      const e = edges[eid];
      if (e) set.add(e.to);
    }
    return set;
  }, [edgeSelection, edges]);

  const visibleIds = useMemo(() => {
    const margin = 400;
    const rect = wrapRef.current?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;
    const x0 = -vp.x / vp.zoom - margin;
    const y0 = -vp.y / vp.zoom - margin;
    const x1 = (w - vp.x) / vp.zoom + margin;
    const y1 = (h - vp.y) / vp.zoom + margin;
    return cardList
      .filter((c) => {
        if (sectionFilter !== 'all' && c.sectionId !== sectionFilter && !selectionSet.has(c.id)) return false;
        // 选中的卡片始终保留在渲染中，避免缩放/重命名时“消失”
        if (selectionSet.has(c.id)) return true;
        return c.x + c.w > x0 && c.x < x1 && c.y + c.h > y0 && c.y < y1;
      })
      .sort((a, b) => a.z - b.z)
      .map((c) => c.id);
  }, [cardList, vp, sectionFilter, selectionSet]);
    visibleIdsRef.current = visibleIds;

  // ---- 画布父子枝整枝收纳：由 kind==='parent' 且 from=父->to=子 的有向边构成有向森林 ----
  // 节点 = 卡片 id 或 编组 id（编组视为一个“大节点”：连成的线同样能表达父子层级）。
  // 编组成员卡是所属编组的“内容”，收纳某编组节点时其整帧+全部成员卡（+后代编组）一并收纳。
  const isNodeId = (id: string) => !!cards[id] || !!groups[id];
  // gid -> 直属成员卡 id 列表（不跨组）
  const memberOf = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of Object.values(cards)) {
      if (c.groupId && !c.writingOnly) (m[c.groupId] ||= []).push(c.id);
    }
    return m;
  }, [cards]);
  const foldKids = useMemo(() => {
    const adj: Record<string, string[]> = {};
    for (const e of Object.values(edges)) {
      if (e.kind === 'parent' && e.from && e.to && e.from !== e.to && isNodeId(e.from) && isNodeId(e.to)) {
        (adj[e.from] ||= []).push(e.to);
      }
    }
    return adj;
  }, [cards, groups, edges]);
  const foldDesc = useMemo(() => {
    const cache: Record<string, string[]> = {};
    function descend(n: string): string[] {
      const res: string[] = [];
      const visit = new Set<string>([n]);
      const stack = [n];
      while (stack.length) {
        const x = stack.pop() as string;
        for (const k of foldKids[x] || []) {
          if (!visit.has(k)) { visit.add(k); res.push(k); stack.push(k); }
        }
      }
      if (res.length) cache[n] = res;
      return res;
    }
    for (const p of Object.keys(foldKids)) descend(p);
    return cache;
  }, [foldKids]);
  const hiddenByFold = useMemo<Set<string>>(() => {
    // 被整枝收纳而下层隐藏的“节点”（既是卡也可能是编组）
    const h = new Set<string>();
    for (const [p, f] of Object.entries(folded)) {
      if (f) for (const d of foldDesc[p] || []) h.add(d);
    }
    return h;
  }, [folded, foldDesc]);
  // 把“整组收纳”展开到真正不参与渲染的卡片/编组帧：
  //  - 被收纳的卡片本身不下；（其父若在 hiddenByFold 已含）
  //  - 被收纳的编组：帧不渲染，且其直属成员卡整支收纳（成员卡自身还有子枝亦一并追踪）；
  //  - 后代编组经 foldDesc 递归覆盖。
  const foldHidden = useMemo(() => {
    const hideCards = new Set<string>();
    const hideGroups = new Set<string>();
    const stack = [...hiddenByFold];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      if (cards[id]) {
        hideCards.add(id);
        for (const d of foldDesc[id] || []) stack.push(d);
      } else if (groups[id]) {
        hideGroups.add(id);
        for (const cid of memberOf[id] || []) stack.push(cid);
        for (const d of foldDesc[id] || []) stack.push(d);
      }
    }
    return { hideCards, hideGroups };
  }, [hiddenByFold, foldDesc, cards, groups, memberOf]);
  // 渲染时可见的卡片（跳过被折起隐藏的子树卡片，但自身仍保有折叠钮可再展开）
  const renderVisibleIds = useMemo(
    () => visibleIds.filter((id) => !foldHidden.hideCards.has(id)),
    [visibleIds, foldHidden],
  );
  // 渲染时可见的连线：任一端点（卡/编组）被收纳即不绘制
  const visibleEdgesRender = useMemo(
    () => Object.values(edges).filter(
      (e) =>
        !(e.from && (foldHidden.hideCards.has(e.from) || foldHidden.hideGroups.has(e.from))) &&
        !(e.to && (foldHidden.hideCards.has(e.to) || foldHidden.hideGroups.has(e.to))),
    ),
    [edges, foldHidden],
  );
  // 有可折叠子树的父节点（折叠钮受众）：既有卡片也有编组
  const foldableParents = useMemo(
    () => Object.keys(foldDesc).filter((id) => !hiddenByFold.has(id)),
    [foldDesc, hiddenByFold],
  );

  const gridSize = 24 * vp.zoom;

  // 编组包围框
  const groupBoxes = useMemo(() => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const g of Object.values(groups)) {
      if (g.writingOnly) continue;
      const list = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === g.id);
      if (list.length < 2) continue;
      const minX = Math.min(...list.map((c) => c.x)) - 14;
      const minY = Math.min(...list.map((c) => c.y)) - 14;
      const maxX = Math.max(...list.map((c) => c.x + c.w)) + 14;
      const maxY = Math.max(...list.map((c) => c.y + c.h)) + 14;
      boxes[g.id] = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    return boxes;
  }, [groups, cards]);

  // 节点解析：卡片 id 或编组 id → 几何盒（供连线几何计算，编组作为整体节点）
  const nodeBox = (nid: string): Card | null => {
    if (cards[nid]) return cards[nid];
    const gb = groupBoxes[nid];
    if (gb) return { id: nid, x: gb.x, y: gb.y, w: gb.w, h: gb.h, groupId: nid } as Card;
    return null;
  };

  // 若 selection 覆盖了某个编组的全部卡片，则视作选中了该编组整体（“一张大卡片”）
  // 此时隐藏组内各卡片的选中锚点，并让该编组外框显示选中态；
  // 若仅选中编组内部分卡片（如单张），仍视为单选卡片，显示该卡的控件（缩放/连线锚点）
  const selGroupId = useMemo(() => {
    const gids = new Set<string>();
    for (const id of selection) {
      const cid = cards[id];
      if (!cid || !cid.groupId) return null;
      gids.add(cid.groupId);
    }
    if (gids.size !== 1) return null;
    const gid = [...gids][0];
    const groupCardIds = Object.values(cards).filter((c) => c.groupId === gid).map((c) => c.id);
    const selectedGroupCount = selection.filter((id) => cards[id]?.groupId === gid).length;
    // 仅当选中了该编组的全部卡片时，才视作选中整组
    return groupCardIds.length > 0 && selectedGroupCount === groupCardIds.length ? gid : null;
  }, [selection, cards]);

  // 组右键菜单
  const [groupCtx, setGroupCtx] = useState<{ x: number; y: number; gid: string } | null>(null);

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onPointerDown={onBgPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onPointerUpLocal}
      onPointerCancel={onPointerCancelLocal}
      onContextMenu={(e) => {
        e.preventDefault();
        const t = e.target as HTMLElement;
        // 空白长按（挂起中或刚触发）时，抑制浏览器 contextmenu 再弹一级菜单（无论目标是空白还是刚新建的卡片），避免长按新建后又弹卡片菜单
        if (bgLongPress.current !== null || Date.now() - bgLongPressFiredAt.current < 800) return;
        onCtxMenu(e);
      }}
      onDoubleClick={(e) => {
        const t = e.target as HTMLElement;
        if (!t.closest('.card') && !t.closest('button') && !t.closest('input') && !t.closest('.minimap') && !t.closest('.zoom-ctrl')) onDoubleClickBg(e);
      }}
      style={{ cursor: spaceRef.current ? 'grab' : undefined }}
    >
      <div
        className="canvas-grid"
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${Math.round(vp.x * vp.zoom)}px ${Math.round(vp.y * vp.zoom)}px`,
        }}
      />
      <EdgesLayer
        edges={visibleEdgesRender}
        cards={cards}
        groups={groups}
        selected={edgeSelection}
        sectionFilter={sectionFilter}
        cardSelection={selection}
        vp={vp}
        onSelectEdge={(id) => useStudio.getState().setSelection([id], { edge: true })}
        onBranchStart={onBranchStart}
        onLeftMenu={(e) => {
          const edge = Object.values(edges).find((x) => x.id === (e as unknown as { edgeId?: string }).edgeId) || null;
          const w = toWorldPoint(vpRef.current, wrapRef.current, e.clientX, e.clientY);
          if (edge) setBranchMenu({ x: e.clientX, y: e.clientY, world: w, edge });
          else setBranchMenu({ x: e.clientX, y: e.clientY, world: w, edge: null });
        }}
        onEdgeContextMenu={(e, edge) => {
          setCtx(null);
          setEdgeCtx({ x: e.clientX, y: e.clientY, edge });
          useStudio.getState().setSelection([edge.id], { edge: true });
        }}
      />

      <div
        className="canvas-cards"
        style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, transformOrigin: '0 0', ['--inv-zoom' as string]: String(1 / vp.zoom) }}
      >
        {Object.entries(groupBoxes).filter(([gid]) => !foldHidden.hideGroups.has(gid)).map(([gid, b]) => (
          <div
            key={gid}
            className={`group-frame ${selectedGroupId === gid || selGroupId === gid ? 'active' : ''} ${connectTargetId === gid ? 'connect-hit' : ''}`}
            style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderColor: groups[gid]?.color || '#00b894', background: (groups[gid]?.color || '#00b894') + (selectedGroupId === gid || selGroupId === gid ? '2a' : '14'), ['--group-accent' as string]: groups[gid]?.color || '#00b894', pointerEvents: (tool === 'move' ? 'auto' : undefined) as React.CSSProperties['pointerEvents'] }}
            onPointerDown={(e) => pickGroupFrameDown(e, gid)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCtx(null);
              setEdgeCtx(null);
              setGroupCtx({ x: e.clientX, y: e.clientY, gid });
            }}
          >
            <span
              className="group-name"
              style={{ background: groups[gid]?.color || '#00b894', top: `max(calc(-26px * var(--inv-zoom, 1)), -120px)`, transform: 'scale(var(--inv-zoom, 1))', transformOrigin: 'center' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                useStudio.getState().selectGroup(gid);
                // 触屏长按编组名：弹出编组选项（同右键）
                if (e.pointerType === 'touch') {
                  const x = e.clientX;
                  const y = e.clientY;
                  const t = window.setTimeout(() => {
                    setCtx(null); setEdgeCtx(null); setGroupCtx({ x, y, gid });
                  }, 550);
                  const detach = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    window.removeEventListener('pointercancel', up);
                  };
                  const move = (ev: PointerEvent) => {
                    if (Math.abs(ev.clientX - x) > 12 || Math.abs(ev.clientY - y) > 12) { window.clearTimeout(t); detach(); }
                  };
                  const up = () => { window.clearTimeout(t); detach(); };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                  window.addEventListener('pointercancel', up);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtx(null);
                setEdgeCtx(null);
                setGroupCtx({ x: e.clientX, y: e.clientY, gid });
              }}
            >
              {groups[gid]?.name || '组'}
            </span>
            {(selectedGroupId === gid || selGroupId === gid) && ['e', 'w', 'n', 's'].map((dir) => (
              <span
                key={`anchor-${dir}`}
                className={`group-anchor ga-${dir}`}
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onConnectStart(e, gid, dir); }}
              />
            ))}
          </div>
        ))}
        {renderVisibleIds.map((id) => {
          const card = cards[id];
          if (!card) return null;
          const sec = sectionMap.get(card.sectionId);
          const peerName = peerEditingMap.get(id) || null;
          // 链接目标选中效果：选中连线的目标卡片高亮
          const isEdgeTarget = edgeTargetIds.has(card.id);
          // 拖线目标反馈：连线末端悬停到该卡片时高亮（提示松手即可连接）
          const isConnectTarget = connectTargetId === card.id;
          return (
            <CardView
              key={card.id}
              card={card}
              zoom={vp.zoom}
              selected={selection.includes(card.id) && !selectedGroupId && !selGroupId}
              editing={editingCardId === card.id}
              animating={animating}
              peerEditing={peerName}
              sectionColor={sec?.color}
              sectionEmoji={sec?.emoji}
              sectionName={sec?.name}
              onResizeStart={onCardResizeStart}
              onContextMenu={(e, c) => onCtxMenu(e, c)}
              onPointerDownCard={onCardPointerDown}
              onDoubleClick={onDoubleClickCard}
              onConnectStart={onConnectStart}
              onEnsureVisible={ensureCardInView}
              edgeTarget={isEdgeTarget}
              connectTarget={isConnectTarget}
              connectFrom={tempEdge && !tempEdge.branch ? tempEdge.from : null}
            />
          );
        })}
        {/* 父节点折叠/展开收纳钮（卡片或编组：贴在左上角外缘的小气泡；未收时=折叠提示点，收起后=计数徽标 +N） */}
        {foldableParents
          .filter((id) => {
            const nb = nodeBox(id);
            if (!nb) return false;
            if (cards[id]) return renderVisibleIds.includes(id);
            return !foldHidden.hideGroups.has(id);
          })
          .map((id) => {
            const nb = nodeBox(id) as { x: number; y: number };
            const isGroupNode = !!groups[id];
            const descCount = (foldDesc[id] || []).length;
            const isFolded = !!folded[id];
            return (
              <button
                key={`foldpill-${id}`}
                className={`fold-pill ${isFolded ? 'folded has-count' : ''} ${isGroupNode ? 'fold-pill-group' : ''}`}
                style={{
                  left: nb.x - 3,
                  top: nb.y - 3,
                  ['--inv-zoom' as string]: String(1 / vp.zoom),
                }}
                title={isFolded ? `展开该分支（含 ${descCount} 个子节点）` : '收起该父节点的子分支'}
                type="button"
                onPointerDown={(e) => {
                  // 触屏/指针按下即立即切换，避免小圆钮的 onClick 被外层卡片/组框的按下事件干扰而需多次点按
                  e.stopPropagation();
                  e.preventDefault();
                  setFolded((prev) => ({ ...prev, [id]: !prev[id] }));
                }}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                {isFolded ? <span className="fold-pill-num">+{descCount}</span> : <span className="fold-pill-dot" />}
              </button>
            );
          })}
      </div>
      {/* 画笔标注层：所有笔画统一在最上层（覆盖卡片/连线），自带画布 transform 跟随缩放平移 */}
      <div
        className="annotations-layer"
        style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, transformOrigin: '0 0' }}
      >
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
          {Object.values(annotations).map((a) => (
            <g key={a.id} className={`annotation-g ${selAnnotation === a.id ? 'selected' : ''}`}>
              {a.points.length === 1 ? (
                <circle
                  cx={a.points[0][0]}
                  cy={a.points[0][1]}
                  r={Math.max(a.width, 2)}
                  fill={a.color}
                  opacity={0.85}
                  className="annotation-line"
                  style={{ pointerEvents: 'none' }}
                />
              ) : (
                <path
                  d={penStrokePath(a.points, a.width)}
                  fill={a.color}
                  opacity={0.85}
                  className="annotation-line"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {a.points.length === 1 ? (
                <circle
                  cx={a.points[0][0] * vp.zoom + vp.x}
                  cy={a.points[0][1] * vp.zoom + vp.y}
                  r={Math.max(a.width + 12, 16)}
                  fill="transparent"
                  className="annotation-hit"
                  onPointerDown={(ev) => {
                    const stt = useStudio.getState();
                    if (stt.tool === 'pen') {
                      // 画笔/橡皮模式：不选中、不拦截、不做点击删除——事件冒泡到画布，
                      // 画笔正常作画，橡皮按滑动涂抹精确擦除（避免整条误删）
                      return;
                    }
                    ev.stopPropagation();
                    setSelAnnotation(selAnnotation === a.id ? null : a.id);
                  }}
                />
              ) : (
                <path
                  d={smoothPath(a.points, vp)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(22, 14)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="annotation-hit"
                  onPointerDown={(ev) => {
                    const stt = useStudio.getState();
                    if (stt.tool === 'pen') {
                      // 画笔/橡皮模式：不选中、不拦截、不做点击删除——事件冒泡到画布，
                      // 画笔正常作画，橡皮按滑动涂抹精确擦除（避免整条误删）
                      return;
                    }
                    ev.stopPropagation();
                    setSelAnnotation(selAnnotation === a.id ? null : a.id);
                  }}
                />
              )}
            </g>
          ))}
          {penPreview && penPreview.length >= 1 && (
            penEraser ? (
              // 橡皮模式：显示橡皮擦图标（橡皮+红色圆环）跟随移动，不画线
              (() => {
                const last = penPreview[penPreview.length - 1];
                return (
                  <g className="eraser-cursor" style={{ pointerEvents: 'none' }}>
                    <circle
                      cx={last[0]}
                      cy={last[1]}
                      r={Math.max(eraserWidth / 2, 10)}
                      fill="rgba(214, 48, 49, 0.08)"
                      stroke="#d63031"
                      strokeWidth={1.5 / vp.zoom}
                    />
                    <text
                      x={last[0]}
                      y={last[1]}
                      fontSize={Math.max(eraserWidth * 0.7, 10)}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >✕</text>
                  </g>
                );
              })()
            ) : penPreview.length === 1 ? (
              <circle
                cx={penPreview[0][0]}
                cy={penPreview[0][1]}
                r={Math.max(penWidth, 2)}
                fill={penColor}
                opacity={0.8}
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <path
                d={penStrokePath(penPreview, penWidth)}
                fill={penColor}
                opacity={0.8}
                style={{ pointerEvents: 'none' }}
              />
            )
          )}
        </svg>
      </div>


      {/* 框选 */}
      {bandRect && <div className="band" style={{ left: bandRect.x, top: bandRect.y, width: bandRect.w, height: bandRect.h }} />}

      {/* 页面提示：当前画布/筛选结果为空时显示 */}
      {visibleIds.length === 0 && (
        <div className="canvas-empty-hint">
          <div className="ceh-title"><DocIcon size={14} /> {cardList.length === 0 ? '当前页面还没有卡片' : '当前视野内没有卡片'}</div>
          <div className="ceh-line">{cardList.length === 0 ? '双击空白新建便签 · 右键/长按空白更多操作 · 右侧「模板」一键插入' : '当前视野内没有卡片，可直接双击空白新建。'}</div>
          {sectionFilter !== 'all' && <div className="ceh-line">当前筛选分区暂无卡片，可切回「全部」查看</div>}
        </div>
      )}

      {/* 临时连线（连线/分支拖拽） */}
      {tempEdge && (() => {
        let x1 = 0;
        let y1 = 0;
        if (tempEdge.branch) {
          const e = edges[tempEdge.from];
          const nf = e ? nodeBox(e.from) : null;
          const nt = e ? nodeBox(e.to) : null;
          if (!e || !nf || !nt) return null;
          const geo = edgeGeometry(e, nf, nt);
          x1 = geo.mid.x;
          y1 = geo.mid.y;
        } else {
          let from = cards[tempEdge.from];
          if (!from && groups[tempEdge.from]) {
            const gbox = groupBoxes[tempEdge.from];
            if (gbox) from = { id: tempEdge.from, x: gbox.x, y: gbox.y, w: gbox.w, h: gbox.h, groupId: tempEdge.from } as Card;
          }
          if (!from) return null;
          const ap = tempEdge.fromDir ? anchorPoint(from, tempEdge.fromDir) : { x: from.x + from.w / 2, y: from.y + from.h / 2 };
          x1 = ap.x;
          y1 = ap.y;
        }
        const mx = (x1 + tempEdge.toX) / 2;
        const my = (y1 + tempEdge.toY) / 2;
        return (
          <svg className="temp-edge-svg" style={{ overflow: 'visible' }}>
            <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.zoom})`}>
              <path
                d={`M ${x1} ${y1} Q ${mx} ${my} ${tempEdge.toX} ${tempEdge.toY}`}
                fill="none"
                stroke="#6a5cf5"
                strokeWidth={2 / vp.zoom}
                strokeDasharray={`${6 / vp.zoom} ${4 / vp.zoom}`}
              />
            </g>
          </svg>
        );
      })()}

      {/* 协同成员光标 */}
      {Object.values(peers).map((p) => {
        if (p.id === getClientId() || p.px === undefined || p.py === undefined) return null;
        const sx = p.px * vp.zoom + vp.x;
        const sy = p.py * vp.zoom + vp.y;
        return (
          <div key={p.id} className="peer-cursor" style={{ left: sx, top: sy, color: p.color }}>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M2 1 L2 12 L5 9.5 L7 14 L9.5 13 L7.5 8.5 L11 8 Z" fill={p.color} stroke="#fff" strokeWidth="1" />
            </svg>
            <span className="peer-name">{p.name}</span>
          </div>
        );
      })}


      <MiniMap />

      {/* 触屏多选浮动条 */}
      {multiSelect && (
        <div className="multi-bar" onPointerDown={(e) => e.stopPropagation()}>
          <b>已选 {selection.length} 张</b>
          <button onClick={() => { if (selection.length > 1) useStudio.getState().createGroup(selection); }} title="编组所选"><GroupIcon size={14} /> 编组</button>
          <button onClick={() => { useStudio.getState().duplicateCards(selection); }} title="复制所选"><ClipboardIcon size={14} /> 复制</button>
          <button onClick={() => { useStudio.getState().deleteCards(selection); setMultiSelect(false); }} title="删除所选"><TrashColorIcon size={15} /></button>
          <button className="primary" onClick={() => setMultiSelect(false)}><CheckIcon size={14} /> 完成</button>
          <button onClick={() => { useStudio.getState().setSelection([]); setMultiSelect(false); }}><CloseIcon size={14} /> 取消</button>
        </div>
      )}

      {/* 左侧竖排工具栏：页面切换 / 撤销 / 重做 / 保存 / 删除（工具面板展开时自动淡出，避免重叠）
          定位：作为 .canvas-wrap 直接子元素绝对定位（left/top 随画布区，不再 fixed 钉死视口左上角压住侧栏） */}
      <div ref={vToolbarRef} className={`v-toolbar${toolPanelOpen ? ' dim' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="vt-view"
          onTouchStart={(e) => { vtStart.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => { const dy = e.changedTouches[0].clientY - vtStart.current; if (dy < -28) goVtGroup(1); else if (dy > 28) goVtGroup(-1); }}
        >
          {vtGroups[vtGroup]}
        </div>
        <span className={`vt-save ${saving ? 'saving' : ''}`} title="保存状态">
          {saving ? '保存中…' : '已保存'}
        </span>
      </div>

      {/* 右下角悬浮：工具 + 缩放（可折叠） */}
      <div className="zoom-ctrl" onPointerDown={(e) => e.stopPropagation()}>
        {!toolPanelOpen ? (
          <button className="zc-fab" title="工具与缩放" aria-label="工具与缩放" onClick={() => setToolPanelOpen(true)}>
            {tool === 'select' ? <SelectIcon size={20} /> : tool === 'move' ? <HandIcon size={20} /> : tool === 'edit' ? <CursorIcon size={20} /> : tool === 'pen' ? (penEraser ? <EraserIcon size={20} /> : <PaintbrushIcon size={20} />) : <PaintbrushIcon size={20} />}
          </button>
        ) : (
          <div className="zc-panel">
            <div className="zc-tools" role="group" title="工具模式">
              <button
                className={`zc-tool ${tool === 'select' ? 'active' : ''}`}
                title="框选：点击/框选卡片，拖空白框选" aria-label="框选工具"
                onClick={() => useStudio.getState().setTool('select')}
              >
                <SelectIcon size={17} /><em>框选</em>
              </button>
              <button
                className={`zc-tool ${tool === 'move' ? 'active' : ''}`}
                title="移动：拖动画布" aria-label="移动工具"
                onClick={() => useStudio.getState().setTool('move')}
              >
                <HandIcon size={17} /><em>移动</em>
              </button>
              <button
                className={`zc-tool ${tool === 'edit' ? 'active' : ''}`}
                title="选择：点击选择卡片，双击进入全屏写作" aria-label="选择工具"
                onClick={() => useStudio.getState().setTool('edit')}
              >
                <CursorIcon size={17} /><em>选择</em>
              </button>
              <button
                className={`zc-tool ${tool === 'pen' ? 'active' : ''}`}
                title="画笔：在画布上自由标注涂鸦" aria-label="画笔工具"
                onClick={() => {
                  setPenEraserP(false);
                  useStudio.getState().setTool('pen');
                }}
              >
                <PaintbrushIcon size={17} /><em>画笔</em>
              </button>
              <button
                className={`zc-tool eraser ${tool === 'pen' && penEraser ? 'active' : ''}`}
                title="橡皮擦：涂抹/点选擦除画布上的标注" aria-label="橡皮擦工具"
                onClick={() => {
                  setPenEraserP(true);
                  useStudio.getState().setTool('pen');
                }}
              >
                <EraserIcon size={17} /><em>橡皮</em>
              </button>
            </div>
            {tool === 'pen' && (
              <div className={`pen-tools ${penEraser ? 'eraser-tools' : ''}`}>
                {!penEraser && (
                <div className="pen-row">
                  <span className="pen-label">颜色</span>
                  <div className="pen-palette">
                    {['#e17055', '#d63031', '#fdcb6e', '#00b894', '#0984e3', '#6a5cf5', '#e84393', '#2d3436', '#ffffff'].map((c) => (
                      <button
                        key={c}
                        className={`pen-swatch ${penColor === c ? 'on' : ''}`}
                        style={{ background: c, borderColor: c === '#ffffff' ? 'var(--border)' : c }}
                        title={c === '#ffffff' ? '白色（荧光笔）' : c}
                        onClick={() => setPenColorP(c)}
                      />
                    ))}
                  </div>
                </div>
                )}
                <div className="pen-row">
                  <span className="pen-label">{penEraser ? '橡皮大小' : '粗细'}</span>
                  <input
                    type="range" min={1} max={30} step={0.5}
                    value={penEraser ? eraserWidth : penWidth}
                    onChange={(e) => penEraser ? setEraserWidthP(Number(e.target.value)) : setPenWidthP(Number(e.target.value))}
                  />
                  <em className="pen-val">{(penEraser ? eraserWidth : penWidth).toFixed(1)}</em>
                </div>
                <div className="pen-row">
                  <button
                    className={`pen-mode ${penEraser ? 'on eraser-on' : ''}`}
                    onClick={() => setPenEraserP(!penEraser)}
                    title="橡皮：涂抹可擦除已有标注（橡皮无需颜色/粗细）"
                  >
                    {penEraser ? <><EraserIcon size={13} /> 橡皮模式</> : <><PaintbrushIcon size={13} /> 画笔模式</>}
                  </button>
                  <button
                    className="pen-mode danger"
                    onClick={async () => {
                      const st = useStudio.getState();
                      if (Object.keys(st.annotations).length && await csConfirm('清空本页所有画笔标注？')) {
                        st.clearAnnotations();
                        st.pushHistory();
                        toast('已清空标注', 'warn');
                      }
                    }}
                    title="清空本页所有标注"
                  >
                    <TrashColorIcon size={13} /> 清空
                  </button>
                </div>
                {selAnnotation && (
                  <div className="pen-row">
                    <button
                      className="pen-mode danger"
                      onClick={() => {
                        useStudio.getState().deleteAnnotation(selAnnotation);
                        useStudio.getState().pushHistory();
                        setSelAnnotation(null);
                        toast('已删除选中的标注', 'ok');
                      }}
                      title="删除当前选中的标注（也可按 Delete 键）"
                    >
                      <TrashColorIcon size={13} /> 删除选中标注
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="zc-zoom">
              <button title="缩小" aria-label="缩小" onClick={() => zoomAtAnchor(0.85)}>−</button>
              <span className="zoom-val">{Math.round(vp.zoom * 100)}%</span>
              <button title="放大" aria-label="放大" onClick={() => zoomAtAnchor(1.18)}>+</button>
              <button title="适配视图" aria-label="适配视图" onClick={() => useStudio.getState().fitView()}><FitViewIcon size={15} /></button>
              <button title="100%" aria-label="恢复 100% 缩放" onClick={() => useStudio.getState().setViewport({ ...vpRef.current, zoom: 1 })}>1:1</button>
              <button className={zoomLocked ? 'locked' : ''} title={zoomLocked ? '解锁缩放' : '锁定缩放（禁止缩放）'} aria-label={zoomLocked ? '解锁缩放' : '锁定缩放'} onClick={() => setZoomLocked(!zoomLocked)}>{zoomLocked ? <UnlockIcon size={15} /> : <LockColorIcon size={15} />}</button>
              <button
                className={orientation === 'landscape' || orientation === 'portrait' ? 'active' : ''}
                title={orientation === 'landscape' ? '当前横屏，点击切换竖屏' : orientation === 'portrait' ? '当前竖屏，点击切换横屏' : '点击切换横屏/竖屏'}
                aria-label="切换横竖屏"
                onClick={() => {
                  // auto 时按当前设备实际方向取相反方向，保证点一次就有可见变化
                  const effective = orientation === 'auto'
                    ? (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape')
                    : orientation;
                  const next = effective === 'landscape' ? 'portrait' : 'landscape';
                  useStudio.getState().updateSettings({ orientation: next });
                  toast(`已切换为${next === 'landscape' ? '横屏' : '竖屏'}`, 'ok');
                }}
              >⇅</button>
              <button className="zc-close" title="折叠" aria-label="折叠工具面板" onClick={() => setToolPanelOpen(false)}>▾</button>
            </div>
          </div>
        )}
      </div>

      {/* 右键菜单（卡片与空白统一使用同一弹出效果） */}
      {ctx && (
        <div
          className="ctx-menu"
          style={{
            left: Math.min(ctx.x, window.innerWidth - 230),
            top: Math.min(ctx.y, Math.max(8, window.innerHeight - 320)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ctxSec ? (
            <>
              <button className="ctx-back" onClick={() => setCtxSec(false)}><ArrowBackIcon size={13} /> 返回</button>
              <button onClick={() => { if (ctx.cardId) useStudio.getState().updateCard(ctx.cardId, { sectionId: '' }); setCtx(null); setCtxSec(false); }}><CloseIcon size={13} />（未分区）</button>
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => { if (ctx.cardId) useStudio.getState().updateCard(ctx.cardId, { sectionId: sec.id }); setCtx(null); setCtxSec(false); }}
                ><SectionIcon emoji={sec.emoji} size={13} /> {sec.name}</button>
              ))}
            </>
          ) : (
            ctx.items.map((it, i) => (
              <button
                key={i}
                className={it.danger ? 'danger' : ''}
                onClick={() => {
                  it.fn();
                  setCtx(null);
                }}
              >
                {it.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* 连线右键菜单（compact：缩小 + 滚动条） */}
      {edgeCtx && (() => {
        const E = liveEdge || edgeCtx.edge; // 实时最新连线（避免快照导致选中标记不更新）
        return (
        <div className="ctx-menu compact" style={{ left: Math.min(edgeCtx.x, window.innerWidth - 230), top: Math.min(edgeCtx.y, window.innerHeight - 320) }} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={async () => {
              const label = await csPrompt('连线注释（如：师徒 / 敌对 / 线索→）', E.label || '', undefined, true);
              if (label !== null) {
                useStudio.getState().updateEdge(E.id, { label });
                setEdgeCtx(null);
              }
            }}
          >
            <TalkIcon size={14} /> {E.label ? '修改注释' : '添加注释'}
          </button>
          <button
            onClick={() => {
              useStudio.getState().updateEdge(E.id, { dashed: !E.dashed });
              setEdgeCtx(null);
            }}
          >
            {E.dashed ? '— 实线样式' : '┅ 虚线样式'}
          </button>
          <button
            onClick={() => {
              const cur = E.lineStyle ?? 'curve';
              const next = cur === 'curve' ? 'straight' : cur === 'straight' ? 'elbow' : 'curve';
              useStudio.getState().updateEdge(E.id, { lineStyle: next });
              setEdgeCtx(null);
            }}
          >
            〰 线型（当前：{E.lineStyle === 'straight' ? '直线' : E.lineStyle === 'elbow' ? '折线' : '曲线'}）
          </button>
          <button
            onClick={() => {
              const cur = E.arrow ?? 'end';
              const next = cur === 'end' ? 'start' : cur === 'start' ? 'both' : cur === 'both' ? 'none' : 'end';
              useStudio.getState().updateEdge(E.id, { arrow: next });
              setEdgeCtx(null);
            }}
          >
            <ArrowIcon size={14} /> 箭头（当前：{E.arrow === 'start' ? '头箭' : E.arrow === 'both' ? '双向' : E.arrow === 'none' ? '无' : '尾箭'}）
          </button>
          <button
            className="danger"
            onClick={() => {
              useStudio.getState().deleteEdges([E.id]);
              toast('连线已断开', 'ok');
              setEdgeCtx(null);
            }}
          >
            <ScissorsIcon size={14} /> 断开这条连线
          </button>
        </div>
        );
      })()}

      {/* 编组右键菜单 */}
      {groupCtx && (
        <div className="ctx-menu compact group-ctx" style={{ left: Math.min(groupCtx.x, window.innerWidth - 260), top: Math.min(groupCtx.y, window.innerHeight - 360) }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="branch-title">编组：{groups[groupCtx.gid]?.name}</div>
          <div className="ctx-section-title"><ClipboardIcon size={13} /> 操作</div>
          <button
            onClick={async () => {
              const name = await csPrompt('编组名称：', groups[groupCtx.gid]?.name || '');
              if (name !== null && name.trim()) {
                useStudio.getState().updateGroupName(groupCtx.gid, name.trim());
              }
              setGroupCtx(null);
            }}
          >
<PencilIcon size={14} /> 重命名
          </button>
          <button
            onClick={() => {
              const gid = groupCtx.gid;
              setGroupCtx(null);
              useStudio.getState().duplicateGroup(gid);
            }}
          >
            <ClipboardIcon size={14} /> 复制编组
          </button>
          <button
            onClick={() => {
              const gid = groupCtx.gid;
              setGroupCtx(null);
              useStudio.getState().setSelection(Object.values(cards).filter((c) => !c.writingOnly && c.groupId === gid).map((c) => c.id));
            }}
          >
            <SelectIcon size={14} /> 选中组内全部
          </button>
          <button
            onClick={() => {
              const gid = groupCtx.gid;
              setGroupCtx(null);
              const allLocked = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === gid).every((c) => c.locked);
              useStudio.getState().lockGroup(gid, !allLocked);
            }}
          >
            {Object.values(cards).filter((c) => !c.writingOnly && c.groupId === groupCtx.gid).every((c) => c.locked) ? <><UnlockIcon size={14} /> 解锁组（固定位置）</> : <><LockColorIcon size={14} /> 锁定组（固定位置）</>}
          </button>
          <button
            onClick={() => {
              const gid = groupCtx.gid;
              setGroupCtx(null);
              useStudio.getState().dissolveGroup(gid);
            }}
          >
            <UngroupIcon size={14} /> 解散编组
          </button>
          <button
            className="danger"
            onClick={async () => {
              const gid = groupCtx.gid;
              const ids = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === gid).map((c) => c.id);
              setGroupCtx(null);
              if (await csConfirm(`删除编组及组内 ${ids.length} 张卡片？卡片会进入回收站。`)) {
                useStudio.getState().deleteCards(ids);
                useStudio.getState().dissolveGroup(gid);
              }
            }}
          >
            <TrashColorIcon size={14} /> 删除编组及内容
          </button>
        </div>
      )}

      {/* 连线分支创建菜单 */}
      {branchMenu && (
        <div className="ctx-menu branch-menu" style={{ left: Math.min(branchMenu.x, window.innerWidth - 230), top: Math.min(branchMenu.y, window.innerHeight - 320) }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="branch-title">从连线新建分支节点</div>
          {branchItems.map((it) => (
            <button
              key={it.key}
              onClick={() => {
                const st = useStudio.getState();
                const pos = { x: branchMenu.world.x - 130, y: branchMenu.world.y - 80 };
                let id = '';
                if (it.tpl) {
                  const tpl = it.tpl as NonNullable<typeof it.tpl>;
                  const sec = st.sections.find((x) => x.name === tpl.section);
                  const secId = sec ? sec.id : st.addSection(tpl.section, '📦');
                  const card = templateToCard(tpl, secId, pos);
                  st.addCardsAt([card]);
                  id = card.id;
                } else if (it.image) {
                  openImagePicker();
                  pendingBranchImage = { edge: branchMenu.edge, world: branchMenu.world, from: branchMenu.from };
                } else {
                  id = st.addCard({ x: pos.x, y: pos.y, title: it.title, sectionId: '' });
                }
                if (id) {
                  if (branchMenu.edge) {
                    // 连线中段：原线删除，新卡插入两端之间
                    st.deleteEdges([branchMenu.edge.id]);
                    st.addEdge(branchMenu.edge.from, id);
                    st.addEdge(id, branchMenu.edge.to);
                  } else if (branchMenu.from) {
                    // 卡片锚点：追加一条连线
                    st.addEdge(branchMenu.from, id);
                  }
                  st.setSelection([id]);
                  toast('已创建节点并连线', 'ok');
                }
                setBranchMenu(null);
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}

      {/* 插入模板菜单（长按/右键卡片 → 插入模板） */}
      {tplMenu && (() => {
        const myTpls = loadTemplates();
        return (
          <div className="ctx-menu compact tpl-menu" style={{ left: Math.min(tplMenu.x, window.innerWidth - 260), top: Math.min(tplMenu.y, window.innerHeight - 420) }} onPointerDown={(e) => e.stopPropagation()}>
            <div className="branch-title"><PuzzleIcon size={13} /> 插入模板（点击插入到此处）</div>
            {myTpls.length > 0 && (
              <>
                <div className="tpl-menu-group"><StarColorIcon size={13} /> 我的模板</div>
                {myTpls.map((t) => (
                  <button key={t.id} onClick={() => {
                    const st = useStudio.getState();
                    const secId = st.sections.find((x) => x.name === '便签')?.id || st.sections[0]?.id || '';
                    const card = customTemplateToCard(t, secId, { x: tplMenu.world.x - 150, y: tplMenu.world.y - 100 });
                    st.addCardsAt([card]);
                    st.setSelection([card.id]);
                    toast(`已插入模板「${t.title}」`, 'ok');
                    setTplMenu(null);
                  }}>
                    <PinIcon size={14} /> {t.title}
                  </button>
                ))}
              </>
            )}
            <div className="tpl-menu-group"><PuzzleIcon size={13} /> 内置模板（本板块可用）</div>
            {(() => {
              const boardType = useStudio.getState().meta?.type || 'custom';
              const list = boardType === 'custom' ? cardTemplates : templatesForBoard(boardType);
              return list.map((tpl) => (
              <button key={tpl.key} onClick={() => {
                const st = useStudio.getState();
                const sec = st.sections.find((x) => x.name === tpl.section);
                const secId = sec ? sec.id : st.addSection(tpl.section, '📦');
                const card = templateToCard(tpl, secId, { x: tplMenu.world.x - 150, y: tplMenu.world.y - 100 });
                st.addCardsAt([card]);
                st.setSelection([card.id]);
                toast(`已插入模板「${tpl.title}」`, 'ok');
                setTplMenu(null);
              }}>
                <SectionIcon emoji={tpl.emoji} size={13} /> {tpl.title}
              </button>
              ));
            })()}
          </div>
        );
      })()}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, left: -9999, top: -9999, pointerEvents: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const src = await fileToDataURL(f);
          await handleImageSrc(src);
        }}
      />
    </div>
  );
}

// ---------- 画笔工具辅助 ----------

/** 曲线平滑路径（中点二次贝塞尔），pts 为世界坐标 */
function getSvgPathFromStroke(points: number[][]): string {
  const len = points.length;
  if (len < 4) return '';
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${((b[0] + c[0]) / 2).toFixed(2)},${((b[1] + c[1]) / 2).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)} `;
  }
  result += 'Z';
  return result;
}
function eraseAnnotation(ann: Annotation, stroke: [number, number][], threshold: number): Annotation[] | null {
  if (!stroke.length) return null;
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let touched = false;
  for (const p of ann.points) {
    let hit = false;
    for (let i = 0; i < stroke.length - 1; i++) {
      if (distToSegment(p, stroke[i], stroke[i + 1]) <= threshold) { hit = true; break; }
    }
    if (stroke.length === 1 && Math.hypot(p[0] - stroke[0][0], p[1] - stroke[0][1]) <= threshold) hit = true;
    if (hit) {
      touched = true;
      if (cur.length) { segs.push(cur); cur = []; }
    } else {
      cur.push(p);
    }
  }
  if (cur.length) segs.push(cur);
  if (!touched) return null;
  if (!segs.length) return [];
  return segs
    .filter((sg) => sg.length >= 2 || ann.points.length === 1)
    .map((sg) => ({ id: uid('ann'), points: sg, color: ann.color, width: ann.width, createdAt: Date.now() }));
}

// 实时擦除一段：擦除上一落点→当前点覆盖的笔画部分（滑动中即时生效）
function liveEraseSegment(a: [number, number], b: [number, number], eraserWidth: number): boolean {
  const st = useStudio.getState();
  const threshold = Math.max(6, eraserWidth * 1.2) / st.viewport.zoom;
  let changed = false;
  for (const ann of Object.values(st.annotations)) {
    const segs = eraseAnnotation(ann, [a, b], threshold);
    if (segs === null) continue; // 未擦到
    st.deleteAnnotation(ann.id);
    changed = true;
    for (const na of segs) st.addAnnotation(na);
  }
  return changed;
}

// perfect-freehand 压力感平滑笔画（Excalidraw 同款引擎）：根据落笔速度模拟粗细变化
function penStrokePath(pts: [number, number][], width: number): string {
  const outline = getStroke(pts, {
    size: Math.max(width * 2, 4),
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
    last: true,
  });
  return getSvgPathFromStroke(outline);
}

function smoothPath(pts: [number, number][], vp: { x: number; y: number; zoom: number }): string {
  // 画笔标注与卡片同层（画布 transform 内），直接使用世界坐标，缩放由 transform 统一处理
  const P = (p: [number, number]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  if (pts.length < 3) return `M ${P(pts[0])} L ${P(pts[pts.length - 1])}`;
  let d = `M ${P(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${P(pts[i])} ${mx.toFixed(2)},${my.toFixed(2)}`;
  }
  d += ` L ${P(pts[pts.length - 1])}`;
  return d;
}

/** 按最小间距抽稀点列（世界坐标） */
function simplifyPoints(pts: [number, number][], minDist: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= minDist) out.push(pts[i]);
  }
  const lastP = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(lastP[0] - tail[0], lastP[1] - tail[1]) >= minDist * 0.5) out.push(lastP);
  return out;
}

/** 点到线段的最短距离 */
function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * 橡皮擦除：把标注按橡皮笔画切分为多段（真擦除效果）。
 * 返回 null = 未擦到（保留原标注）；[] = 全部擦除；否则为擦除后保留的分段标注。
 */

