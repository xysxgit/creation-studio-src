/**
 * ============ 全局状态 Store（zustand）============
 * 单例 useStudio，覆盖：项目/画布数据/选区/设置/历史快照/协同 op。
 * 代码已按职责拆分为：
 *  · src/store/persistence.ts —— localStorage 读写（纯函数）
 *  · src/store/history.ts     —— 撤销/重做快照
 *  · src/store/ops.ts         —— 协同操作流（op 生成/去重）
 * 持久化策略：高频变更只标记脏 + 1.5s 防抖落盘；页面隐藏/关闭/30s 兜底强制落盘。
 */
import { csConfirm } from './components/SystemDialog';
// ============ 全局状态 Store（zustand，slices 组装）============
import { create } from 'zustand';
import type {
  AiEditLog, Annotation, AppSettings, Card, CardGroup, Edge, Manuscript, ManuscriptChapter, ManuscriptVolume, Op, PageMeta, Peer,
  ProjectFolder, ProjectMeta, ProjectState, Section, Viewport,
} from './types';
import { PROJECT_TYPE_LABEL, type ProjectType } from './types';
import { clamp, emptyDoc, logDebug, logError, logInfo, logOp, paperRatio, toast, uid } from './util';
import { exceedMsg, LIMITS } from './limits';
import { buildSectionsForType, buildSampleProject } from './defaults';
import {
  DEFAULT_SETTINGS, EMPTY_MANUSCRIPT, K_AI_HISTORY, K_CURRENT, K_PROJECT, K_TRASH_CARDS, K_WRITE_TRASH_CARDS, SECTION_COLOR_PALETTE,
  loadAiHistory, loadFolders, loadPageTrash, loadProjectData, loadProjects, loadSettings, loadTrash, loadTrashCards, loadWriteTrashCards,
  savePageTrash, type PageTrashItem,
  saveAiHistory, saveFolders, saveProjectData, saveProjects, saveSettings, saveTrash,
  type PageData, type TrashItem,
} from './store/persistence';

/** 图片卡占位图：便签/标签卡转换成图片卡且无图时使用 */
const IMG_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="260"><rect width="100%" height="100%" fill="#f2f3f7"/><g fill="none" stroke="#c2c8dd" stroke-width="3"><rect x="70" y="70" width="180" height="120" rx="14"/><circle cx="150" cy="118" r="15"/><path d="M100168 l40-38 28 24 24-30 34 34"/></g><text x="160" y="220" font-size="14" fill="#8a90a6" text-anchor="middle">图片占位</text></svg>');
import { bindOpSink, emitOps, getClientId, rememberOp, seenOps, setOpPageGetter } from './store/ops';
// 兼容旧导入：外部模块（CanvasBoard/ws 等）继续从 './store' 取这些导出
export { bindOpSink, emitOps, getClientId, rememberOp, seenOps } from './store/ops';
import {
  HISTORY_COALESCE_MS, HISTORY_MAX, UNDO_REDO_STEP_LIMIT,
  describeCardPatch, describeEdgePatch, historySnapshot, shouldPushEditHistory, type Snapshot,
} from './store/history';


/** 页面数据暂存（内存）：projectId → pageId → PageData */
const pageStash: Record<string, Record<string, PageData>> = {};

/** 名称唯一化：若 base 与已有名称重复，在后追加数字序号（base2、base3…）用于区分同名新建实体 */
function ensureUniqueName(base: string, taken: Array<string | undefined>): string {
  const b = (base || '').trim();
  if (!b) return b;
  const set = new Set(taken.filter((s): s is string => !!s && s.trim() !== '').map((s) => s.trim()));
  if (!set.has(b)) return b;
  let i = 2;
  while (set.has(b + i)) i++;
  return b + i;
}

/** 视口安全护栏：任何路径写 viewport 都经此，保证 x/y 有限、不被甩到空白区（“点缩放乱跳看不到卡片”）。
 *  vp.x/y 是画布 transform 的 translate（单位：屏幕/内容像素）；只做“有限性 + 合理量级上限”防护，
 *  不收紧到会妨碍正常拖动/缩放的范围。NaN/Infinity 一律回退为 0。 */
function sanitizeViewport(vp: Viewport, cards: Record<string, Card>, fallbackZoom?: number): Viewport {
  const zoom = Number.isFinite(vp.zoom) && vp.zoom > 0 ? vp.zoom : (Number.isFinite(fallbackZoom) && (fallbackZoom as number) > 0 ? (fallbackZoom as number) : 1);
  const list = Object.values(cards);
  const span = list.length ? Math.max(Math.max(...list.map((c) => c.x + c.w)) - Math.min(...list.map((c) => c.x)), Math.max(...list.map((c) => c.y + c.h)) - Math.min(...list.map((c) => c.y)), 1) : 1;
  // 允许的 |x|/|y| 上限：内容跨度×(2×当前缩放)再乘 200 倍、且不低于 1e5；日常平移远小于此，防甩飞足够
  const bound = Math.max(100000, span * Math.max(zoom, 1) * 200);
  const sx = Number.isFinite(vp.x) ? vp.x : 0;
  const sy = Number.isFinite(vp.y) ? vp.y : 0;
  return { zoom, x: clamp(sx, -bound, bound), y: clamp(sy, -bound, bound) };
}

function currentPageData(): PageData {
  const s = useStudio.getState();
  return { cards: s.cards, edges: s.edges, annotations: s.annotations, groups: s.groups };
}

/** 把当前内存中的页面数据写回暂存 */
function stashCurrentPage() {
  const s = useStudio.getState();
  if (!s.projectId || !s.currentPageId) return;
  if (!pageStash[s.projectId]) pageStash[s.projectId] = {};
  pageStash[s.projectId][s.currentPageId] = currentPageData();
}

/** 初始化某项目的页面暂存（从已加载的 pages 数据） */
function initPageStash(projectId: string, pages: Record<string, PageData>) {
  pageStash[projectId] = {};
  for (const [pid, data] of Object.entries(pages)) {
    pageStash[projectId][pid] = { cards: data.cards || {}, edges: data.edges || {}, annotations: data.annotations || {}, groups: data.groups || {} };
  }
}

/** 从项目状态中解析页面（含旧格式迁移） */
function pagesFromState(state: ProjectState): { pageOrder: PageMeta[]; pageData: Record<string, PageData>; firstPageId: string } {
  const pageOrder: PageMeta[] = Array.isArray(state.pageOrder) && state.pageOrder.length ? state.pageOrder : [];
  const pageData: Record<string, PageData> = {};
  if (state.pages && Object.keys(state.pages).length) {
    for (const [pid, d] of Object.entries(state.pages)) {
      pageData[pid] = { cards: d.cards || {}, edges: d.edges || {}, annotations: d.annotations || {}, groups: d.groups || {} };
    }
  }
  if (!pageOrder.length || !Object.keys(pageData).length) {
    const pid = state.pageOrder?.[0]?.id || uid('page');
    const meta: PageMeta = state.pageOrder?.[0] || { id: pid, name: '页面 1', emoji: '📄', createdAt: Date.now() };
    pageData[meta.id] = { cards: state.cards || {}, edges: state.edges || {}, annotations: {}, groups: {} };
    pageOrder.length = 0;
    pageOrder.push(meta);
  }
  return { pageOrder, pageData, firstPageId: pageOrder[0].id };
}

/**
 * v2.33 一次性迁移（需求 6.6 正文独立）：旧版「正文=writingOnly 卡片」→ 独立正文 Manuscript。
 * 卷 = writingOnly 编组；章 = writingOnly 卡片；迁移后从画布页面数据中移除，画布/正文数据从此互不污染。
 */
function migrateManuscriptFromPages(
  pages: Record<string, PageData>,
  prev?: Manuscript,
): { pages: Record<string, PageData>; manuscript: Manuscript; migrated: boolean } {
  const volIds = new Set<string>();
  const volumes: ManuscriptVolume[] = [...(prev?.volumes || [])];
  const chMap = new Map<string, ManuscriptChapter>();
  for (const ch of prev?.chapters || []) chMap.set(ch.id, ch);
  const cleanPages: Record<string, PageData> = {};
  for (const [pid, pd] of Object.entries(pages)) {
    const cards: Record<string, Card> = {};
    const groups: Record<string, CardGroup> = {};
    let touched = false;
    for (const [cid, c] of Object.entries(pd.cards || {})) {
      if (c.writingOnly) {
        touched = true;
        if (!chMap.has(cid)) {
          chMap.set(cid, {
            id: cid,
            volumeId: c.groupId || undefined,
            title: c.title || '未命名章节',
            content: c.content ? JSON.parse(JSON.stringify(c.content)) : null,
            order: c.order ?? 0,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt || c.createdAt,
          });
        }
        continue;
      }
      cards[cid] = c;
    }
    for (const [gid, g] of Object.entries(pd.groups || {})) {
      if (g.writingOnly) {
        touched = true;
        if (!volIds.has(gid)) {
          volIds.add(gid);
          volumes.push({ id: gid, name: g.name || '未命名卷', order: g.order ?? volumes.length, createdAt: g.createdAt });
        }
        continue;
      }
      groups[gid] = g;
    }
    cleanPages[pid] = touched ? { ...pd, cards, groups } : pd;
  }
  if (!volumes.length && !chMap.size) return { pages, manuscript: prev || { ...EMPTY_MANUSCRIPT }, migrated: false };
  // 卷排序兜底 + 章节排序（卷内按 order）
  volumes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt).forEach((v, i) => { v.order = i; });
  const chapters = [...chMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
  // 重排每卷内章节 order
  const byVol = new Map<string, ManuscriptChapter[]>();
  for (const ch of chapters) {
    const k = ch.volumeId || '__none';
    if (!byVol.has(k)) byVol.set(k, []);
    byVol.get(k)!.push(ch);
  }
  for (const list of byVol.values()) list.forEach((ch, i) => { ch.order = i; });
  return { pages: cleanPages, manuscript: { volumes, chapters, trash: prev?.trash || [] }, migrated: true };
}

interface StudioState {
  // 项目
  // ---------- 状态字段（持久化数据：项目/画布/设置） ----------
  projects: ProjectMeta[];
  folders: ProjectFolder[];
  projectId: string | null;
  meta: ProjectMeta | null;
  sections: Section[];
  /** 项目内页面（多画布） */
  pages: PageMeta[];
  currentPageId: string;
  cards: Record<string, Card>;
  edges: Record<string, Edge>;
  annotations: Record<string, Annotation>;
  groups: Record<string, CardGroup>;
  zTop: number;
  /** 独立正文（6.6：项目 → 卷 → 章，独立存储） */
  manuscript: Manuscript;
  /** 全局锁定：禁止编辑/移动/删除，仅可查看平移缩放 */
  globalLock: boolean;
  /** 最近一次退出编辑的时间（移动端防误触新建） */
  lastEditExit: number;
  // UI
  viewport: Viewport;
  selection: string[];
  selectedGroupId: string | null;
  edgeSelection: string[];
  editingCardId: string | null;
  sectionFilter: string | 'all';
  sidebarTab: 'sections' | 'outline' | 'layers' | 'history' | 'tree';
  rightTab: 'inspector' | 'ideas' | 'tree';
  mobilePanel: 'none' | 'left' | 'right';
  /** 桌面宽度（>1024）下左右侧栏列的折叠状态（窄屏走 mobilePanel 抽屉） */
  desktopPanels: { left: boolean; right: boolean };
  /** 当前工具：select=框选（默认）；move=移动画布；edit=编辑（双击全屏）；pen=画笔 */
  tool: 'select' | 'move' | 'edit' | 'pen';
  /** 全屏写作的卡片 id */
  fullscreenCardId: string | null;
  modal: string | null;
  /** 打开日历/时间轴后的聚焦目标（日期 / 卡片） */
  hubFocus?: { date?: string; cardId?: string };
  settings: AppSettings;
  peers: Record<string, Peer>;
  serverStatus: 'off' | 'connecting' | 'on';
  // 历史
  history: Snapshot[];
  historyIdx: number;
  redoStack: Snapshot[];
  saving: boolean;
  /** 最近一次保存完成时间（含自动保存） */
  lastSavedAt: number;
/** 云盘同步状态 */
  cloudStatus: 'off' | 'syncing' | 'ok' | 'err';
  /** 云盘上的项目备份文件名列表（最新在前） */
  cloudVersions: string[];
  cloudRefreshVersions: () => Promise<void>;
  cloudRecoverVersion: (filename: string) => Promise<void>;
  /** 项目回收站 */
  trashProjects: TrashItem[];
  /** 页面回收站（删除的画布页可恢复） */
  pageTrash: PageTrashItem[];
  restorePage: (trashIdx: number) => void;
  purgePage: (trashIdx: number) => void;
  clearPageTrash: () => void;

