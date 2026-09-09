/**
 * ============ 本地持久化（localStorage 读写） ============
 * 从 store.ts 抽取：纯函数，不依赖 zustand store（无循环依赖）。
 *  · 键名常量：K_SETTINGS / K_PROJECTS / K_PROJECT(id) / K_TRASH / K_AI_HISTORY…
 *  · loadXxx/saveXxx：设置、项目列表、项目页面数据（含旧格式迁移）、回收站、AI 历史
 *  · DEFAULT_SETTINGS：全局默认设置（含 AI 与云盘子配置）
 * 所有读写均 try/catch 容错（localStorage 满/损坏时静默降级）。
 */
import type { Annotation, AiEditLog, AppSettings, Card, CardGroup, Edge, Manuscript, PageMeta, ProjectFolder, ProjectMeta, Section } from '../types';
import { logError, logWarn, toast, uid } from '../util';

// ---------- 持久化键 ----------
export const K_SETTINGS = 'cs.settings';
export const K_PROJECTS = 'cs.projects';
export const K_FOLDERS = 'cs.folders';
export const K_CURRENT = 'cs.current';
export const K_PROJECT = (id: string) => `cs.project.${id}`;
export const K_TRASH = 'cs.trash';
export const K_TRASH_CARDS = (pid: string, pageId: string) => `cs.trashCards.${pid}.${pageId}`;
export const K_WRITE_TRASH_CARDS = (pid: string, pageId: string) => `cs.writeTrash.${pid}.${pageId}`;
export const K_AI_HISTORY = (pid: string, pageId: string) => `cs.aiHistory.${pid}.${pageId}`;

export const SECTION_COLOR_PALETTE = ['#6a5cf5', '#0984e3', '#00b894', '#e17055', '#fdcb6e', '#e84393', '#e67e22', '#f39c12', '#d63031', '#00cec9', '#00a381', '#74b9ff', '#a29bfe', '#fd79a8', '#636e72', '#f8c291'];

// ---------- 存储健康防护（12.4：防静默丢数据 / 配额满自清理 / 损坏回退） ----------
const STORAGE_KEY_BACKUP_SUFFIX = '.bak';

/** 节流：存储写入失败告警，避免刷屏（同一全局 5s 内至多提示一次） */
let lastStorageWarnAt = 0;
function warnStorageFail(msg: string) {
  logWarn('store', `localStorage 写入失败：${msg}`);
  const now = Date.now();
  if (now - lastStorageWarnAt < 5000) return;
  lastStorageWarnAt = now;
  toast(`⚠️ 数据未能保存（本地存储空间不足或不可用），请及时导出备份`, 'err');
}

/**
 * 配额满时自动清理：优先删除「最旧的 AI 生成历史」与「最旧的页面回收站」，
 * 这些数据可再生成/非核心，风险最低。返回是否清理出预期空间。
 */
function pruneStorageQuota(): boolean {
  try {
    const delKeys: { key: string; ts: number; prio: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // AI 历史：按条目最旧 ts 排序，可整键删（可再生成）
      if (key.startsWith('cs.aiHistory.')) {
        let minTs = Infinity;
        try { const raw = localStorage.getItem(key); if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) minTs = arr.reduce((m, e) => (e && typeof e.ts === 'number' ? Math.min(m, e.ts) : m), Infinity); } } catch { /* ignore */ }
        delKeys.push({ key, ts: minTs === Infinity ? Date.now() : minTs, prio: 0 });
      }
      // 页面回收站：优先删
      else if (key.startsWith('cs.pageTrash.')) {
        delKeys.push({ key, ts: Date.now(), prio: 1 });
      }
      // 卡片/写作回收站：次级清理
      else if (key.startsWith('cs.trashCards.') || key.startsWith('cs.writeTrash.')) {
        delKeys.push({ key, ts: Date.now(), prio: 2 });
      }
    }
    if (!delKeys.length) return false;
    // prio 小的优先删；同优先级按 ts 旧的先删
    delKeys.sort((a, b) => (a.prio - b.prio) || (a.ts - b.ts));
    // 清到最多 60 个（AI 历史为主），删完重试一次
    let freed = 0;
    for (const { key } of delKeys) {
      try { localStorage.removeItem(key); freed++; } catch { /* ignore */ }
      if (freed >= 60) break;
    }
    logWarn('store', `配额满，已自动清理 ${freed} 个非核心条目（AI历史/回收站）`);
    return freed > 0;
  } catch (e) {
    logError('store', 'pruneStorageQuota failed', e);
    return false;
  }
}

