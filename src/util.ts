/**
 * ============ 通用工具函数集 ============
 * 纯函数 / 无 UI 依赖的小工具：
 *  · 尺寸：A4_RATIO、paperRatio、paperSizeForCard（卡纸比例）
 *  · 通用：uid（唯一 id）、clamp、countWords（富文本字数）、fmtTime、toast
 *  · 日志：logError / getLogs / clearLogs（环形缓冲 + localStorage 兜底）
 *  · 文件：fileToDataURL（图片本地化，避免 base64 拖动重复读取）
 * 注：应用版本号统一由 src/meta.ts 提供（云盘备份文件名、状态栏展示等）。
 */
import type { Card, JSONDoc, PaperSize, Viewport } from './types';
import { PAPER_SIZES } from './types';
/** A4 纸比例（宽:高），210mm × 297mm */
export const A4_RATIO = 210 / 297;
/** 双页 A4 展开比例（两张 A4 并排，宽:高） */
export const A4_DOUBLE_RATIO = (210 * 2) / 297;

/** 纸张规格比例（宽:高）；未知规格按 A4（6.3 纸张规格体系） */
export function paperRatioOf(size: PaperSize | undefined | null): number {
  const p = size ? PAPER_SIZES[size] : undefined;
  return p ? p.w / p.h : A4_RATIO;
}

/** 获取卡片的纸张比例：按项目纸张规格（meta.paper，默认 A4）；仅文字面（note）且非导图节点生效 */
export function paperRatio(card: Pick<Card, 'kind' | 'paper' | 'mode'>, projectPaper?: PaperSize): number | null {
  if (card.kind !== 'note' || card.mode === 'node') return null;
  return paperRatioOf(projectPaper || 'A4');
}

/** 根据目标纸张比例计算保持高度不变的宽高 */
export function paperSizeForCard(card: Pick<Card, 'kind' | 'mode' | 'h'>, paper: 'a4' | 'a4-double' | PaperSize) {
  const h = card.h || 340;
  const ratio = paper === 'a4-double' ? A4_DOUBLE_RATIO : paperRatioOf(paper as PaperSize);
  return { w: Math.max(120, Math.round(h * ratio)), h };
}