  // ---- actions ----
  // ---------- UI / 视图控制（弹窗/面板/工具/视口等交互态） ----------
  setModal: (m: string | null) => void;
  setHubFocus: (f?: { date?: string; cardId?: string }) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setViewport: (vp: Viewport) => void;
  zoomBy: (factor: number, cx: number, cy: number) => void;
  fitView: () => void;
  setSidebarTab: (t: 'sections' | 'outline' | 'layers' | 'history' | 'tree') => void;
  setRightTab: (t: 'inspector' | 'ideas' | 'tree') => void;
  setMobilePanel: (p: 'none' | 'left' | 'right') => void;
  toggleMobilePanel: (p: 'left' | 'right') => void;
  /** 桌面端侧栏列折叠开关（>1024 宽度生效） */
  toggleDesktopPanel: (side: 'left' | 'right') => void;
  setTool: (t: 'select' | 'move' | 'edit' | 'pen') => void;
  setFullscreenCard: (id: string | null) => void;
  toggleGlobalLock: () => void;
  addAnnotation: (a: Annotation) => void;
  deleteAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  createGroup: (ids: string[], name?: string) => string | null;
  createVolume: (name?: string) => string | null;
  dissolveGroup: (gid: string) => void;
  updateGroupName: (gid: string, name: string) => void;
  updateGroup: (gid: string, patch: Partial<CardGroup>) => void;
  /** 锁定/解锁组内全部卡片（编组固定） */
  lockGroup: (gid: string, locked: boolean) => void;
  /** 复制编组：克隆组本身 + 组内全部卡片（新id、向右下偏移）+ 组内连线 */
  duplicateGroup: (gid: string) => string | null;
  groupIdsOf: (ids: string[]) => string[];
  historyLog: { ts: number; desc: string }[];
  setSectionFilter: (f: string | 'all') => void;
  setEditingCard: (id: string | null) => void;
  setServerStatus: (s: 'off' | 'connecting' | 'on') => void;
  setPeers: (p: Record<string, Peer>) => void;
  updatePeer: (id: string, patch: Partial<Peer>) => void;

  // ---------- 项目管理（新建/打开/关闭/删除/回收站） ----------
  createProject: (type: ProjectType, name: string, withSample: boolean, cover?: string) => string;
  openProject: (id: string) => void;
  /** 关闭当前项目，回到欢迎页（先保存并断开协同） */
  closeProject: () => void;
  /** 删除项目 → 移入回收站（可恢复） */
  deleteProject: (id: string) => void;
  /** 从回收站恢复项目 */
  restoreProject: (id: string) => void;
  /** 从回收站彻底删除项目 */
  purgeProject: (id: string) => void;
  /** 卡片回收站 */
  // ---------- 回收站（画布卡回收 / 写作模式卡回收） ----------
  trashCards: Card[];
  restoreCardFromTrash: (idx: number) => void;
  purgeTrashCard: (idx: number) => void;
  clearTrashCards: () => void;
  /** 正文回收站（与画布卡片分开，正文内专属） */
  writeTrashCards: Card[];
  restoreWriteCardFromTrash: (idx: number) => void;
  purgeWriteCard: (idx: number) => void;
  clearWriteTrash: () => void;
  /** AI 等修改正文前，把当前章节原文备份到正文回收站（可找回） */
  snapshotWriteCard: (id: string) => void;
  /** AI 生成历史（每次 AI 替换/追加正文均可回退对比） */
  aiHistory: AiEditLog[];
  pushAiHistory: (e: AiEditLog) => void;
  restoreAiHistory: (idx: number) => void;
  clearAiHistory: () => void;
  clearAiHistoryBySource: (source: 'canvas' | 'writing') => void;
  renameProject: (name: string) => void;
  patchMeta: (patch: Partial<ProjectMeta>) => void;
  renameProjectMeta: (id: string, name: string) => void;
  importProjectState: (state: ProjectState) => void;

  // ---- 页面 ----
  // ---------- 多页面（分区内再分页） ----------
  addPage: (name?: string, emoji?: string) => string;
  switchPage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  removePage: (id: string) => void;

  // ---- 项目文件夹 ----
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  setProjectFolder: (projectId: string, folderId: string) => void;

  /** 组装用于上传协同服务器的完整项目状态（含页面） */
  exportStateForSync: () => ProjectState | null;

  // ---------- 独立正文（Manuscript，6.1 / 6.6） ----------
  msAddVolume: (name?: string) => string;
  msUpdateVolume: (id: string, patch: Partial<ManuscriptVolume>) => void;
  msRemoveVolume: (id: string, withChapters?: boolean) => void;
  msMoveVolume: (id: string, dir: -1 | 1) => void;
  msAddChapter: (partial?: { volumeId?: string; title?: string }) => string;
  msUpdateChapter: (id: string, patch: Partial<ManuscriptChapter>) => void;
  msMoveChapter: (id: string, dir: -1 | 1) => void;
  msDeleteChapters: (ids: string[]) => void;
  msRestoreChapter: (trashIdx: number) => void;
  msPurgeChapter: (trashIdx: number) => void;
  msClearMsTrash: () => void;

  // ---------- 画布对象操作（卡片/连线/分组/分区） ----------
  addCard: (partial: Partial<Card> & { x?: number; y?: number }, opts?: { center?: boolean; op?: boolean }) => string;
  addCardsAt: (cards: Card[], opts?: { op?: boolean }) => void;
  addImageCard: (imageSrc: string, x: number, y: number, w?: number, h?: number) => string;
  /** 卡片类型互相转换：标签/便签卡 ↔ 图片卡 */
  setCardKind: (id: string, kind: Card['kind']) => void;
  updateCard: (id: string, patch: Partial<Card>, opts?: { op?: boolean }) => void;
  updateCards: (ids: string[], patch: Partial<Card>, opts?: { op?: boolean }) => void;
  /** 拖拽中直接设置位置（不广播） */
  setCardsLocal: (next: Record<string, Card>) => void;
  /** 拖拽结束/布局后广播最终位置 */
  emitCardPatches: (patches: Record<string, Partial<Card>>) => void;
  /** 布局：设置位置并广播（一次历史） */
  applyPositions: (patches: Record<string, Partial<Card>>) => void;
  deleteCards: (ids: string[]) => void;
  duplicateCards: (ids: string[]) => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  bringToFront: (id: string) => void;
  alignCards: (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspace' | 'vspace') => void;

  addEdge: (from: string, to: string, label?: string) => void;
  updateEdge: (id: string, patch: Partial<Edge>) => void;
  deleteEdges: (ids: string[]) => void;
  applyEdgeLabel: (id: string, label: string) => void;

  addSection: (name: string, emoji: string) => string;
  updateSection: (id: string, patch: Partial<Section>) => void;
  removeSection: (id: string, moveToId?: string) => void;
  /** 调整分区顺序（大纲/分区面板排序） */
  moveSection: (id: string, dir: -1 | 1) => void;

  setSelection: (ids: string[], opts?: { edge?: boolean }) => void;
  /** 选中编组本身（不选中组内卡片），右侧显示编组设置 */
  selectGroup: (gid: string) => void;
  toggleSelect: (id: string) => void;

  // ---------- 历史快照（撤销/重做） ----------
  pushHistory: (desc?: string) => void;
  undo: () => void;
  redo: () => void;
  restoreHistory: (idx: number) => void;

  // ---------- 协同（远端 op 应用 / 远端项目拉取） ----------
  applyRemoteOps: (ops: Op[]) => void;
  applyRemoteProject: (state: ProjectState) => void;

  // ---------- 持久化 / 手动保存 / 云同步 ----------
  persistNow: () => void;
  /** 手动保存（立即写盘 + 更新保存时间 + 触发云同步） */
  saveNow: (manual?: boolean) => void;
  /** 立即同步当前项目到云盘（WebDAV） */
  cloudSyncNow: () => Promise<void>;
  /** 从云盘拉取当前项目覆盖本地 */
  cloudPull: () => Promise<void>;
}

// ---------- 防抖持久化 ----------
// 高频路径（打字/拖动/远端 op）只标记脏并防抖落盘，避免每次变更同步 JSON.stringify
// 整个项目（含图片 base64）；页面隐藏/关闭与 30s 兜底定时器保证最终落盘。
let persistDirty = false;
let persistDebounceTimer: number | undefined;
function schedulePersist(delay = 1500) {
  persistDirty = true;
  if (persistDebounceTimer !== undefined) window.clearTimeout(persistDebounceTimer);
  persistDebounceTimer = window.setTimeout(() => {
    persistDebounceTimer = undefined;
    if (!persistDirty) return;
    persistDirty = false;
    const s = useStudio.getState();
    if (s.projectId && s.meta) s.persistNow();
  }, delay);
}
function flushPersistIfDirty() {
  if (!persistDirty) return;
  persistDirty = false;
  if (persistDebounceTimer !== undefined) {
    window.clearTimeout(persistDebounceTimer);
    persistDebounceTimer = undefined;
  }
  const s = useStudio.getState();
  if (s.projectId && s.meta) s.persistNow();
}
// 页面切到后台/被 WebView 回收前立即落盘（Android 上 beforeunload 并不可靠）
window.addEventListener('pagehide', flushPersistIfDirty);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPersistIfDirty();
});