/**
 * 安全写入 localStorage：try 写 → 失败则清理配额后重试一次 → 仍失败则节流告警。
 * 返回是否成功。所有 saveXxx 统一走此入口，杜绝"静默丢数据"。
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    logWarn('store', `setItem(${key}) 首次失败：${String(e)}`);
    // 先尝试清理配额，再重试一次
    if (pruneStorageQuota()) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e2) {
        warnStorageFail(`重试后仍失败：${String(e2)}`);
        logError('store', `safeSetItem retry failed: ${key}`, e2);
        return false;
      }
    }
    warnStorageFail(`${String(e)}`);
    logError('store', `safeSetItem failed: ${key}`, e);
    return false;
  }
}

/** 读取备份键（用于损坏恢复） */
function getBackupKey(key: string): string {
  return key + STORAGE_KEY_BACKUP_SUFFIX;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  czTheme: '',
  grid: true,
  autoSave: true,
  ai: { enabled: false, endpoint: '', apiKey: '', model: '', thinking: false, thinkLevel: 'medium', showThinking: true },
  serverUrl: '',
  nickname: `作者${Math.floor(Math.random() * 900 + 100)}`,
  orientation: 'auto',
  autoSaveInterval: 5,
  cloud: { enabled: false, url: '', user: '', pass: '', intervalMin: 10 },
};

/** 项目某个页面的完整数据 */
export interface PageData {
  cards: Record<string, Card>;
  edges: Record<string, Edge>;
  annotations: Record<string, Annotation>;
  groups: Record<string, CardGroup>;
}

/** 回收站项目 */
export interface TrashItem { meta: ProjectMeta; data: { sections: Section[]; pageOrder: PageMeta[]; pages: Record<string, PageData> } }

/** 页面回收站条目（删除的页面可恢复） */
export interface PageTrashItem { meta: PageMeta; data: PageData; deletedAt: number }
const K_PAGE_TRASH = (pid: string) => `cs.pageTrash.${pid}`;