let _idSeq = 0;
/** 生成短唯一 id */
export function uid(prefix = 'id'): string {
  _idSeq = (_idSeq + 1) % 0xffff;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${_idSeq.toString(36)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 纯文本字数统计（去掉 HTML 标签与空白） */
export function countWords(html: string): number {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text.replace(/\s/g, '').length;
}

/** 下载文件 */
export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  // Android 原生壳：走系统保存位置对话框（ACTION_CREATE_DOCUMENT）
  const ab = (window as unknown as { OperitAndroid?: { saveBase64: (n: string, b: string, m: string) => void } }).OperitAndroid;
  if (ab?.saveBase64) {
    const blob = new Blob([content], { type: mime });
    const reader = new FileReader();
    reader.onload = () => ab.saveBase64(filename, String(reader.result).split(',')[1] || '', mime);
    reader.readAsDataURL(blob);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

/** 复制到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** 简易 Toast 系统 */
export type Toast = { id: string; text: string; kind: 'info' | 'ok' | 'warn' | 'err' };
type ToastListener = (t: Toast) => void;
const toastListeners = new Set<ToastListener>();
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t: Toast = { id: uid('toast'), text, kind };
  toastListeners.forEach((l) => l(t));
}
export function onToast(l: ToastListener): () => void {
  toastListeners.add(l);
  return () => toastListeners.delete(l);
}

/** 格式化时间 */
export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 读取文件为 dataURL */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** 裁剪超长字符串 */
export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** 随机整数 [min,max] */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** 随机取一个 */
export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
/** 随机取 n 个不重复 */
export function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/** 调色板 */
export const PALETTE = [
  '#e17055', '#d63031', '#e84393', '#fd79a8', '#a29bfe', '#6a5cf5',
  '#0984e3', '#74b9ff', '#00cec9', '#00b894', '#00a381', '#fdcb6e',
  '#f39c12', '#e67e22', '#d35400', '#f8c291', '#636e72', '#b2bec3',
];

/** 分区默认色 */
export const SECTION_COLORS = [
  '#6a5cf5', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#e84393',
  '#00cec9', '#a29bfe', '#f39c12', '#d63031', '#00a381', '#74b9ff',
];

export function sectionColor(sections: { id: string; color: string }[], sectionId: string): string {
  const s = sections.find((x) => x.id === sectionId);
  return s ? s.color : '#b2bec3';
}

/** 规范化 TipTap 空文档 */
export function emptyDoc(): JSONDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** 判断文档是否为空 */
export function docIsEmpty(doc: JSONDoc | null): boolean {
  if (!doc || !doc.content || doc.content.length === 0) return true;
  return doc.content.every((n) => n.type === 'paragraph' && (!n.content || n.content.length === 0));
}

/**
 * AI 落卡正式标题（需求 5.6）：格式 `[类型] · [名称]`（如「角色 · 林晚」）；
 * 时间戳不作卡名；已带类型前缀的原样保留（前缀 ≤8 字）。
 */
export function formalCardTitle(raw: string, fallbackType = '灵感'): string {
  const t = (raw || '').trim() || '未命名';
  const m = /^([^·]{1,8})\s*·\s*(.+)$/.exec(t);
  if (m && m[2].trim()) return `${m[1].trim()} · ${m[2].trim().slice(0, 40)}`;
  return `${fallbackType} · ${t.slice(0, 40)}`;
}

/** 平方距离 */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** 判断当前视口内是否有可见卡片（用于“脱离视野”时禁止盲目新建） */
export function hasVisibleCards(cards: Record<string, Card>, viewport: Viewport, sectionFilter: string = 'all'): boolean {
  const wrap = document.querySelector('.canvas-wrap');
  const rect = wrap?.getBoundingClientRect();
  const w = rect?.width || window.innerWidth;
  const h = rect?.height || window.innerHeight;
  const margin = 400;
  const x0 = -viewport.x / viewport.zoom - margin;
  const y0 = -viewport.y / viewport.zoom - margin;
  const x1 = (w - viewport.x) / viewport.zoom + margin;
  const y1 = (h - viewport.y) / viewport.zoom + margin;
  return Object.values(cards).some((c) => {
    if (c.writingOnly) return false;
    if (sectionFilter !== 'all' && c.sectionId !== sectionFilter) return false;
    return c.x + c.w > x0 && c.x < x1 && c.y + c.h > y0 && c.y < y1;
  });
}

/** 获取当前画布可视区域中心对应的世界坐标 */
export function canvasViewCenter(viewport: Viewport): { x: number; y: number } {
  const wrap = document.querySelector('.canvas-wrap');
  const rect = wrap?.getBoundingClientRect();
  const w = rect?.width || window.innerWidth;
  const h = rect?.height || window.innerHeight;
  return {
    x: (w / 2 - viewport.x) / viewport.zoom,
    y: (h / 2 - viewport.y) / viewport.zoom,
  };
}


// ---------- 轻量日志（第 12 章：分级 + 模块 + 错误码 + 操作路径）----------
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  /** 模块标记（画布/正文/时间轴/工坊/AI/模板库/存储/协同/网络/UI…） */
  source: string;
  message: string;
  /** 唯一错误码（E_模块_序号，如 E_STORAGE_003），仅错误级 */
  code?: string;
  data?: unknown;
  stack?: string;
}
/** 全局日志等级开关（调试级默认关，12.1） */
const logEnabled: Record<LogLevel, boolean> = { debug: false, info: true, warn: true, error: true };
export function setLogLevelEnabled(level: LogLevel, on: boolean) {
  logEnabled[level] = on;
}
export function getLogLevelEnabled(): Record<LogLevel, boolean> {
  return { ...logEnabled };
}
const MAX_LOG = 1000;
const logEntries: LogEntry[] = [];
let logSeq = 0;
function logNextId(): string {
  logSeq = (logSeq + 1) % 0xffff;
  return `log_${Date.now().toString(36)}_${logSeq.toString(36)}`;
}
function pushLog(level: LogLevel, source: string, message: string, data?: unknown, stack?: string, code?: string) {
  if (!logEnabled[level]) return;
  const entry: LogEntry = { id: logNextId(), ts: Date.now(), level, source, message, data, stack, code };
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG) logEntries.shift();
  const prefix = `[创作助手][${level.toUpperCase()}][${source}]${code ? `[${code}]` : ''} ${message}`;
  if (level === 'debug') console.debug(prefix, data ?? '');
  else if (level === 'info') console.info(prefix, data ?? '');
  else if (level === 'warn') console.warn(prefix, data ?? '');
  else console.error(prefix, data ?? '', stack ?? '');
  // 崩溃监控：error 级日志同步持久化到 localStorage（环形缓冲），崩溃不随刷新/进程退出丢失，可导出分析
  if (level === 'error') persistCrash(entry);
}

