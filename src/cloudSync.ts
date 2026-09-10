/**
 * ============ 云盘备份同步（WebDAV） ============
 *  · 支持坚果云 / Nextcloud 等主流 WebDAV 云盘
 *  · 浏览器直连常受 CORS 限制 → 优先经应用内置代理转发（server 端），
 *    直连失败时提示配置代理地址
 *  · 备份命名/清理（BACKUP_MAX）、备份列表、拉取/恢复
 */
import type { CloudSettings, ProjectState } from './types';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useStudio } from './store';
import { APP_VERSION } from './meta';

/** 每个项目在云盘最多保留的备份数量（超出按时间删除旧版本） */
export const BACKUP_MAX = 30;

interface RelayBody {
  url: string;
  method: string;
  auth?: string;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
}

/** 轻量退避重试：仅对「瞬时错误」重试（网络错误 status=0、超时、5xx），最多 extra 次。 */
function transient(status: number, text: string): boolean {
  if (status === 0) return true; // 网络错误/超时/被中断
  if (status >= 500 && status <= 599) return true;
  const t = (text || '').toLowerCase();
  return t.includes('timeout') || t.includes('network') || t.includes('failed to fetch') || t.includes('aborted');
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function request(
  settings: CloudSettings,
  method: string,
  path: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  // 弱网/云盘偶发 5xx 时退避重试（指数退避，最多 2 次重试），失败仍按原语义返回，不改变调用方判断。
  const MAX_RETRY = 2;
  let last: { ok: boolean; status: number; text: string } = { ok: false, status: 0, text: '' };
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    last = await requestOnce(settings, method, path, body, extraHeaders);
    if (last.ok || !transient(last.status, last.text)) return last;
    if (attempt < MAX_RETRY) await sleep(400 * Math.pow(2, attempt)); // 400ms, 800ms
  }
  return last;
}

async function requestOnce(
  settings: CloudSettings,
  method: string,
  path: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = settings.url.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  const auth = 'Basic ' + btoa(`${settings.user}:${settings.pass}`);
  const headers: Record<string, string> = {
    Authorization: auth,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(extraHeaders || {}),
  };

  // 原生平台（手机 App 内 WebView）：用 CapacitorHttp 走原生网络栈，绕过 WebView 的 CORS 限制。
  // 这样无需局域网服务器，手机也能直连坚果云 / Nextcloud 等 WebDAV 同步。
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: body,
        readTimeout: 30000,
        connectTimeout: 15000,
      });
      const text = typeof res.data === 'string' ? res.data : res.data != null ? JSON.stringify(res.data) : '';
      return { ok: res.status >= 200 && res.status < 300, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: String((e as Error)?.message || e) };
    }
  }

  // 非原生（浏览器）：优先经局域网服务器 /api/relay 转发（可绕过 CORS），未配置时尝试直连。
  const serverUrl = useStudio.getState().settings.serverUrl;
  if (serverUrl.trim()) {
    const res = await fetch(serverUrl.replace(/\/+$/, '') + '/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, auth, contentType: 'application/json', body, headers: extraHeaders } as RelayBody),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: data.ok === true, status: data.status ?? res.status, text: data.text ?? '' };
  }
  // 直连（浏览器下部分云盘若允许 CORS 则可用；多数会失败）
  const res = await fetch(url, { method, headers, body });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** 把项目名里会干扰文件名的字符转成 `_` */
export function sanitizeName(name: string): string {
  return name.replace(/[\/:*?"<>|\s]+/g, '_');
}

/** 时间戳：YYYYMMDD-HHmmss */
function ts(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 生成备份文件名：项目名-v{版本}-{时间戳}{标签}.json */
export function makeBackupName(name: string, tag = ''): string {
  return `${sanitizeName(name)}-v${APP_VERSION}-${ts()}${tag}.json`;
}

/** 上传一份项目备份（带版本号与时间戳，多版本并存） */
export async function putBackup(
  settings: CloudSettings,
  name: string,
  state: ProjectState | null,
  tag = '',
): Promise<{ ok: boolean; status?: number; error?: string; filename?: string }> {
  if (!state) return { ok: false, error: '无项目数据' };
  const filename = makeBackupName(name, tag);
  const json = JSON.stringify(state);
  const res = await request(settings, 'PUT', filename, json);
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}`, filename };
}

/** 从云盘拉取指定备份文件内容 */
export async function pullProjectFromCloud(settings: CloudSettings, filename: string): Promise<ProjectState | null> {
  const res = await request(settings, 'GET', filename);
  if (!res.ok) return null;
  try {
    return JSON.parse(res.text) as ProjectState;
  } catch {
    return null;
  }
}

/** 删除云盘上的一个备份文件 */
export async function deleteBackup(settings: CloudSettings, filename: string): Promise<boolean> {
  const res = await request(settings, 'DELETE', filename);
  return res.ok;
}

/** 列出云盘目录下匹配 `项目名-v*.json` 的所有备份文件名（按文件名倒序，即最新在前） */
export async function listProjectBackups(settings: CloudSettings, name: string): Promise<string[]> {
  const prefix = sanitizeName(name) + '-v';
  const res = await request(settings, 'PROPFIND', '', undefined, { Depth: '1' });
  if (!res.ok) return [];
  const all = parseDavNames(res.text);
  return all.filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/** 从 WebDAV 的 PROPFIND 响应（multistatus XML）中提取文件名 */
function parseDavNames(xml: string): string[] {
  const out: string[] = [];
  const re = /<[^>]*href[^>]*>([^<]+)<\/[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    const decoded = decodeURIComponent(raw).replace(/\/+$/, '');
    out.push(decoded.split('/').pop() || decoded);
  }
  return out;
}