export const useStudio = create<StudioState>((set, get) => ({
  projects: loadProjects(),
  folders: loadFolders(),
  projectId: null,
  meta: null,
  sections: [],
  pages: [],
  currentPageId: '',
  cards: {},
  edges: {},
  annotations: {},
  groups: {},
  manuscript: { ...EMPTY_MANUSCRIPT },
  zTop: 1,
  globalLock: false,
  lastEditExit: 0,
  viewport: { x: 60, y: 40, zoom: 1 },
  selection: [],
  selectedGroupId: null,
  edgeSelection: [],
  editingCardId: null,
  sectionFilter: 'all',
  sidebarTab: 'sections',
  rightTab: 'inspector',
  mobilePanel: 'none',
  desktopPanels: { left: true, right: true },
  tool: 'move',
  fullscreenCardId: null,
  modal: null,
  settings: loadSettings(),
  peers: {},
  serverStatus: 'off',
  history: [],
  historyIdx: -1,
  redoStack: [],
  historyLog: [],
  saving: false,
  lastSavedAt: Date.now(),
  cloudStatus: 'off',
  cloudVersions: [],
  aiHistory: [],
  trashProjects: loadTrash(),
  pageTrash: [],
  trashCards: [],
  writeTrashCards: [],

  setModal: (m) => set({ modal: m }),
  setHubFocus: (f) => set({ hubFocus: f }),
  updateSettings: (patch) => {
    const s = {
      ...get().settings, ...patch,
      ai: { ...get().settings.ai, ...(patch.ai || {}) },
      cloud: { ...get().settings.cloud, ...(patch.cloud || {}) },
    };
    saveSettings(s);
    set({ settings: s });
  },
  setViewport: (vp) => set({ viewport: sanitizeViewport(vp, get().cards, vp.zoom) }),
  zoomBy: (factor, cx, cy) => {
    const vp = get().viewport;
    const zoom = clamp(vp.zoom * factor, 0.2, 3);
    const k = zoom / vp.zoom;
    // 锚点 (cx,cy) 为「相对画布内容区原点」的屏幕坐标（= 世界坐标 × zoom）。
    // 保持锚点不动：新平移量 = 旧平移量 + 锚点位移 × (1-k)。
    set({
      viewport: sanitizeViewport(
        {
          zoom,
          x: vp.x + cx * (1 - k),
          y: vp.y + cy * (1 - k),
        },
        get().cards,
        zoom
      ),
    });
  },
  fitView: () => {
    const cards = Object.values(get().cards);
    if (!cards.length) {
      set({ viewport: { x: 60, y: 40, zoom: 1 } });
      return;
    }
    const minX = Math.min(...cards.map((c) => c.x));
    const minY = Math.min(...cards.map((c) => c.y));
    const maxX = Math.max(...cards.map((c) => c.x + c.w));
    const maxY = Math.max(...cards.map((c) => c.y + c.h));
    // 以真实画布可视区域为基准，避免侧栏/抽屉导致焦点偏移
    const wrap = document.querySelector('.canvas-wrap');
    const rect = wrap?.getBoundingClientRect();
    const w = rect?.width || window.innerWidth;
    const h = rect?.height || window.innerHeight;
    const narrow = window.innerWidth < 1024;
    const pad = narrow ? 20 : 60;
    const zw = (w - pad * 2) / Math.max(1, maxX - minX);
    const zh = (h - pad * 2) / Math.max(1, maxY - minY);
    const zoom = clamp(Math.min(zw, zh, 1.5), 0.2, 2.5);
    set({
      viewport: {
        zoom,
        x: w / 2 - ((minX + maxX) / 2) * zoom,
        y: h / 2 - ((minY + maxY) / 2) * zoom,
      },
    });
  },
  setSidebarTab: (t) => set({ sidebarTab: t }),
  setRightTab: (t) => set({ rightTab: t }),
  setMobilePanel: (p) => set({ mobilePanel: p }),
  toggleMobilePanel: (p) => set({ mobilePanel: get().mobilePanel === p ? 'none' : p }),
  toggleDesktopPanel: (side) => set({ desktopPanels: { ...get().desktopPanels, [side]: !get().desktopPanels[side] } }),
  setTool: (t) => set({ tool: t }),
  setFullscreenCard: (id) => set({ fullscreenCardId: id, editingCardId: id ? null : get().editingCardId }),
  toggleGlobalLock: () => set({ globalLock: !get().globalLock }),
  addAnnotation: (a) => set({ annotations: { ...get().annotations, [a.id]: a } }),
  deleteAnnotation: (id) => {
    const annotations = { ...get().annotations };
    delete annotations[id];
    set({ annotations });
  },
  clearAnnotations: () => set({ annotations: {} }),
  createGroup: (ids, name) => {
    const st = get();
    // 稳定性：编组总数上限守卫
    {
      const m = exceedMsg('group', Object.keys(st.groups).length);
      if (m) { toast(m, 'warn'); return null; }
    }
    // 已属于其它编组的卡片不允许再次编组，避免“组中组 / 重复编组”
    const valid = ids.filter((id) => {
      const c = st.cards[id];
      return c && !c.writingOnly && !c.groupId;
    });
    const skipped = ids.length - valid.length;
    if (!valid.length) {
      toast(skipped ? '所选卡片均已在编组中，无法重复编组' : '没有可编组的卡片', 'warn');
      return null;
    }
    // 稳定性：单个编组承载上限守卫（防止把超大选区一次塞进一个组）
    {
      const m = exceedMsg('groupMember', valid.length);
      if (m) { toast(m, 'warn'); return null; }
    }
    get().pushHistory('编组');
    const gid = uid('grp');
    const groupName = ensureUniqueName(name || `组 ${Object.keys(get().groups).length + 1}`, Object.values(get().groups).map((g) => g.name));
    const group: CardGroup = { id: gid, name: groupName, color: '#00b894', createdAt: Date.now(), order: Object.keys(get().groups).length };
    const cards = { ...get().cards };
    for (const id of valid) cards[id] = { ...cards[id], groupId: gid, updatedAt: Date.now() };
    set({ groups: { ...get().groups, [gid]: group }, cards });
    get().persistNow();
    toast(skipped ? `已编组 ${valid.length} 张卡片，已忽略 ${skipped} 张已在其它编组的卡片` : `已编组 ${valid.length} 张卡片`, 'ok');
    return gid;
  },
  createVolume: (name) => {
    const st = get();
    const gid = uid('grp');
    const volName = ensureUniqueName(name || `第 ${Object.values(st.groups).filter((g) => g.writingOnly).length + 1} 卷`, Object.values(st.groups).map((g) => g.name));
    const group: CardGroup = { id: gid, name: volName, color: '#6a5cf5', createdAt: Date.now(), order: Object.keys(st.groups).length, writingOnly: true };
    set({ groups: { ...st.groups, [gid]: group } });
    get().persistNow();
    toast(`已新建卷「${volName}」`, 'ok');
    return gid;
  },
  dissolveGroup: (gid) => {
    get().pushHistory('解散编组');
    const cards = { ...get().cards };
    for (const c of Object.values(cards)) {
      if (c.groupId === gid) cards[c.id] = { ...c, groupId: undefined, updatedAt: Date.now() };
    }
    const groups = { ...get().groups };
    delete groups[gid];
    set({ groups, cards, selectedGroupId: get().selectedGroupId === gid ? null : get().selectedGroupId });
    get().persistNow();
    toast('已解散编组', 'warn');
  },
  updateGroupName: (gid, name) => {
    if (shouldPushEditHistory()) get().pushHistory('重命名编组');
    const groups = { ...get().groups };
    if (groups[gid]) groups[gid] = { ...groups[gid], name };
    set({ groups });
  },
  updateGroup: (gid, patch) => {
    if (shouldPushEditHistory()) get().pushHistory('编辑编组');
    const groups = { ...get().groups };
    if (groups[gid]) groups[gid] = { ...groups[gid], ...patch };
    set({ groups });
    get().persistNow();
  },
  lockGroup: (gid, locked) => {
    get().pushHistory(locked ? '锁定编组' : '解锁编组');
    const cards = { ...get().cards };
    const ts = Date.now();
    for (const c of Object.values(cards)) {
      if (!c.writingOnly && c.groupId === gid) cards[c.id] = { ...c, locked, updatedAt: ts };
    }
    set({ cards });
    get().persistNow();
    toast(locked ? '已锁定组内全部卡片位置' : '已解锁组内卡片', locked ? 'ok' : 'warn');
  },
  groupIdsOf: (ids) => {
    const set = new Set<string>();
    for (const id of ids) {
      const gid = get().cards[id]?.groupId;
      if (gid) set.add(gid);
    }
    return [...set];
  },
  duplicateGroup: (gid) => {
    const st = get();
    const src = st.groups[gid];
    if (!src || src.writingOnly) return null;
    // 组内全部可复制卡片（跳过正文卷卡，仅画布卡）
    const srcCards = Object.values(st.cards).filter((c) => !c.writingOnly && c.groupId === gid);
    if (!srcCards.length) {
      toast('该编组没有可复制的卡片', 'warn');
      return null;
    }
    get().pushHistory(`复制编组「${src.name}」`);
    const ts = Date.now();
    const ngid = uid('grp');
    const newName = ensureUniqueName(`${src.name} 副本`, Object.values(st.groups).map((g) => g.name));
    const group: CardGroup = { ...structuredClone(src), id: ngid, name: newName, createdAt: ts, order: Object.keys(st.groups).length, collapsed: false };
    const cards = { ...st.cards };
    const edges = { ...st.edges };
    const idMap: Record<string, string> = {};
    const newCardIds: string[] = [];
    // ---- 编组复制自动避让：计算不与源组及任何既有编组框重叠的落点偏移 ----
    const PAD_ = 14;                    // 与画布 groupBoxes 一致的框内边距
    const GAP_ = 32;                    // 框与框之间的最小视觉间隙（世界单位）
    const STEP_ = 40;                 // 逐格搜索步长，保证普通密度下可快速收敛
    // 源组包围盒（世界坐标，含 ±PAD_）
    const srcMinX = Math.min(...srcCards.map((c) => c.x)) - PAD_;
    const srcMinY = Math.min(...srcCards.map((c) => c.y)) - PAD_;
    const srcMaxX = Math.max(...srcCards.map((c) => c.x + c.w)) + PAD_;
    const srcMaxY = Math.max(...srcCards.map((c) => c.y + c.h)) + PAD_;
    const srcW = srcMaxX - srcMinX, srcH = srcMaxY - srcMinY;
    // 其余真实编组的包围盒（与 groupBoxes 同规则：跳过正文卷 & 少于 2 张卡不绘框）
    const occBoxes: Array<[number, number, number, number]> = [];
    for (const g of Object.values(st.groups)) {
      if (g.id === gid || g.writingOnly) continue;
      const list = Object.values(st.cards).filter((c) => !c.writingOnly && c.groupId === g.id);
      if (list.length < 2) continue;
      const bx = Math.min(...list.map((c) => c.x)) - PAD_;
      const by = Math.min(...list.map((c) => c.y)) - PAD_;
      const bx2 = Math.max(...list.map((c) => c.x + c.w)) + PAD_;
      const by2 = Math.max(...list.map((c) => c.y + c.h)) + PAD_;
      occBoxes.push([bx, by, bx2 - bx, by2 - by]);
    }
    // 参与碰撞检测的占用区：源组自身 + 其余组（副本不能与它们任何一侧交叠）
    const colliders: Array<[number, number, number, number]> = [[srcMinX, srcMinY, srcW, srcH], ...occBoxes];
    const collides = (ox: number, oy: number) => {
      const dx0 = srcMinX + ox, dy0 = srcMinY + oy, dx1 = dx0 + srcW, dy1 = dy0 + srcH;
      for (const [bx, by, bw, bh] of colliders) {
        if (dx0 < bx + bw && bx < dx1 && dy0 < by + bh && by < dy1) return true;
      }
      return false;
    };
    // 生成候选落点：优先正下方 → 正右方 → 沿右/下边界向外逐格扩散，取第一个不碰撞的空位
    let offX = srcW + GAP_, offY = srcH + GAP_, found = false;
    const tryPos = (ox: number, oy: number): boolean => {
      if (collides(ox, oy)) return false;
      offX = ox; offY = oy; found = true; return true;
    };
    // ① 正下方（副本框顶贴住源框底的间隙下方）
    tryPos(0, srcH + GAP_);
    // ② 正右方
    if (!found) tryPos(srcW + GAP_, 0);
    // ③ 从源框右下向外扩散（跨越多层障碍时的兜底）
    if (!found) {
      outer: for (let r = 1; r <= 30; r++) {
        for (let k = 0; k <= r; k++) {          // 沿源框底下方扩张：逐渐向右下扫
          if (tryPos(k * STEP_, (srcH + GAP_) + (r - k) * STEP_)) break outer;
        }
        for (let k = 1; k <= r; k++) {          // 沿源框右侧下方扩张
          if (tryPos((srcW + GAP_) + (r - 1) * STEP_ + (k - 1) * STEP_, (k - 1) * STEP_)) break outer;
        }
      }
      // 极端的兜底（保持初始的右下基线偏移，几乎不可能被触到）
    }
    // ---- 避让计算结束 ----
    for (const c of srcCards) {
      const nid = uid('card');
      idMap[c.id] = nid;
      const nc: Card = { ...structuredClone(c), id: nid, groupId: ngid, x: c.x + offX, y: c.y + offY, title: c.title ? `${c.title} 副本` : '', createdAt: ts, updatedAt: ts, by: getClientId() };
      cards[nid] = nc;
      newCardIds.push(nid);
    }
    const newEdges: Edge[] = [];
    for (const e of Object.values(st.edges)) {
      if (idMap[e.from] && idMap[e.to]) {
        const ne: Edge = { ...structuredClone(e), id: uid('edge'), from: idMap[e.from], to: idMap[e.to], createdAt: ts, updatedAt: ts };
        edges[ne.id] = ne;
        newEdges.push(ne);
      }
    }
    set({ groups: { ...st.groups, [ngid]: group }, cards, edges, selectedGroupId: ngid, selection: [], edgeSelection: [], zTop: st.zTop + newCardIds.length });
    get().persistNow();
    toast(`已复制编组「${newName}」（${newCardIds.length} 张卡片）`, 'ok');
    const ops: Op[] = newCardIds.map((nid) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: cards[nid] } }));
    ops.push(...newEdges.map((e) => ({ id: uid('op'), client: getClientId(), ts, type: 'edge.upsert' as const, payload: { edge: e } })));
    emitOps(ops);
    return ngid;
  },