/** localStorage 崩溃日志持久化（上限 CRASH_KEEP 条，环形覆盖） */
const CRASH_KEY = 'cs.crashlog';
const CRASH_KEEP = 50;
function persistCrash(entry: LogEntry) {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    const arr: LogEntry[] = raw ? (JSON.parse(raw) as LogEntry[]) : [];
    arr.push(entry);
    if (arr.length > CRASH_KEEP) arr.splice(0, arr.length - CRASH_KEEP);
    localStorage.setItem(CRASH_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}
/** 读取持久化的崩溃日志（用于导出/排查） */
export function getCrashLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch { return []; }
}
/** 清空崩溃日志 */
export function clearCrashLogs() {
  try { localStorage.removeItem(CRASH_KEY); } catch { /* ignore */ }
}
/** 导出崩溃日志为文本（含时间/等级/模块/错误码/摘要/堆栈），供用户分析或手动上报 */
export function crashLogToText(): string {
  const logs = getCrashLogs();
  if (!logs.length) return '（暂无崩溃记录）';
  return logs
    .map((l) => `[${new Date(l.ts).toISOString()}] ${l.level.toUpperCase()} ${l.source}${l.code ? `[${l.code}]` : ''}: ${l.message}${l.stack ? `\n  ${l.stack}` : ''}`)
    .join('\n\n');
}
export function logDebug(source: string, message: string, data?: unknown) {
  pushLog('debug', source, message, data);
}
export function logInfo(source: string, message: string, data?: unknown) {
  pushLog('info', source, message, data);
}
export function logWarn(source: string, message: string, data?: unknown) {
  pushLog('warn', source, message, data);
}
/** 普通错误（自动分配错误码 E_模块_序号，12.2） */
export function logError(source: string, message: string, error?: unknown) {
  const err = error instanceof Error ? error : undefined;
  const code = errorCodeFor(source);
  pushLog('error', source, message, error ?? (err ? err.message : undefined), err?.stack, code);
}
/** 指定错误码的错误（唯一错误码可搜索，12.3） */
export function logErrorWithCode(source: string, code: string, message: string, error?: unknown) {
  const err = error instanceof Error ? error : undefined;
  pushLog('error', source, message, error ?? (err ? err.message : undefined), err?.stack, code);
}
const errorCodeSeq: Record<string, number> = {};
function errorCodeFor(source: string): string {
  errorCodeSeq[source] = (errorCodeSeq[source] || 0) + 1;
  return `E_${source.toUpperCase().replace(/[^A-Z]/g, '')}_${String(errorCodeSeq[source]).padStart(3, '0')}`;
}
export function getLogs(): LogEntry[] {
  return logEntries.slice();
}
export function clearLogs() {
  logEntries.length = 0;
}

// ---- 显著用户操作路径（12.2：节流记录，错误时随日志还原现场）----
const opPath: { ts: number; desc: string }[] = [];
let lastOpAt = 0;
let lastOpDesc = '';
export function logOp(desc: string) {
  const now = Date.now();
  if (desc === lastOpDesc && now - lastOpAt < 1500) return; // 节流：同一操作 1.5s 内合并
  lastOpAt = now;
  lastOpDesc = desc;
  opPath.push({ ts: now, desc });
  if (opPath.length > 100) opPath.shift();
}
export function getOpPath(): { ts: number; desc: string }[] {
  return opPath.slice();
}

// ---------- 图片压缩 / 缩放（性能增强：避免大图 base64 撑爆内存与 localStorage）----------
/** 图片压缩参数：长边超过该值则缩放；JPEG 画质（0~1）。 */
export const IMG_MAX_DIM = 2048;
export const IMG_JPEG_QUALITY = 0.8;
/**
 * 将 dataURL 图片压缩 / 缩放到安全尺寸（长边 ≤ IMG_MAX_DIM、JPEG 质量 IMG_JPEG_QUALITY）。
 * - 若图片已足够小（长边 ≤ IMG_MAX_DIM），原样返回，不损失画质、保留原始 mime 与透明通道；
 * - 否则用 canvas 重绘：超尺寸缩放 + 统一转 JPEG，并在 canvas 上先铺白底，避免 PNG 透明区变黑。
 * - 任何失败（无法解码、无 canvas 支持）都回退返回原始 dataURL，绝不影响选图流程。
 * 用于「选图插入 / 替换图片」入口，只影响新插入的图片，不改动已存数据。
 */
export function compressImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:image')) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const { width, height } = img;
          const maxDim = Math.max(width, height);
          // 已足够小：直接返回原图（保留 mime / 透明通道），避免无谓的画质损失
          if (maxDim <= IMG_MAX_DIM) { resolve(dataUrl); return; }
          const scale = IMG_MAX_DIM / maxDim;
          const w = Math.max(1, Math.round(width * scale));
          const h = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(dataUrl); return; }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          // 统一输出 JPEG（画质有损但体积最小）
          resolve(canvas.toDataURL('image/jpeg', IMG_JPEG_QUALITY));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}