export function loadPageTrash(pid: string): PageTrashItem[] {
  try {
    const raw = localStorage.getItem(K_PAGE_TRASH(pid));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePageTrash(pid: string, list: PageTrashItem[]) {
  safeSetItem(K_PAGE_TRASH(pid), JSON.stringify(list));
}
/** 空白独立正文（6.6：正文独立存储，与画布数据互不污染） */
export const EMPTY_MANUSCRIPT: Manuscript = { volumes: [], chapters: [], trash: [] };


export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(K_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // 合并旧版「护眼主题」独立 localStorage（key=cz-theme）到 AppSettings.czTheme，保证老用户设置不丢
    let czTheme = parsed.czTheme;
    if (czTheme === undefined) {
      try { czTheme = localStorage.getItem('cz-theme') || ''; } catch { czTheme = ''; }
    }
    return {
      ...DEFAULT_SETTINGS, ...parsed,
      czTheme: czTheme || '',
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai || {}) },
      cloud: { ...DEFAULT_SETTINGS.cloud, ...(parsed.cloud || {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: AppSettings) {
  safeSetItem(K_SETTINGS, JSON.stringify(s));
}

export function loadProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(K_PROJECTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
export function saveProjects(p: ProjectMeta[]) {
  safeSetItem(K_PROJECTS, JSON.stringify(p));
}

export function loadProjectData(id: string): { sections: Section[]; pages: Record<string, PageData>; pageOrder: PageMeta[]; cards: Record<string, Card>; edges: Record<string, Edge>; manuscript: Manuscript } | null {

  const parse = (raw: string): { sections: Section[]; pages: Record<string, PageData>; pageOrder: PageMeta[]; cards: Record<string, Card>; edges: Record<string, Edge>; manuscript: Manuscript } | null => {
    const d = JSON.parse(raw);
    const sections = d.sections || [];
    const pageOrder: PageMeta[] = Array.isArray(d.pageOrder) ? d.pageOrder : [];
    const pages: Record<string, PageData> = d.pages || {};
    // 旧格式迁移：无页面数据 → 生成默认页面「页面 1」
    if (!pageOrder.length || !Object.keys(pages).length) {
      const pid = uid('page');
      const meta: PageMeta = { id: pid, name: '页面 1', emoji: '📄', createdAt: Date.now() };
      pages[pid] = { cards: d.cards || {}, edges: d.edges || {}, annotations: {}, groups: {} };
      pageOrder.length = 0;
      pageOrder.push(meta);
    }
    const manuscript: Manuscript = d.manuscript ? { ...EMPTY_MANUSCRIPT, ...d.manuscript } : { ...EMPTY_MANUSCRIPT };
    return { sections, pages, pageOrder, cards: pages[pageOrder[0].id]?.cards || {}, edges: pages[pageOrder[0].id]?.edges || {}, manuscript };
  };

  // 主键优先读取
  try {
    const raw = localStorage.getItem(K_PROJECT(id));
    if (!raw) return null;
    return parse(raw);
  } catch (e) {
    logError('store', `loadProjectData 主键损坏，尝试回退备份: ${id}`, e);
    // 主键 JSON 损坏 → 尝试从 .bak 恢复上一完好版本
    try {
      const bakRaw = localStorage.getItem(getBackupKey(K_PROJECT(id)));
      if (bakRaw) {
        const recovered = parse(bakRaw);
        if (recovered) {
          logWarn('store', `已从 .bak 备份恢复项目: ${id}`);
          toast('⚠️ 项目数据主键损坏，已自动从最近备份恢复', 'warn');
          return recovered;
        }
      }
      logWarn('store', `项目 ${id} 主键损坏且无可用备份，返回空`);
    } catch (be) {
      logError('store', `loadProjectData 备份恢复也失败: ${id}`, be);
    }
    return null;
  }
}

export function saveProjectData(id: string, sections: Section[], pageOrder: PageMeta[], pages: Record<string, PageData>, manuscript?: Manuscript) {
  const key = K_PROJECT(id);
  const json = JSON.stringify({ sections, pageOrder, pages, manuscript });
  // 写入前把「当前主键旧值」转存为 .bak（灾难恢复：主键损坏时回退上一完好版本）
  try {
    const old = localStorage.getItem(key);
    if (old) localStorage.setItem(getBackupKey(key), old);
  } catch { /* .bak 失败可忽略，不影响主键 */ }
  safeSetItem(key, json);
}

export function loadFolders(): ProjectFolder[] {
  try {
    const raw = localStorage.getItem(K_FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
export function saveFolders(f: ProjectFolder[]) {
  safeSetItem(K_FOLDERS, JSON.stringify(f));
}

export function loadTrash(): TrashItem[] {
  try {
    const raw = localStorage.getItem(K_TRASH);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
export function saveTrash(t: TrashItem[]) {
  safeSetItem(K_TRASH, JSON.stringify(t));
}

export function loadTrashCards(pid: string, pageId: string): Card[] {
  try {
    const raw = localStorage.getItem(K_TRASH_CARDS(pid, pageId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function loadWriteTrashCards(pid: string, pageId: string): Card[] {
  try {
    const raw = localStorage.getItem(K_WRITE_TRASH_CARDS(pid, pageId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 读取某个页面的 AI 生成历史 */
export function loadAiHistory(pid: string, pageId: string): AiEditLog[] {
  try {
    const raw = localStorage.getItem(K_AI_HISTORY(pid, pageId));
    const arr = raw ? JSON.parse(raw) : [];
    return arr.map((e: AiEditLog & { source?: 'canvas' | 'writing' }) => ({ ...e, source: e.source || 'writing' }));
  } catch {
    return [];
  }
}

/** 保存某个页面的 AI 生成历史 */
export function saveAiHistory(pid: string, pageId: string, arr: AiEditLog[]): void {
  safeSetItem(K_AI_HISTORY(pid, pageId), JSON.stringify(arr));
}