setSectionFilter: (f) => set({ sectionFilter: f }),
  setEditingCard: (id) => set({ editingCardId: id, lastEditExit: id === null ? Date.now() : get().lastEditExit }),
  setServerStatus: (s) => set({ serverStatus: s }),
  setPeers: (p) => set({ peers: p }),
  updatePeer: (id, patch) => {
    const peers = { ...get().peers };
    const cur = peers[id];
    if (!cur) return;
    peers[id] = { ...cur, ...patch, lastSeen: Date.now() };
    set({ peers });
  },

  createProject: (type, name, withSample, cover) => {
    const now = Date.now();
    const id = uid('proj');
    const baseName = (name || '').trim() || `${PROJECT_TYPE_LABEL[type]} · 未命名`;
    const finalName = ensureUniqueName(baseName, get().projects.map((p) => p.name));
    const meta: ProjectMeta = { id, name: finalName, type, createdAt: now, updatedAt: now, ...(cover ? { cover } : {}) };
      logInfo('store', 'createProject', { id, type, name: meta.name, withSample });
      logOp(`新建项目「${meta.name}」`);
    const sections = buildSectionsForType(type);
    let cards: Record<string, Card> = {};
    let edges: Record<string, Edge> = {};
    if (withSample) {
      const sample = buildSampleProject(type, sections);
      cards = sample.cards;
      edges = sample.edges;
    }
    const pageId = uid('page');
    const pages: PageMeta[] = [{ id: pageId, name: '页面 1', emoji: '📄', createdAt: now }];
    initPageStash(id, { [pageId]: { cards, edges, annotations: {}, groups: {} } });
    const projects = [...get().projects.filter((p) => p.id !== id), meta].sort((a, b) => b.updatedAt - a.updatedAt);
    saveProjects(projects);
    set({
      projects,
      projectId: id,
      meta,
      sections,
      pages,
      currentPageId: pageId,
      cards,
      edges,
      annotations: {},
      groups: {},
      manuscript: { ...EMPTY_MANUSCRIPT },
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
      viewport: { x: 60, y: 40, zoom: 1 },
      zTop: Object.keys(cards).length + 2,
    });
    get().persistNow();
    localStorage.setItem(K_CURRENT, id);
    get().fitView();
    return id;
  },

  openProject: (id) => {
    const meta = get().projects.find((p) => p.id === id);
    if (!meta) return;
      logInfo('store', 'openProject', { id, name: meta.name });
      logOp(`打开项目「${meta.name}」`);
    const data = loadProjectData(id);
    if (!data) return;
    // v2.33 一次性迁移：旧版 writingOnly 卡片/编组 → 独立正文 Manuscript（6.6）
    let manuscript = data.manuscript || { ...EMPTY_MANUSCRIPT };
    let pages = data.pages;
    let migratedMeta = meta;
    let projects = get().projects;
    if (!meta.manuscriptMigrated) {
      // 旧版正文回收站中的章节一并转入正文废纸篓（6.2.6）
      const legacyTrashCards = loadWriteTrashCards(id, data.pageOrder[0].id);
      const trash = legacyTrashCards.map((c, i) => ({
        chapter: {
          id: c.id || `ms_${i}`, volumeId: c.groupId || undefined, title: c.title || '未命名章节',
          content: c.content || null, order: c.order ?? i, createdAt: c.createdAt, updatedAt: c.updatedAt || c.createdAt,
        },
        deletedAt: Date.now(),
      }));
      const mig = migrateManuscriptFromPages(pages, { ...manuscript, trash: trash.length ? trash : manuscript.trash });
      pages = mig.pages;
      manuscript = mig.manuscript;
      migratedMeta = { ...meta, manuscriptMigrated: true };
      projects = projects.map((x) => (x.id === id ? migratedMeta : x));
      saveProjects(projects);
        logInfo('store', 'migrateManuscript', { id, volumes: manuscript.volumes.length, chapters: manuscript.chapters.length });
    }
    const first = data.pageOrder[0];
    const pageData = pages[first.id] || { cards: {}, edges: {}, annotations: {}, groups: {} };
    initPageStash(id, pages);
    set({
      projects,
      projectId: id,
      meta: migratedMeta,
      sections: data.sections,
      pages: data.pageOrder,
      currentPageId: first.id,
      cards: pageData.cards,
      edges: pageData.edges,
      annotations: pageData.annotations || {},
      groups: pageData.groups || {},
      manuscript,
      pageTrash: loadPageTrash(id),
      trashCards: loadTrashCards(id, first.id),
      writeTrashCards: [],
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
      viewport: { x: 60, y: 40, zoom: 1 },
      zTop: Math.max(1, ...Object.values(pageData.cards).map((c) => c.z || 0)) + 1,
    });
    localStorage.setItem(K_CURRENT, id);
    get().fitView();
  },

      
  closeProject: () => {
    if (!get().projectId) return;
      logInfo('store', 'closeProject', { id: get().projectId });
    get().persistNow();
    import('./sync/ws').then((m) => m.disconnect()).catch(() => { /* ignore */ });
    set({
      projectId: null,
      meta: null,
      sections: [],
      pages: [],
      currentPageId: '',
      cards: {},
      edges: {},
      annotations: {},
      groups: {},
      manuscript: { ...EMPTY_MANUSCRIPT },
      pageTrash: [],
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      fullscreenCardId: null,
      modal: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
    });
    try {
      localStorage.removeItem(K_CURRENT);
    } catch { /* ignore */ }
    toast('已关闭项目，返回欢迎页', 'info');
  },

  deleteProject: (id) => {
    // 移入回收站（保留数据可恢复）
    const meta = get().projects.find((p) => p.id === id);
    if (!meta) return;
      logInfo('store', 'deleteProject', { id, name: meta.name });
    get().persistNow();
    const data = (() => {
      try {
        const raw = localStorage.getItem(K_PROJECT(id));
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })() || { sections: get().sections, pageOrder: get().pages, pages: pageStash[id] || {} };
    const trashProjects = [...get().trashProjects.filter((t) => t.meta.id !== id), { meta, data }];
    saveTrash(trashProjects);
    const projects = get().projects.filter((p) => p.id !== id);
    saveProjects(projects);
    delete pageStash[id];
    try {
      localStorage.removeItem(K_PROJECT(id));
    } catch { /* ignore */ }
    if (get().projectId === id) {
      set({
        projectId: null,
        meta: null,
        sections: [],
        pages: [],
        currentPageId: '',
        cards: {},
        edges: {},
        annotations: {},
        groups: {},
        selection: [],
        edgeSelection: [],
        history: [],
        historyIdx: -1,
        redoStack: [],
      });
      localStorage.removeItem(K_CURRENT);
    }
    set({ projects, trashProjects });
    toast(`项目「${meta.name}」已移入回收站`, 'warn');
  },

  restoreProject: (id) => {
    const item = get().trashProjects.find((t) => t.meta.id === id);
    if (!item) return;
      logInfo('store', 'restoreProject', { id, name: item.meta.name });
    try {
      localStorage.setItem(K_PROJECT(id), JSON.stringify(item.data));
    } catch { /* ignore */ }
    const projects = [...get().projects.filter((p) => p.id !== id), item.meta].sort((a, b) => b.updatedAt - a.updatedAt);
    saveProjects(projects);
    const trashProjects = get().trashProjects.filter((t) => t.meta.id !== id);
    saveTrash(trashProjects);
    set({ projects, trashProjects });
    toast(`已恢复项目「${item.meta.name}」`, 'ok');
  },

  purgeProject: async (id) => {
    const item = get().trashProjects.find((t) => t.meta.id === id);
    if (!await csConfirm(`彻底删除项目「${item?.meta.name || id}」？此操作不可恢复。`)) return;
    try {
      localStorage.removeItem(K_PROJECT(id));
    } catch { /* ignore */ }
    const trashProjects = get().trashProjects.filter((t) => t.meta.id !== id);
    saveTrash(trashProjects);
    set({ trashProjects });
    toast('项目已彻底删除', 'warn');
  },

  renameProject: (name) => {
    const meta = get().meta;
    if (!meta) return;
    const nm = { ...meta, name, updatedAt: Date.now() };
    const projects = get().projects.map((p) => (p.id === meta.id ? nm : p));
    saveProjects(projects);
    set({ meta: nm, projects });
    emitOps([{ id: uid('op'), client: getClientId(), ts: Date.now(), type: 'meta', payload: { meta: nm } }]);
  },

  patchMeta: (patch) => {
    const meta = get().meta;
    if (!meta) return;
    const nm = { ...meta, ...patch, updatedAt: Date.now() };
    const projects = get().projects.map((p) => (p.id === meta.id ? nm : p));
    saveProjects(projects);
    set({ meta: nm, projects });
    emitOps([{ id: uid('op'), client: getClientId(), ts: Date.now(), type: 'meta', payload: { meta: nm } }]);
  },
  renameProjectMeta: (id, name) => {
    const projects = get().projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
    saveProjects(projects);
    set({ projects });
  },

  importProjectState: (state) => {
    const projects = [...get().projects.filter((p) => p.id !== state.meta.id), state.meta];
    saveProjects(projects);
    const { pageOrder, pageData, firstPageId } = pagesFromState(state);
    // v2.33 迁移：导入的旧格式项目同样把 writingOnly 卡片迁入独立正文
    let meta = state.meta;
    let manuscript: Manuscript = (state as unknown as { manuscript?: Manuscript }).manuscript || { ...EMPTY_MANUSCRIPT };
    let cleanPages = pageData;
    if (!meta.manuscriptMigrated) {
      const mig = migrateManuscriptFromPages(pageData, manuscript);
      cleanPages = mig.pages;
      manuscript = mig.manuscript;
      meta = { ...meta, manuscriptMigrated: true };
    }
    initPageStash(state.meta.id, cleanPages);
    const first = cleanPages[firstPageId] || { cards: {}, edges: {}, annotations: {}, groups: {} };
    set({
      projects: projects.map((x) => (x.id === meta.id ? meta : x)),
      projectId: state.meta.id,
      meta,
      sections: state.sections,
      pages: pageOrder,
      currentPageId: firstPageId,
      cards: first.cards,
      edges: first.edges,
      annotations: first.annotations || {},
      groups: first.groups || {},
      manuscript,
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
      viewport: { x: 60, y: 40, zoom: 1 },
      zTop: Math.max(1, ...Object.values(first.cards).map((c) => c.z || 0)) + 1,
    });
    localStorage.setItem(K_CURRENT, state.meta.id);
    get().persistNow();
    get().fitView();
  },

  // ---- 页面 ----
  addPage: (name, emoji) => {
    const now = Date.now();
    const pid = uid('page');
    const page: PageMeta = { id: pid, name: name || `页面 ${get().pages.length + 1}`, emoji: emoji || '📄', createdAt: now };
    stashCurrentPage();
    if (!pageStash[get().projectId!]) pageStash[get().projectId!] = {};
    pageStash[get().projectId!][pid] = { cards: {}, edges: {}, annotations: {}, groups: {} };
    set({
      pages: [...get().pages, page],
      currentPageId: pid,
      cards: {},
      edges: {},
      annotations: {},
      groups: {},
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
      zTop: 2,
    });
    get().persistNow();
    toast(`已新建页面「${page.name}」`, 'ok');
    return pid;
  },

  switchPage: (id) => {
    if (id === get().currentPageId) return;
    if (!get().pages.some((p) => p.id === id)) return;
    stashCurrentPage();
    const data = pageStash[get().projectId!]?.[id] || { cards: {}, edges: {}, annotations: {}, groups: {} };
    set({
      currentPageId: id,
      cards: data.cards,
      edges: data.edges,
      annotations: data.annotations || {},
      groups: data.groups || {},
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      fullscreenCardId: null,
      trashCards: loadTrashCards(get().projectId || 'x', id),
      writeTrashCards: [],
      aiHistory: loadAiHistory(get().projectId || 'x', id),
      history: [],
      historyIdx: -1,
      redoStack: [],
      viewport: { x: 60, y: 40, zoom: 1 },
      zTop: Math.max(1, ...Object.values(data.cards).map((c) => c.z || 0)) + 1,
    });
    get().persistNow();
    get().fitView();
  },

  renamePage: (id, name) => {
    if (!name.trim()) return;
    set({ pages: get().pages.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) });
    get().persistNow();
  },

  removePage: async (id) => {
    const pages = get().pages;
    if (pages.length <= 1) {
      toast('至少保留一个页面', 'warn');
      return;
    }
    const page = pages.find((p) => p.id === id);
    if (!page) return;
    stashCurrentPage(); // 先把当前页内存数据落暂存，避免删除当前页时数据丢失
    const pid = get().projectId!;
    const pageData = pageStash[pid]?.[id] || { cards: {}, edges: {}, annotations: {}, groups: {} };
    const count = Object.keys(pageData.cards || {}).length;
    if (count > 0 && !await csConfirm(`删除页面「${page.name}」？该页 ${count} 张卡片与连线将一并删除。`)) return;
    // 入页面回收站（可恢复，铁律 5）
    const trash = [{ meta: page, data: pageData, deletedAt: Date.now() }, ...get().pageTrash].slice(0, 20);
    savePageTrash(pid, trash);
    set({ pageTrash: trash });
    const next = pages.filter((p) => p.id !== id);
    delete pageStash[pid]?.[id];
    if (get().currentPageId === id) {
      // 切到相邻页面
      const idx = pages.findIndex((p) => p.id === id);
      const target = next[Math.max(0, idx - 1)];
      const data = pageStash[get().projectId!]?.[target.id] || { cards: {}, edges: {}, annotations: {}, groups: {} };
      set({
        pages: next,
        currentPageId: target.id,
        cards: data.cards,
        edges: data.edges,
        annotations: data.annotations || {},
        groups: data.groups || {},
        selection: [],
        edgeSelection: [],
        editingCardId: null,
        history: [],
        historyIdx: -1,
        redoStack: [],
        viewport: { x: 60, y: 40, zoom: 1 },
        zTop: Math.max(1, ...Object.values(data.cards).map((c) => c.z || 0)) + 1,
      });
    } else {
      set({ pages: next });
    }
    get().persistNow();
    toast(`已删除页面「${page.name}」（可在页面菜单底部恢复）`, 'warn');
  },

  restorePage: (trashIdx) => {
    const pid = get().projectId;
    if (!pid) return;
    const item = get().pageTrash[trashIdx];
    if (!item) return;
    if (!pageStash[pid]) pageStash[pid] = {};
    pageStash[pid][item.meta.id] = item.data;
    const page: PageMeta = item.meta;
    const trash = get().pageTrash.filter((_, i) => i !== trashIdx);
    savePageTrash(pid, trash);
    set({ pageTrash: trash, pages: [...get().pages, page] });
    get().persistNow();
    toast(`已恢复页面「${page.name}」`, 'ok');
  },
  purgePage: (trashIdx) => {
    const pid = get().projectId;
    if (!pid) return;
    const item = get().pageTrash[trashIdx];
    if (!item) return;
    delete pageStash[pid]?.[item.meta.id];
    const trash = get().pageTrash.filter((_, i) => i !== trashIdx);
    savePageTrash(pid, trash);
    set({ pageTrash: trash });
    toast(`已彻底删除页面「${item.meta.name}」`, 'warn');
  },
  clearPageTrash: () => {
    const pid = get().projectId;
    if (!pid) return;
    for (const item of get().pageTrash) delete pageStash[pid]?.[item.meta.id];
    savePageTrash(pid, []);
    set({ pageTrash: [] });
    toast('已清空页面回收站', 'warn');
  },

  // ---- 项目文件夹 ----
  addFolder: (name) => {
    const fid = uid('fld');
    const folders = [...get().folders, { id: fid, name: name.trim() || '新建文件夹', createdAt: Date.now() }];
    saveFolders(folders);
    set({ folders });
    return fid;
  },
  renameFolder: (id, name) => {
    if (!name.trim()) return;
    const folders = get().folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f));
    saveFolders(folders);
    set({ folders });
  },
  deleteFolder: (id) => {
    const folders = get().folders.filter((f) => f.id !== id);
    const projects = get().projects.map((p) => (p.folderId === id ? { ...p, folderId: undefined } : p));
    saveFolders(folders);
    saveProjects(projects);
    const m = get().meta;
    set({
      folders,
      projects,
      meta: m && m.folderId === id ? { ...m, folderId: undefined } : m,
    });
  },
  setProjectFolder: (projectId, folderId) => {
    const projects = get().projects.map((p) => (p.id === projectId ? { ...p, folderId: folderId || undefined } : p));
    saveProjects(projects);
    const m = get().meta;
    set({
      projects,
      meta: m && m.id === projectId ? { ...m, folderId: folderId || undefined } : m,
    });
  },

  exportStateForSync: () => {
    const s = get();
    if (!s.meta) return null;
    stashCurrentPage();
    const pages: ProjectState['pages'] = {};
    for (const p of s.pages) {
      const d = pageStash[s.projectId!]?.[p.id] || { cards: {}, edges: {}, annotations: {}, groups: {} };
      pages[p.id] = { cards: d.cards, edges: d.edges, annotations: d.annotations, groups: d.groups };
    }
    return { meta: s.meta, sections: s.sections, cards: s.cards, edges: s.edges, pages, pageOrder: s.pages, manuscript: s.manuscript } as ProjectState;
  },

  // ---------- 独立正文（Manuscript，6.1 / 6.6） ----------
  msAddVolume: (name) => {
    const ms = get().manuscript;
    const vol: ManuscriptVolume = {
      id: uid('vol'),
      name: ensureUniqueName(name || `第 ${ms.volumes.length + 1} 卷`, ms.volumes.map((v) => v.name)),
      order: ms.volumes.length,
      createdAt: Date.now(),
    };
    set({ manuscript: { ...ms, volumes: [...ms.volumes, vol] } });
    schedulePersist();
    return vol.id;
  },
  msUpdateVolume: (id, patch) => {
    const ms = get().manuscript;
    set({ manuscript: { ...ms, volumes: ms.volumes.map((v) => (v.id === id ? { ...v, ...patch } : v)) } });
    schedulePersist();
  },
  msRemoveVolume: (id, withChapters) => {
    const ms = get().manuscript;
    if (withChapters) {
      const ids = ms.chapters.filter((c) => c.volumeId === id).map((c) => c.id);
      get().msDeleteChapters(ids);
      set({ manuscript: { ...get().manuscript, volumes: get().manuscript.volumes.filter((v) => v.id !== id).map((v, i) => ({ ...v, order: i })) } });
      return;
    }
    // 章节移到未分卷（删卷可选，6.1）
    set({ manuscript: { ...ms, volumes: ms.volumes.filter((v) => v.id !== id).map((v, i) => ({ ...v, order: i })), chapters: ms.chapters.map((c) => (c.volumeId === id ? { ...c, volumeId: undefined } : c)) } });
    schedulePersist();
  },
  msMoveVolume: (id, dir) => {
    const ms = get().manuscript;
    const list = [...ms.volumes].sort((a, b) => a.order - b.order);
    const idx = list.findIndex((v) => v.id === id);
    const t = idx + dir;
    if (idx < 0 || t < 0 || t >= list.length) return;
    [list[idx], list[t]] = [list[t], list[idx]];
    set({ manuscript: { ...ms, volumes: list.map((v, i) => ({ ...v, order: i })) } });
    schedulePersist();
  },
  msAddChapter: (partial) => {
    logOp('正文新建章节');
    const ms = get().manuscript;
    const volId = partial?.volumeId;
    const siblings = ms.chapters.filter((c) => (c.volumeId || '') === (volId || ''));
    const nums = siblings.map((c) => { const m = /^第\s*(\d+)\s*章/.exec(c.title || ''); return m ? +m[1] : 0; });
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const now = Date.now();
    const ch: ManuscriptChapter = {
      id: uid('ch'),
      volumeId: volId || undefined,
      title: partial?.title?.trim() || `第 ${n}章`,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      order: siblings.length,
      createdAt: now,
      updatedAt: now,
    };
    set({ manuscript: { ...ms, chapters: [...ms.chapters, ch] } });
    schedulePersist();
    return ch.id;
  },
  msUpdateChapter: (id, patch) => {
    const ms = get().manuscript;
    set({ manuscript: { ...ms, chapters: ms.chapters.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)) } });
    schedulePersist();
  },
  msMoveChapter: (id, dir) => {
    const ms = get().manuscript;
    const ch = ms.chapters.find((c) => c.id === id);
    if (!ch) return;
    const list = ms.chapters.filter((c) => (c.volumeId || '') === (ch.volumeId || '')).sort((a, b) => a.order - b.order);
    const idx = list.findIndex((c) => c.id === id);
    const t = idx + dir;
    if (idx < 0 || t < 0 || t >= list.length) return;
    [list[idx], list[t]] = [list[t], list[idx]];
    const orderMap = new Map(list.map((c, i) => [c.id, i]));
    set({ manuscript: { ...ms, chapters: ms.chapters.map((c) => (orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c)) } });
    schedulePersist();
  },
  msDeleteChapters: (ids) => {
    if (!ids.length) return;
    logOp(`正文删除 ${ids.length} 章（进正文回收站）`);
    const ms = get().manuscript;
    const removed = ms.chapters.filter((c) => ids.includes(c.id));
    // 正文回收站容量 60，超出淘汰最旧（与旧版 writeTrash 一致）
    const trash = [...removed.map((chapter) => ({ chapter, deletedAt: Date.now() })), ...ms.trash].slice(0, 60);
    set({ manuscript: { ...ms, chapters: ms.chapters.filter((c) => !ids.includes(c.id)), trash } });
    schedulePersist();
  },
  msRestoreChapter: (trashIdx) => {
    const ms = get().manuscript;
    const item = ms.trash[trashIdx];
    if (!item) return;
    const siblings = ms.chapters.filter((c) => (c.volumeId || '') === (item.chapter.volumeId || ''));
    set({ manuscript: { ...ms, trash: ms.trash.filter((_, i) => i !== trashIdx), chapters: [...ms.chapters, { ...item.chapter, order: siblings.length }] } });
    schedulePersist();
    toast('章节已恢复到目录', 'ok');
  },
  msPurgeChapter: (trashIdx) => {
    const ms = get().manuscript;
    set({ manuscript: { ...ms, trash: ms.trash.filter((_, i) => i !== trashIdx) } });
    schedulePersist();
  },
  msClearMsTrash: () => {
    set({ manuscript: { ...get().manuscript, trash: [] } });
    schedulePersist();
  },

  addCard: (partial, opts) => {
    // 稳定性：卡片总数上限守卫（达上限则不再新建）
    {
      const cur = Object.keys(get().cards).length;
      const m = exceedMsg('card', cur);
      if (m) { toast(m, 'warn'); return ''; }
    }
    logOp(`新建卡片「${partial.title || '未命名'}」`);
    const vp = get().viewport;
    const isImage = partial.kind === 'image';
    // 默认 A4 纸比例卡片（170×240，210:297），画布卡片即纸张比例
    const defaultW = isImage ? 320 : 170;
    const defaultH = isImage ? 260 : 240;
    const w = partial.w ?? defaultW;
    const ratio = paperRatio({ kind: partial.kind || 'note', paper: partial.paper ?? 'a4', mode: partial.mode });
    const h = partial.h ?? (ratio ? Math.round(w / ratio) : defaultH);
    const x = opts?.center ? vp.x + (window.innerWidth / 2 - w / 2) / vp.zoom : partial.x ?? vp.x + 40;
    const y = opts?.center ? vp.y + (window.innerHeight / 2 - h / 2) / vp.zoom : partial.y ?? vp.y + 40;
    const now = Date.now();
    const kind = partial.kind || 'note';
    const kindLabel = kind === 'image' ? '图片' : kind === 'note' ? '便签' : kind;
    const existingTitles = Object.values(get().cards).map((c) => c.title);
    // 新建卡片默认命名：便签卡N / 图片卡N，用于区分多张同名卡片
    const finalTitle = partial.title
      ? ensureUniqueName(partial.title, existingTitles)
      : ensureUniqueName(`${kindLabel}卡${Object.values(get().cards).filter((c) => c.kind === kind).length + 1}`, existingTitles);
    const card: Card = {
      id: partial.id || uid('card'),
      kind: 'note',
      sectionId: '',
      content: emptyDoc(),
      x,
      y,
      w,
      h,
      z: 0,
      createdAt: now,
      updatedAt: now,
      ...partial,
      // 便签卡统一 A4 纸比例（画布卡片即 A4 纸张）
      ...(isImage ? {} : { paper: partial.paper ?? 'a4' }),
      // 新建卡片默认命名（便签卡N / 图片卡N），有标题则不重复时自动追加序号
      title: finalTitle,
    };
    if (opts?.op !== false) get().pushHistory(`新建卡片「${partial.title || '未命名'}」`);
    const zTop = get().zTop + 1;
    card.z = zTop;
    set({ cards: { ...get().cards, [card.id]: card }, zTop });
    get().persistNow();
    if (opts?.op !== false) {
      emitOps([{ id: uid('op'), client: getClientId(), ts: now, type: 'card.upsert', payload: { card } }]);
    }
    return card.id;
  },

  addCardsAt: (cards, opts) => {
    if (!cards.length) return;
    if (opts?.op !== false) get().pushHistory(`插入 ${cards.length} 张卡片`);
    const merged = { ...get().cards };
    // 新插入的卡片统一置顶（模板/分支节点等不会压在旧卡片下面）
    let z = get().zTop;
    for (const c of cards) {
      z += 1;
      merged[c.id] = { ...c, z };
    }
    set({ cards: merged, zTop: z });
    get().persistNow();
    if (opts?.op !== false) {
      const ts = Date.now();
      emitOps(cards.map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: merged[c.id] || c } })));
    }
  },

  addImageCard: (imageSrc, x, y, w, h) => {
    const id = get().addCard({
      kind: 'image',
      imageSrc,
      imageFit: 'contain',
      title: '',
      w: w || 320,
      h: h || 260,
      content: null,
      x,
      y,
    });
    return id;
  },

  /** 一卡两面翻面（3.4）：kind 只切换当前显示的面，另一面内容原样保留 */
  setCardKind: (id, kind) => {
    const c = get().cards[id];
    if (!c || c.kind === kind) return;
    get().pushHistory(kind === 'image' ? '翻到图片面' : '翻到文字面');
    const updated: Card = { ...c, kind, updatedAt: Date.now() };
    if (kind === 'image') {
      updated.imageSrc = c.imageSrc || IMG_PLACEHOLDER;
      updated.imageFit = c.imageFit || 'contain';
    } else {
      updated.content = c.content || emptyDoc();
    }
    set({ cards: { ...get().cards, [id]: updated } });
    get().persistNow();
    toast(kind === 'image' ? '已翻到反面（图片面）' : '已翻到正面（文字面）', 'ok');
  },

  updateCard: (id, patch, opts) => {
    const card = get().cards[id];
    if (!card) return;
    if (opts?.op !== false && shouldPushEditHistory()) get().pushHistory(describeCardPatch(patch));
    const updated = { ...card, ...patch, updatedAt: Date.now(), by: getClientId() };
    set({ cards: { ...get().cards, [id]: updated } });
    schedulePersist();
    if (opts?.op !== false) {
      emitOps([{ id: uid('op'), client: getClientId(), ts: updated.updatedAt, type: 'card.upsert', payload: { card: updated } }]);
    }
  },

  updateCards: (ids, patch, opts) => {
    if (opts?.op !== false && shouldPushEditHistory()) get().pushHistory(`批量${describeCardPatch(patch)}`);
    const cards = { ...get().cards };
    const ts = Date.now();
    const changed: Card[] = [];
    for (const id of ids) {
      if (!cards[id]) continue;
      cards[id] = { ...cards[id], ...patch, updatedAt: ts, by: getClientId() };
      changed.push(cards[id]);
    }
    if (!changed.length) return;
    set({ cards });
    schedulePersist();
    if (opts?.op !== false) {
      emitOps(changed.map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: c } })));
    }
  },

  setCardsLocal: (next) => {
    set({ cards: { ...get().cards, ...next } });
    schedulePersist(800);
  },

  emitCardPatches: (patches) => {
    const ids = Object.keys(patches);
    if (!ids.length) return;
    if (shouldPushEditHistory()) get().pushHistory(describeCardPatch(Object.values(patches)[0] as Partial<Card>));
    const cards = { ...get().cards };
    const ts = Date.now();
    const changed: Card[] = [];
    for (const id of ids) {
      if (!cards[id]) continue;
      cards[id] = { ...cards[id], ...patches[id], updatedAt: ts, by: getClientId() };
      changed.push(cards[id]);
    }
    if (!changed.length) return;
    set({ cards });
    schedulePersist();
    emitOps(changed.map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: c } })));
  },

  applyPositions: (patches) => {
    const ids = Object.keys(patches);
    if (!ids.length) return;
    if (shouldPushEditHistory()) get().pushHistory('移动/缩放卡片');
    const cards = { ...get().cards };
    const ts = Date.now();
    const changed: Card[] = [];
    for (const id of ids) {
      if (!cards[id]) continue;
      cards[id] = { ...cards[id], ...patches[id], updatedAt: ts, by: getClientId() };
      changed.push(cards[id]);
    }
    set({ cards });
    get().persistNow();
    emitOps(changed.map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: c } })));
  },

  deleteCards: (ids) => {
    logOp(`删除 ${ids.length} 张卡片（进回收站）`);
    const idSet = new Set(ids);
    if (!idSet.size) return;
    const deletedNames = ids.map((id) => get().cards[id]?.title).filter(Boolean).slice(0, 3).join('、');
    get().pushHistory(deletedNames ? `删除卡片「${deletedNames}」` : `删除 ${ids.length} 张卡片`);
    // 进入回收站（保留内容，可恢复）：正文写作卡进正文回收站，画布卡进卡片回收站
    const moved: Card[] = [];
    const writeMoved: Card[] = [];
    for (const id of idSet) {
      const c = get().cards[id];
      if (c) (c.writingOnly ? writeMoved : moved).push(structuredClone(c));
    }
    if (moved.length) {
      const trashCards = [...moved, ...get().trashCards].slice(0, 60);
      set({ trashCards });
      try {
        localStorage.setItem(K_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(trashCards));
      } catch { /* ignore */ }
    }
    if (writeMoved.length) {
      const writeTrashCards = [...writeMoved, ...get().writeTrashCards].slice(0, 60);
      set({ writeTrashCards });
      try {
        localStorage.setItem(K_WRITE_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(writeTrashCards));
      } catch { /* ignore */ }
    }
    const cards = { ...get().cards };
    const edges = { ...get().edges };
    const removedEdges: string[] = [];
    for (const id of idSet) delete cards[id];
    for (const eid of Object.keys(edges)) {
      if (idSet.has(edges[eid].from) || idSet.has(edges[eid].to)) {
        delete edges[eid];
        removedEdges.push(eid);
      }
    }
    set({
      cards,
      edges,
      selection: get().selection.filter((s) => !idSet.has(s)),
      editingCardId: idSet.has(get().editingCardId || '') ? null : get().editingCardId,
    });
    get().persistNow();
    const ts = Date.now();
    const ops: Op[] = ids.map((id) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.remove', payload: { id } }));
    ops.push(...removedEdges.map((id) => ({ id: uid('op'), client: getClientId(), ts, type: 'edge.remove' as const, payload: { id } })));
    emitOps(ops);
  },

  duplicateCards: (ids) => {
    if (!ids.length) return;
    get().pushHistory(`复制 ${ids.length} 张卡片`);
    const cards = { ...get().cards };
    const ts = Date.now();
    const newIds: string[] = [];
    for (const id of ids) {
      const c = cards[id];
      if (!c) continue;
      const nc: Card = { ...structuredClone(c), id: uid('card'), x: c.x + 30, y: c.y + 30, title: c.title ? `${c.title} 副本` : '', createdAt: ts, updatedAt: ts, by: getClientId() };
      cards[nc.id] = nc;
      newIds.push(nc.id);
    }
    set({ cards, zTop: get().zTop + ids.length, selection: newIds, edgeSelection: [] });
    get().persistNow();
    emitOps(newIds.map((nid) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: cards[nid] } })));
  },

  copySelection: () => {
    const { selection, cards, edges } = get();
    if (!selection.length) return;
    const clip = {
      kind: 'cs-cards' as const,
      cards: selection.map((id) => cards[id]).filter(Boolean),
      edges: Object.values(edges).filter((e) => selection.includes(e.from) && selection.includes(e.to)),
    };
    try {
      navigator.clipboard.writeText(JSON.stringify(clip));
    } catch { /* ignore */ }
  },

  pasteClipboard: () => {
    navigator.clipboard.readText().then((text) => {
      try {
        const clip = JSON.parse(text);
        if (clip.kind !== 'cs-cards' || !Array.isArray(clip.cards)) return;
        get().pushHistory(`粘贴 ${clip.cards.length} 张卡片`);
        const cards = { ...get().cards };
        const ts = Date.now();
        const idMap: Record<string, string> = {};
        const newIds: string[] = [];
        for (const c of clip.cards) {
          const nid = uid('card');
          idMap[c.id] = nid;
          const nc: Card = { ...structuredClone(c), id: nid, x: c.x + 40, y: c.y + 40, updatedAt: ts, by: getClientId() };
          cards[nid] = nc;
          newIds.push(nid);
        }
        const edges = { ...get().edges };
        const newEdges: Edge[] = [];
        for (const e of clip.edges || []) {
          if (!idMap[e.from] || !idMap[e.to]) continue;
          const ne: Edge = { ...structuredClone(e), id: uid('edge'), from: idMap[e.from], to: idMap[e.to], createdAt: ts, updatedAt: ts };
          edges[ne.id] = ne;
          newEdges.push(ne);
        }
        set({ cards, edges, selection: newIds, edgeSelection: [], zTop: get().zTop + newIds.length });
        get().persistNow();
        const ops: Op[] = newIds.map((nid) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert', payload: { card: cards[nid] } }));
        ops.push(...newEdges.map((e) => ({ id: uid('op'), client: getClientId(), ts, type: 'edge.upsert' as const, payload: { edge: e } })));
        emitOps(ops);
      } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
  },

  bringToFront: (id) => {
    get().pushHistory('置顶卡片');
    const z = get().zTop + 1;
    get().updateCard(id, { z }, { op: false });
    set({ zTop: z });
  },

  alignCards: (mode) => {
    const ids = get().selection;
    const cards = ids.map((id) => get().cards[id]).filter(Boolean);
    if (cards.length < 2) return;
    get().pushHistory(`对齐 ${cards.length} 张卡片`);
    const minX = Math.min(...cards.map((c) => c.x));
    const maxX = Math.max(...cards.map((c) => c.x + c.w));
    const minY = Math.min(...cards.map((c) => c.y));
    const maxY = Math.max(...cards.map((c) => c.y + c.h));
    const totalW = cards.reduce((s, c) => s + c.w, 0);
    const totalH = cards.reduce((s, c) => s + c.h, 0);
    const sortedX = [...cards].sort((a, b) => a.x - b.x);
    const sortedY = [...cards].sort((a, b) => a.y - b.y);
    const updates: Record<string, Card> = {};
    cards.forEach((c, i) => {
      let nx = c.x;
      let ny = c.y;
      if (mode === 'left') nx = minX;
      if (mode === 'right') nx = maxX - c.w;
      if (mode === 'hcenter') nx = (minX + maxX) / 2 - c.w / 2;
      if (mode === 'top') ny = minY;
      if (mode === 'bottom') ny = maxY - c.h;
      if (mode === 'vcenter') ny = (minY + maxY) / 2 - c.h / 2;
      if (mode === 'hspace') {
        let acc = minX;
        for (const cc of sortedX) {
          if (cc.id === c.id) { nx = acc; break; }
          acc += cc.w + (maxX - minX - totalW) / (cards.length - 1);
        }
      }
      if (mode === 'vspace') {
        let acc = minY;
        for (const cc of sortedY) {
          if (cc.id === c.id) { ny = acc; break; }
          acc += cc.h + (maxY - minY - totalH) / (cards.length - 1);
        }
      }
      updates[c.id] = { ...c, x: nx, y: ny, updatedAt: Date.now() };
    });
    set({ cards: { ...get().cards, ...updates } });
    get().persistNow();
      const ts = Date.now();
      emitOps(Object.values(updates).map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: c } })));
  },

  addEdge: (from, to, label) => {
    if (from === to) return;
    const st = get();
    // 稳定性：连线总数上限守卫
    {
      const m = exceedMsg('edge', Object.keys(st.edges).length);
      if (m) { toast(m, 'warn'); return; }
    }
    // 连线无“同类才能连”限制：卡片↔卡片、编组↔编组、以及卡片↔编组（把编组当作一张“大卡片”、同处一个层级森林）都允许连线。
    const edges = st.edges;
    // 防止无序重复：同一对元素（不论方向）只允许一条连线
    const dup = Object.values(edges).some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    if (dup) return;
    get().pushHistory('新建连线');
    const now = Date.now();
    const edge: Edge = { id: uid('edge'), from, to, label: label || '', curve: 0.25, lineStyle: 'straight', createdAt: now, updatedAt: now };
    set({ edges: { ...edges, [edge.id]: edge } });
    get().persistNow();
    emitOps([{ id: uid('op'), client: getClientId(), ts: now, type: 'edge.upsert', payload: { edge } }]);
  },

  updateEdge: (id, patch) => {
    const edge = get().edges[id];
    if (!edge) return;
    if (shouldPushEditHistory()) get().pushHistory(describeEdgePatch(patch));
    const updated = { ...edge, ...patch, updatedAt: Date.now() };
    set({ edges: { ...get().edges, [id]: updated } });
    emitOps([{ id: uid('op'), client: getClientId(), ts: Date.now(), type: 'edge.upsert', payload: { edge: updated } }]);
  },

  deleteEdges: (ids) => {
    if (!ids.length) return;
    get().pushHistory(`删除 ${ids.length} 条连线`);
    const edges = { ...get().edges };
    for (const id of ids) delete edges[id];
    set({ edges, edgeSelection: get().edgeSelection.filter((e) => !ids.includes(e)) });
    get().persistNow();
    const ts = Date.now();
    emitOps(ids.map((id) => ({ id: uid('op'), client: getClientId(), ts, type: 'edge.remove' as const, payload: { id } })));
  },

  applyEdgeLabel: (id, label) => {
    get().updateEdge(id, { label });
  },

  addSection: (name, emoji) => {
    get().pushHistory('新建分区');
    const used = new Set(get().sections.map((x) => x.color));
    const color = SECTION_COLOR_PALETTE.find((c) => !used.has(c)) || SECTION_COLOR_PALETTE[get().sections.length % SECTION_COLOR_PALETTE.length];
    const section: Section = { id: uid('sec'), name, emoji, color };
    const sections = [...get().sections, section];
    set({ sections });
    get().persistNow();
    emitOps([{ id: uid('op'), client: getClientId(), ts: Date.now(), type: 'section.upsert', payload: { section } }]);
    return section.id;
  },

  updateSection: (id, patch) => {
    const sections = get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s));
    const section = sections.find((s) => s.id === id);
    if (!section) return;
    if (shouldPushEditHistory()) get().pushHistory('编辑分区');
    set({ sections });
    get().persistNow();
    emitOps([{ id: uid('op'), client: getClientId(), ts: Date.now(), type: 'section.upsert', payload: { section } }]);
  },

  removeSection: (id, moveToId) => {
    get().pushHistory('删除分区');
    const sections = get().sections.filter((s) => s.id !== id);
    const cards = { ...get().cards };
    const ts = Date.now();
    const changed: Card[] = [];
    for (const c of Object.values(cards)) {
      if (c.sectionId === id) {
        cards[c.id] = { ...c, sectionId: moveToId || '', updatedAt: ts };
        changed.push(cards[c.id]);
      }
    }
    set({ sections, cards });
    get().persistNow();
    const ops: Op[] = [{ id: uid('op'), client: getClientId(), ts, type: 'section.remove', payload: { id } }];
    ops.push(...changed.map((c) => ({ id: uid('op'), client: getClientId(), ts, type: 'card.upsert' as const, payload: { card: c } })));
    emitOps(ops);
  },

  restoreCardFromTrash: (idx) => {
    const card = get().trashCards[idx];
    if (!card) return;
    const trashCards = get().trashCards.filter((_, i) => i !== idx);
    set({ trashCards });
    try {
      localStorage.setItem(K_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(trashCards));
    } catch { /* ignore */ }
    const restored = { ...card, id: uid('card'), z: get().zTop + 1, updatedAt: Date.now() };
    get().addCardsAt([restored]);
    get().setSelection([restored.id]);
    toast(`已恢复卡片「${restored.title || '未命名'}」`, 'ok');
  },
  purgeTrashCard: (idx) => {
    const trashCards = get().trashCards.filter((_, i) => i !== idx);
    set({ trashCards });
    try {
      localStorage.setItem(K_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(trashCards));
    } catch { /* ignore */ }
  },
  clearTrashCards: () => {
    set({ trashCards: [] });
    try {
      localStorage.removeItem(K_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'));
    } catch { /* ignore */ }
    toast('卡片回收站已清空', 'warn');
  },
  restoreWriteCardFromTrash: (idx) => {
    const card = get().writeTrashCards[idx];
    if (!card) return;
    get().pushHistory('恢复正文');
    const writeTrashCards = get().writeTrashCards.filter((_, i) => i !== idx);
    const groups = get().groups;
    const restored = {
      ...card,
      writingOnly: true,
      groupId: card.groupId && groups[card.groupId] ? card.groupId : undefined,
      updatedAt: Date.now(),
    };
    const cards = { ...get().cards, [restored.id]: restored };
    set({ cards, writeTrashCards });
    try {
      localStorage.setItem(K_WRITE_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(writeTrashCards));
    } catch { /* ignore */ }
    get().persistNow();
    toast(`已恢复正文「${restored.title || '未命名章节'}」`, 'ok');
  },
  purgeWriteCard: (idx) => {
    const writeTrashCards = get().writeTrashCards.filter((_, i) => i !== idx);
    set({ writeTrashCards });
    try {
      localStorage.setItem(K_WRITE_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(writeTrashCards));
    } catch { /* ignore */ }
  },
  clearWriteTrash: () => {
    set({ writeTrashCards: [] });
    try {
      localStorage.removeItem(K_WRITE_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'));
    } catch { /* ignore */ }
    toast('正文回收站已清空', 'warn');
  },

  snapshotWriteCard: (id) => {
    const card = get().cards[id];
    if (!card || !card.writingOnly) return;
    const backup = structuredClone(card);
    const writeTrashCards = [backup, ...get().writeTrashCards].slice(0, 60);
    set({ writeTrashCards });
    try {
      localStorage.setItem(K_WRITE_TRASH_CARDS(get().projectId || 'x', get().currentPageId || 'x'), JSON.stringify(writeTrashCards));
    } catch { /* ignore */ }
  },

  pushAiHistory: (e) => {
    const s = get();
    const arr = [e, ...s.aiHistory].slice(0, 60);
    set({ aiHistory: arr });
    saveAiHistory(s.projectId || 'x', s.currentPageId || 'x', arr);
  },

  restoreAiHistory: (idx) => {
    const s = get();
    const e = s.aiHistory[idx];
    if (!e) return;
    if (!s.cards[e.cardId]) { toast('该章节已不存在，无法恢复', 'warn'); return; }
    // 恢复前先把当前正文备份到正文回收站，双重保险
    s.snapshotWriteCard(e.cardId);
    s.updateCard(e.cardId, { content: structuredClone(e.content) });
    s.pushAiHistory({
      id: uid('aih'), cardId: e.cardId, title: e.title, mode: 'restore',
      content: structuredClone(e.content), prevContent: s.cards[e.cardId]?.content || null, source: e.source || 'writing', ts: Date.now(),
    });
    toast('已恢复该 AI 版本（当前正文已备份到正文回收站）', 'ok');
  },

  clearAiHistory: () => {
    set({ aiHistory: [] });
    saveAiHistory(get().projectId || 'x', get().currentPageId || 'x', []);
    toast('AI 生成历史已清空', 'warn');
  },
  clearAiHistoryBySource: (source) => {
    const s = get();
    const arr = s.aiHistory.filter((e: AiEditLog) => e.source !== source);
    set({ aiHistory: arr });
    saveAiHistory(s.projectId || 'x', s.currentPageId || 'x', arr);
    toast('已清空该来源的 AI 生成历史', 'warn');
  },

  moveSection: (id, dir) => {
    get().pushHistory('移动分区');
    const sections = [...get().sections];
    const idx = sections.findIndex((s2) => s2.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sections.length) return;
    const tmp = sections[idx];
    sections[idx] = sections[j];
    sections[j] = tmp;
    set({ sections });
    get().persistNow();
      const ts = Date.now();
      emitOps([sections[idx], sections[j]].map((sec) => ({ id: uid('op'), client: getClientId(), ts, type: 'section.upsert' as const, payload: { section: sec } })));
  },

  setSelection: (ids, opts) => {
    if (opts?.edge) {
      set({ edgeSelection: ids, selection: [], selectedGroupId: null });
      return;
    }
    const s = get();
    const arr = Array.isArray(ids) ? ids : [ids];
    // 选中卡片置顶：为每个选中卡分配递增 z（后选中的在最上），本地更新不入历史/不广播
    let zTop = s.zTop;
    const next: Record<string, Card> = {};
    for (const id of arr) {
      const c = s.cards[id];
      if (c && !c.writingOnly) { zTop += 1; next[id] = { ...c, z: zTop }; }
    }
    if (Object.keys(next).length) {
      s.setCardsLocal(next);
      set({ zTop, selection: arr, edgeSelection: [], selectedGroupId: null });
    } else {
      set({ selection: arr, edgeSelection: [], selectedGroupId: null });
    }
  },
  selectGroup: (gid) => {
    set({ selectedGroupId: gid, selection: [], edgeSelection: [] });
  },
  toggleSelect: (id) => {
    const s = get();
    const sel = s.selection;
    const on = sel.includes(id);
    const nextSel = on ? sel.filter((x) => x !== id) : [...sel, id];
    if (!on) {
      // 新增选中 → 置顶
      const c = s.cards[id];
      if (c && !c.writingOnly) {
        const z = s.zTop + 1;
        s.setCardsLocal({ [id]: { ...c, z } });
        set({ zTop: z, selection: nextSel, edgeSelection: [], selectedGroupId: null });
        return;
      }
    }
    set({ selection: nextSel, edgeSelection: [], selectedGroupId: null });
  },

  pushHistory: (desc?: string) => {
    const { history, historyIdx, historyLog } = get();
    const now = Date.now();
    // 先按当前 historyIdx 截断历史日志，确保 historyLog 与 history 索引始终对齐，
    // 否则恢复/撤销后 historyLog 残留旧条目会导致「current 高亮错位、能同时点选两项」。
    const log = historyLog.slice(0, historyIdx + 1);
    // 合并连续同类编辑：打字/拖拽过程中每秒触发多次，深拷贝整个项目（含图片）成本极高。
    // 2 秒内同描述的变更并入同一条历史，undo 仍可回退到本次连续编辑之前。
    const lastLog = log[log.length - 1];
    if (lastLog && (desc || '操作') === lastLog.desc && now - lastLog.ts < HISTORY_COALESCE_MS) {
      log[log.length - 1] = { ...lastLog, ts: now };
      set({ historyLog: log });
      return;
    }
    const { cards, edges, groups, sections } = get();
    const snap = historySnapshot({ cards, edges, groups, sections });
    const next = history.slice(0, historyIdx + 1);
    next.push(snap);
    if (next.length > HISTORY_MAX) next.shift();
    log.push({ ts: now, desc: desc || '操作' });
    if (log.length > HISTORY_MAX) log.shift();
    // 新操作产生新分支：清空重做栈
    set({ history: next, historyIdx: next.length - 1, historyLog: log, redoStack: [] });
  },

  undo: () => {
    const { history, historyIdx } = get();
    const redoStack = get().redoStack ?? [];
    if (historyIdx < 0) {
      toast('没有可撤销的操作');
      return;
    }
    const snap = history[historyIdx];
    const live = historySnapshot(get());
    set({
      cards: structuredClone(snap.cards),
      edges: structuredClone(snap.edges),
      groups: structuredClone(snap.groups),
      sections: structuredClone(snap.sections),
      historyIdx: historyIdx - 1,
      redoStack: [...redoStack, live],
      selection: [],
      edgeSelection: [],
    });
    get().persistNow();
  },

  restoreHistory: (idx) => {
    const { history } = get();
    if (idx < 0 || idx >= history.length) return;
    const snap = history[idx];
    set({
      cards: structuredClone(snap.cards),
      edges: structuredClone(snap.edges),
      groups: structuredClone(snap.groups),
      sections: structuredClone(snap.sections),
      historyIdx: idx,
      redoStack: [],
      selection: [],
      edgeSelection: [],
    });
    get().persistNow();
    toast('已恢复到该历史状态', 'ok');
  },

  redo: () => {
    const redoStack = get().redoStack ?? [];
    if (!redoStack.length) {
      toast('没有可重做的操作');
      return;
    }
    const snap = redoStack[redoStack.length - 1];
    const hIdx = get().historyIdx + 1;
    set({
      cards: structuredClone(snap.cards),
      edges: structuredClone(snap.edges),
      groups: structuredClone(snap.groups),
      sections: structuredClone(snap.sections),
      historyIdx: hIdx,
      redoStack: redoStack.slice(0, -1),
      selection: [],
      edgeSelection: [],
    });
    get().persistNow();
  },

  applyRemoteOps: (ops) => {
    const s = get();
    const curPage = s.currentPageId;
    const cards = { ...s.cards };
    const edges = { ...s.edges };
    const sections = [...s.sections];
    let meta = s.meta;
    let changedCards = false;
    let changedEdges = false;
    let changedSections = false;
    let changedMeta = false;
      let changedOtherPages = false;
    for (const op of ops) {
      if (seenOps.has(op.id)) continue;
      rememberOp(op.id);
      if (op.client === getClientId()) continue;
      // 页面隔离：非当前页的卡片/连线 op 写入 pageStash，避免切页后丢失远端修改
        const isCardEdge = op.type === 'card.upsert' || op.type === 'card.remove' || op.type === 'edge.upsert' || op.type === 'edge.remove';
        const targetPage = op.payload?.page as string | undefined;
        if (isCardEdge && targetPage && curPage && targetPage !== curPage) {
          const pid = s.projectId;
          if (pid) {
            if (!pageStash[pid]) pageStash[pid] = {};
            if (!pageStash[pid][targetPage]) pageStash[pid][targetPage] = { cards: {}, edges: {}, annotations: {}, groups: {} };
            const stash = pageStash[pid][targetPage];
            if (op.type === 'card.upsert') {
              const card = op.payload.card as Card;
              const cur = stash.cards[card.id];
              if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) { stash.cards[card.id] = card; changedOtherPages = true; }
            } else if (op.type === 'card.remove') {
              if (stash.cards[op.payload.id as string]) { delete stash.cards[op.payload.id as string]; changedOtherPages = true; }
            } else if (op.type === 'edge.upsert') {
              const edge = op.payload.edge as Edge;
              const cur = stash.edges[edge.id];
              if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) { stash.edges[edge.id] = edge; changedOtherPages = true; }
            } else if (op.type === 'edge.remove') {
              if (stash.edges[op.payload.id as string]) { delete stash.edges[op.payload.id as string]; changedOtherPages = true; }
            }
          }
          continue;
        }
      
          
      switch (op.type) {
        case 'card.upsert': {
          const card = op.payload.card as Card;
          const cur = cards[card.id];
          if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) {
            cards[card.id] = card;
            changedCards = true;
          }
          break;
        }
        case 'card.remove': {
          const id = op.payload.id as string;
          if (cards[id]) {
            delete cards[id];
            changedCards = true;
          }
          break;
        }
        case 'edge.upsert': {
          const edge = op.payload.edge as Edge;
          const cur = edges[edge.id];
          if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) {
            edges[edge.id] = edge;
            changedEdges = true;
          }
          break;
        }
        case 'edge.remove': {
          const id = op.payload.id as string;
          if (edges[id]) {
            delete edges[id];
            changedEdges = true;
          }
          break;
        }
        case 'section.upsert': {
          const section = op.payload.section as Section;
          const idx = sections.findIndex((x) => x.id === section.id);
          if (idx >= 0) sections[idx] = section;
          else sections.push(section);
          changedSections = true;
          break;
        }
        case 'section.remove': {
          const id = op.payload.id as string;
          const idx = sections.findIndex((x) => x.id === id);
          if (idx >= 0) {
            sections.splice(idx, 1);
            changedSections = true;
          }
          break;
        }
        case 'meta': {
          meta = (op.payload.meta as ProjectMeta) || meta;
          changedMeta = true;
          break;
        }
      }
    }
    if (changedCards || changedEdges || changedSections || changedMeta || changedOtherPages) {
        logDebug('store', 'applyRemoteOps', { count: ops.length, changed: { cards: changedCards, edges: changedEdges, sections: changedSections, meta: changedMeta, otherPages: changedOtherPages } });
      const newMeta = changedMeta ? meta : s.meta;
      set({
        cards: changedCards ? cards : s.cards,
        edges: changedEdges ? edges : s.edges,
        sections: changedSections ? sections : s.sections,
        meta: newMeta,
        projects: changedMeta && newMeta ? s.projects.map((p) => (p.id === newMeta.id ? newMeta : p)) : s.projects,
        selection: changedCards ? s.selection.filter((id) => cards[id]) : s.selection,
        editingCardId: changedCards && s.editingCardId && !cards[s.editingCardId] ? null : s.editingCardId,
      });
      get().persistNow();
    }
  },

  applyRemoteProject: (state) => {
    const projects = [...get().projects.filter((p) => p.id !== state.meta.id), state.meta];
    saveProjects(projects);
    const { pageOrder, pageData, firstPageId } = pagesFromState(state);
    logInfo('store', 'applyRemoteProject', { id: state.meta.id, name: state.meta.name, pages: pageOrder.length });
    let meta = state.meta;
    let manuscript: Manuscript = (state as unknown as { manuscript?: Manuscript }).manuscript || { ...EMPTY_MANUSCRIPT };
    let cleanPages = pageData;
    if (!meta.manuscriptMigrated) {
      const mig = migrateManuscriptFromPages(pageData, manuscript);
      cleanPages = mig.pages;
      manuscript = mig.manuscript;
      meta = { ...meta, manuscriptMigrated: true };
    }
    initPageStash(state.meta.id, cleanPages);
    // 尽量停留在当前页面（若服务器上有同名页）；否则用第一个页面
    const cur = get().currentPageId;
    const targetId = pageOrder.some((p) => p.id === cur) ? cur : firstPageId;
    const target = cleanPages[targetId] || { cards: {}, edges: {}, annotations: {}, groups: {} };
    set({
      projects: projects.map((x) => (x.id === meta.id ? meta : x)),
      projectId: state.meta.id,
      meta,
      sections: state.sections,
      pages: pageOrder,
      currentPageId: targetId,
      cards: target.cards,
      edges: target.edges,
      annotations: target.annotations || {},
      groups: target.groups || {},
      manuscript,
      selection: [],
      edgeSelection: [],
      editingCardId: null,
      history: [],
      historyIdx: -1,
      redoStack: [],
      viewport: { x: 60, y: 40, zoom: 1 },
      zTop: Math.max(1, ...Object.values(target.cards).map((c) => c.z || 0)) + 1,
    });
    localStorage.setItem(K_CURRENT, state.meta.id);
    get().persistNow();
    get().fitView();
  },

  // ---------- 防抖持久化 ----------
  // 高频路径（打字/拖动/远端 op）只标记脏并防抖落盘，避免每次变更同步 JSON.stringify
  // 整个项目（含图片 base64）；页面隐藏/关闭与 30s 兜底定时器保证最终落盘。
  persistNow: () => {
    const { meta, sections } = get();
    if (!meta) return;
      logDebug('store', 'persistNow', { id: meta.id });
    if (persistDebounceTimer !== undefined) {
      window.clearTimeout(persistDebounceTimer);
      persistDebounceTimer = undefined;
    }
    persistDirty = false;
    stashCurrentPage();
    const pages: Record<string, PageData> = pageStash[meta.id] || {};
    const order = get().pages.length ? get().pages : [{ id: get().currentPageId, name: '页面 1', emoji: '📄', createdAt: Date.now() }];
    savePageTrash(meta.id, get().pageTrash);
    saveProjectData(meta.id, sections, order, pages, get().manuscript);
    set({ saving: true });
    clearTimeout((persistTimer as { t?: number }).t);
    (persistTimer as { t?: number }).t = window.setTimeout(() => set({ saving: false }), 800);
  },

  saveNow: (manual) => {
    get().persistNow();
    set({ lastSavedAt: Date.now() });
      logInfo('store', 'saveNow', { manual: !!manual, id: get().meta?.id });
      if (manual) logOp('手动保存');
    if (manual) toast('已保存到本地 💾', 'ok');
    // 云同步（若启用）
    const cloud = get().settings.cloud;
    if (cloud?.enabled && cloud.url) {
      debouncedCloudSync();
    }
  },

  cloudSyncNow: async () => {
    const s = get();
    if (!s.meta) return;
    const cloud = s.settings.cloud;
    if (!cloud?.enabled || !cloud.url.trim()) {
      toast('请先在设置中启用云盘同步并填写 WebDAV 地址', 'warn');
      return;
    }
    if (s.cloudStatus === 'syncing') return;
    set({ cloudStatus: 'syncing' });
    try {
      const { putBackup, listProjectBackups, deleteBackup, sanitizeName, BACKUP_MAX } = await import('./cloudSync');
      const name = sanitizeName(s.meta.name || '未命名项目');
      // 多版本：上传一份带版本号+时间戳的新备份（不覆盖，每次都是新文件）
      const res = await putBackup(cloud, name, s.exportStateForSync());
      // 自动清理：只保留最近 BACKUP_MAX 份（删除时间较早的旧备份）
      if (res.ok) {
        try {
          const all = await listProjectBackups(cloud, name);
          if (all.length > BACKUP_MAX) {
            const toDel = all.slice(BACKUP_MAX);
            await Promise.all(toDel.map((f) => deleteBackup(cloud, f).catch(() => false)));
          }
        } catch { /* 清理失败不影响主流程 */ }
      }
      set({ cloudStatus: res.ok ? 'ok' : 'err' });
      if (res.ok) toast('已同步到云盘（多版本备份）☁️', 'ok');
      else toast(`云同步失败：${res.error || res.status}`, 'err');
    } catch (e) {
      set({ cloudStatus: 'err' });
      logError('store', 'cloudSyncNow', e);
      toast(`云同步失败：${(e as Error).message}`, 'err');
    }
  },

  cloudRefreshVersions: async () => {
    const s = get();
    if (!s.meta) return;
    const cloud = s.settings.cloud;
    if (!cloud?.enabled || !cloud.url.trim()) {
      toast('请先在设置中启用云盘同步并填写 WebDAV 地址', 'warn');
      return;
    }
    try {
      const { listProjectBackups, sanitizeName } = await import('./cloudSync');
      const name = sanitizeName(s.meta.name || '未命名项目');
      const list = await listProjectBackups(cloud, name);
      set({ cloudVersions: list });
      toast(list.length ? `已找到 ${list.length} 份云端备份 ☁️` : '云盘上暂无该项目的备份', list.length ? 'ok' : 'warn');
    } catch (e) {
      logError('store', 'cloudRefreshVersions', e);
      toast(`读取云端备份失败：${(e as Error).message}`, 'err');
    }
  },

  cloudRecoverVersion: async (filename) => {
    const s = get();
    if (!s.meta) return;
    const cloud = s.settings.cloud;
    if (!cloud?.enabled || !cloud.url.trim()) {
      toast('请先在设置中启用云盘同步并填写 WebDAV 地址', 'warn');
      return;
    }
    if (!await csConfirm('从云盘恢复会覆盖本地当前项目；恢复前会自动把当前项目备份到云盘，确定继续？')) return;
    try {
      const { pullProjectFromCloud, putBackup, sanitizeName } = await import('./cloudSync');
      const name = sanitizeName(s.meta.name || '未命名项目');
      // 恢复前先备份当前项目（带 -localbackup 标记），避免误覆盖无法找回
      await putBackup(cloud, name, s.exportStateForSync(), '-localbackup').catch(() => { /* 备份失败不阻断恢复 */ });
      const state = await pullProjectFromCloud(cloud, filename);
      if (!state) {
        toast('云端该备份读取失败', 'warn');
        return;
      }
      useStudio.getState().importProjectState(state);
      const label = filename.endsWith('-localbackup.json') ? '' : '（云端所选版本）';
      toast(`已从云盘恢复 ${label} ☁️`, 'ok');
    } catch (e) {
      logError('store', 'cloudRecoverVersion', e);
      toast(`云盘恢复失败：${(e as Error).message}`, 'err');
    }
  },

  cloudPull: async () => {
    await get().cloudRefreshVersions();
  },
}));

/** 云同步防抖（保存后 8 秒内合并触发一次） */
let cloudTimer: number | undefined;
function debouncedCloudSync() {
  if (cloudTimer !== undefined) window.clearTimeout(cloudTimer);
  cloudTimer = window.setTimeout(() => {
    cloudTimer = undefined;
    const s = useStudio.getState();
    if (s.settings.cloud?.enabled && s.meta) {
      s.cloudSyncNow().catch(() => { /* 状态已反映 */ });
    }
  }, 8000);
}

// 自动保存定时器（兜底保存，防止防抖定时器被异常场景跳过；仅在数据变更后落盘）
setInterval(() => {
  const s = useStudio.getState();
  if (!s.projectId || !s.meta) return;
  if (!persistDirty) return;
  if (s.settings.autoSave) {
    persistDirty = false;
    s.persistNow();
  }
}, 30000);

// 云盘定时同步（按 settings.cloud.intervalMin 间隔）
let lastCloudSyncAt = 0;
setInterval(() => {
  const s = useStudio.getState();
  if (!s.meta || !s.settings.cloud?.enabled || !s.settings.cloud.url) return;
  const interval = Math.max(1, s.settings.cloud.intervalMin || 10) * 60000;
  if (Date.now() - lastCloudSyncAt >= interval) {
    lastCloudSyncAt = Date.now();
    s.cloudSyncNow().catch(() => { /* 状态已反映 */ });
  }
}, 60000);

// 页面关闭前强制落盘（自动保存关闭时也不丢数据）
window.addEventListener('beforeunload', () => {
  const s = useStudio.getState();
  if (s.projectId && s.meta) s.persistNow();
});

setOpPageGetter(() => useStudio.getState().currentPageId);

const persistTimer: { t?: number } = {};

// 启动时恢复当前项目
(function init() {
  try {
    const cur = localStorage.getItem(K_CURRENT);
    if (cur && useStudio.getState().projects.some((p) => p.id === cur)) {
      useStudio.getState().openProject(cur);
    }
  } catch { /* ignore */ }
})();
