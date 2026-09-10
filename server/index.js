/**
 * ============ 局域网协同服务器（Node） ============
 * 职责：WebSocket 协同（op 广播/在线状态）、WebDAV 代理（云盘 CORS 绕行）、
 *      静态资源服务（生成 dist 后可直接访问）。
 * 用法：npm run server（默认 8787；PORT=8787 node server/index.js）
 * 客户端入口：应用内「局域网协同」弹窗 → 连接 ws://<ip>:8787。
 */
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DIST_DIR = path.join(__dirname, '..', 'dist');
fs.mkdirSync(DATA_DIR, { recursive: true });

function log(level, source, message, data) {
  const ts = new Date().toISOString();
  const detail = data ? ` ${typeof data === 'string' ? data : JSON.stringify(data)}` : '';
  const line = `[${ts}][${level.toUpperCase()}][${source}] ${message}${detail}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

process.on('uncaughtException', (err) => {
  log('error', 'process', 'uncaughtException', err?.message || String(err));
  console.error(err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  log('error', 'process', 'unhandledRejection', reason instanceof Error ? reason.message : String(reason));
});



function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const app = express();
app.disable('x-powered-by');
// 请求体上限：默认 100mb（足够单个大项目/内嵌图片）。仍可用 BODY_LIMIT 覆盖，
// 例如 BODY_LIMIT=300mb node server/index.js。之前 300mb 过大，异常大包会瞬时抬高内存。
const BODY_LIMIT = process.env.BODY_LIMIT || '100mb';
app.use(express.json({ limit: BODY_LIMIT }));

// CORS：允许 WebView / 第三方 origin 跨域访问（手机 App 云同步 relay、局域网协同、调试控制台）
// 安全建议（对外暴露/公网部署时务必收紧）：
//   * 默认全放开（*）仅便于局域网协同与局域网/调试场景；
//   * 公网部署或同一服务被不可信页面引用时，用环境变量收紧到指定来源，例如：
//        CORS_ORIGIN=https://example.com,https://app.example.com node server/index.js
//     支持用英文逗号分隔多个来源（仅放行列表内 origin，未命中则不下发 CORS 头）。
//   保持默认 '*' 表示任意站点浏览器都可跨域调用本服务的 API / WebDAV relay / 静态资源。
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGIN || '*')
  .split(',').map((s) => s.trim()).filter(Boolean);
const allOriginsOpen = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*');
app.use((req, res, next) => {
  if (allOriginsOpen) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PROPFIND,MKCOL');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Depth,X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 基础安全响应头：减少 XSS / 点击劫持 / 信息泄露风险
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Content-Security-Policy：保守加固，不锁死 script/style/img（WebView 内联样式、
  // blob/data 图片、以及用户自建 AI 网关都要能跑），只禁掉最危险的能力：
  //   object/embed 插件、<base> 劫持、被外站 iframe 嵌套、form 外发。
  // 如需更严格的脚本策略，可在此基础上自行收紧 script-src / connect-src。
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      // 保留宽放：内联脚本/样式（构建注入）、data:/blob: 图片与媒体、任意 http(s) 连接（AI 网关/WebDAV）
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "media-src 'self' data: blob: https: http:",
      "connect-src 'self' http: https: ws: wss:",
    ].join('; ')
  );
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  res.on('finish', () => {
    // 只记录路径，不记录查询参数，避免可能的 token / 隐私信息进入日志
    log('info', 'http', `${req.method} ${req.path} -> ${res.statusCode}`, { ip: req.ip });
  });
  next();
});

// ---------- 项目文件 ----------
const PROJECT_ID_RE = /^[A-Za-z0-9_-]+$/;
function isValidProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}
const projFile = (id) => path.join(DATA_DIR, `${id}.json`);
const indexFile = () => path.join(DATA_DIR, 'projects.json');

let projectIndex = {};
try {
  projectIndex = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
} catch { /* 首次运行 */ }
/** 原子写入：先写临时文件再 rename，避免写一半崩溃损坏数据 */
function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function saveIndex() {
  atomicWrite(indexFile(), JSON.stringify(projectIndex, null, 2));
}

// ---------- REST ----------
app.get('/api/projects', (_req, res) => {
  res.json(Object.values(projectIndex).sort((a, b) => b.updatedAt - a.updatedAt));
});

app.get('/api/projects/:id', (req, res) => {
  const id = req.params.id;
    if (!isValidProjectId(id)) return res.status(400).json({ error: '项目 ID 无效' });
    const f = projFile(id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'not found' });
  res.sendFile(f);
});

app.post('/api/projects/:id', (req, res) => {
  const id = req.params.id;
    if (!isValidProjectId(id)) return res.status(400).json({ error: '项目 ID 无效' });
  const state = req.body;
  if (!state || !state.meta || !state.meta.id) return res.status(400).json({ error: '状态无效' });
  try {
    atomicWrite(projFile(id), JSON.stringify(state));
    projectIndex[id] = state.meta;
    saveIndex();
    projectStates.set(id, state);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  const id = req.params.id;
    if (!isValidProjectId(id)) return res.status(400).json({ error: '项目 ID 无效' });
  try {
    if (fs.existsSync(projFile(id))) fs.unlinkSync(projFile(id));
    delete projectIndex[id];
    projectStates.delete(id);
    saveIndex();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 通用 HTTP 转发（用于云盘 WebDAV 同步，绕过浏览器 CORS 限制）
app.post('/api/relay', async (req, res) => {
  const { url, method = 'GET', auth, contentType, body, headers: extraHeaders } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL 无效' });
    const allowedMethods = ['GET', 'PUT', 'POST', 'DELETE', 'PROPFIND', 'MKCOL'];
    if (!allowedMethods.includes(String(method).toUpperCase())) return res.status(400).json({ error: 'Method 不支持' });
    log('info', 'relay', `${method} ${url}`, { hasAuth: !!auth });
  try {
    const headers = {};
    if (auth) headers.Authorization = auth;
    if (contentType) headers['Content-Type'] = contentType;
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers[k] = v;
    // 上游超时：避免云盘/网关长时间不响应时挂死连接（默认 60s，可用 RELAY_TIMEOUT_MS 覆盖）
    const timeoutMs = Number(process.env.RELAY_TIMEOUT_MS || 60000);
    const r = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? body : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    res.json({ ok: r.ok, status: r.status, text });
  } catch (e) {
    const msg = (e && (e.name === 'TimeoutError' || e.name === 'AbortError'))
      ? `上游超时（>${process.env.RELAY_TIMEOUT_MS || 60000}ms）`
      : String(e.message || e);
    log('warn', 'relay', `failed: ${method} ${url}`, msg);
    res.status(502).json({ ok: false, status: 502, text: msg });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, projects: Object.keys(projectIndex).length, online: clients.size, ts: Date.now() });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API not found' }));


// ---------- 安卓安装包分发 ----------
const APK_DIR = path.join(__dirname, '..', 'apk-dist');
app.use('/apk', express.static(APK_DIR, { maxAge: 0 }));
app.get('/apk/qr.svg', async (req, res) => {
  try {
    const base = req.protocol + '://' + req.headers.host;
    const target = req.query.url || `${base}/apk/`;
    const svg = await QRCode.toString(String(target), { type: 'svg', margin: 1, width: 360, color: { dark: '#1f2430', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).send('qr error');
  }
});
function lanIps() {
  const ips = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
      }
    }
  } catch { /* ignore */ }
  return [...new Set(ips)];
}

app.get('/apk/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'download.html'));
});

// ---------- 静态前端 ----------
if (fs.existsSync(DIST_DIR)) {
  // 静态前端：HTML 强制不缓存（App/浏览器总拿最新入口），
  // 但 Vite 产物 /assets/ 下的文件名带内容哈希 → 可长缓存 immutable，减少重复下载、加快启动。
  app.use(express.static(DIST_DIR, {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (/[/\\]assets[/\\]/.test(filePath)) {
        // 内容哈希文件名 → 永久缓存（内容变则文件名变，不会拿到旧版）
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }));
}
app.get('*', (_req, res) => {
  if (fs.existsSync(DIST_DIR)) {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  } else {
    res.type('text/plain; charset=utf-8').send('创作助手服务器已启动。\n前端尚未构建：请在项目目录执行 npm run build，然后刷新本页。\n开发模式请用 npm run dev 并直接访问 Vite 地址。');
  }
});

// ---------- WebSocket 协同 ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** ws -> {clientId, projectId, name, color} */
const clients = new Map();
/** projectId -> 内存中的权威状态 */
const projectStates = new Map();
const saveTimers = new Map();

function loadProjectState(id) {
  if (projectStates.has(id)) return projectStates.get(id);
  try {
    const s = JSON.parse(fs.readFileSync(projFile(id), 'utf8'));
    projectStates.set(id, s);
    return s;
  } catch (e) {
    log('warn', 'ws', `loadProjectState failed: ${id}`, e?.message || String(e));
    return null;
  }
}

function persist(projectId) {
  const st = projectStates.get(projectId);
  if (!st) return;
  clearTimeout(saveTimers.get(projectId));
  saveTimers.set(projectId, setTimeout(() => {
    try {
      atomicWrite(projFile(projectId), JSON.stringify(st));
    } catch (e) {
      log('error', 'save', `persist failed: ${projectId}`, e.message);
    }
  }, 500));
}

function broadcast(projectId, msg, exceptClientId) {
  for (const [ws, info] of clients) {
    if (info.projectId !== projectId) continue;
    if (exceptClientId && info.clientId === exceptClientId) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

function peersOf(projectId, exceptClientId) {
  const list = [];
  for (const [, info] of clients) {
    if (info.projectId !== projectId) continue;
    if (exceptClientId && info.clientId === exceptClientId) continue;
    list.push({ id: info.clientId, name: info.name, color: info.color, lastSeen: Date.now() });
  }
  return list;
}

const COLORS = ['#e17055', '#0984e3', '#00b894', '#e84393', '#fdcb6e', '#6c5ce7', '#00cec9', '#d63031'];

function applyOpsToState(state, ops) {
  if (!state.cards || typeof state.cards !== 'object' || Array.isArray(state.cards)) state.cards = {};
  if (!state.edges || typeof state.edges !== 'object' || Array.isArray(state.edges)) state.edges = {};
  if (!Array.isArray(state.sections)) state.sections = [];
  if (!state.pages || typeof state.pages !== 'object' || Array.isArray(state.pages)) state.pages = {};
  for (const op of ops) {
    try {
      if (op.type === 'card.upsert') {
        const c = op.payload.card;
        const cur = state.cards?.[c.id];
        if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) state.cards[c.id] = c;
        // 多页面项目：同步到对应页面数据（op 携带 page 字段）
        const page = op.payload.page;
        if (page && state.pages?.[page]) {
          if (!state.pages[page].cards) state.pages[page].cards = {};
          const pc = state.pages[page].cards[c.id];
          if (!pc || (op.ts || 0) >= (pc.updatedAt || 0)) state.pages[page].cards[c.id] = c;
        }
      } else if (op.type === 'card.remove') {
        delete state.cards[op.payload.id];
        const page = op.payload.page;
        if (page && state.pages?.[page]?.cards) delete state.pages[page].cards[op.payload.id];
      } else if (op.type === 'edge.upsert') {
        const e = op.payload.edge;
        const cur = state.edges?.[e.id];
        if (!cur || (op.ts || 0) >= (cur.updatedAt || 0)) state.edges[e.id] = e;
        const page = op.payload.page;
        if (page && state.pages?.[page]) {
          if (!state.pages[page].edges) state.pages[page].edges = {};
          const pe = state.pages[page].edges[e.id];
          if (!pe || (op.ts || 0) >= (pe.updatedAt || 0)) state.pages[page].edges[e.id] = e;
        }
      } else if (op.type === 'edge.remove') {
        delete state.edges[op.payload.id];
        const page = op.payload.page;
        if (page && state.pages?.[page]?.edges) delete state.pages[page].edges[op.payload.id];
      } else if (op.type === 'section.upsert') {
        const sec = op.payload.section;
        const idx = state.sections.findIndex((x) => x.id === sec.id);
        if (idx >= 0) state.sections[idx] = sec;
        else state.sections.push(sec);
      } else if (op.type === 'section.remove') {
        state.sections = state.sections.filter((x) => x.id !== op.payload.id);
      } else if (op.type === 'meta') {
        state.meta = op.payload.meta;
        projectIndex[state.meta.id] = state.meta;
        saveIndex();
      }
    } catch { /* 忽略坏 op */ }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'join') {
      const { projectId, name, clientId } = msg;
      if (!projectId || !clientId) return;
      log('info', 'ws', 'join', { projectId, name, clientId });
      const state = loadProjectState(projectId);
      if (!state) {
        ws.send(JSON.stringify({ t: 'error', message: '服务器上没有这个项目，请先让创建者上传该项目' }));
        ws.close();
        return;
      }
      const color = COLORS[clients.size % COLORS.length];
      clients.set(ws, { clientId, projectId, name: name || '匿名', color });
      ws.send(JSON.stringify({ t: 'welcome', state, clientId, peers: peersOf(projectId, clientId) }));
      broadcast(projectId, { t: 'peers', peers: peersOf(projectId) }, clientId);
    } else if (msg.t === 'op') {
      const info = clients.get(ws);
      if (!info) return;
      const state = projectStates.get(info.projectId);
      if (state) applyOpsToState(state, msg.ops || []);
        log('debug', 'ws', 'op', { projectId: info.projectId, clientId: info.clientId, count: (msg.ops || []).length });
      persist(info.projectId);
      broadcast(info.projectId, { t: 'op', ops: msg.ops || [] }, info.clientId);
    } else if (msg.t === 'presence') {
      const info = clients.get(ws);
      if (!info) return;
      broadcast(info.projectId, { t: 'presence', from: info.clientId, data: msg.data }, info.clientId);
    } else if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    clients.delete(ws);
    if (info) log('info', 'ws', 'close', { projectId: info.projectId, clientId: info.clientId });
    if (info) {
      broadcast(info.projectId, { t: 'peers', peers: peersOf(info.projectId) });
    }
  });
});

// ---------- 数据快照备份与优雅退出 ----------
const BACKUP_DIR = path.join(__dirname, '..', 'data-backups');
const BACKUP_KEEP = 24;                 // 保留最近 24 份快照
const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 每小时一次

function snapshotBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(BACKUP_DIR, `data-${stamp}`);
    if (fs.existsSync(dest)) return;
    fs.cpSync(DATA_DIR, dest, { recursive: true });
    // 只保留最近 BACKUP_KEEP 份
    const dirs = fs.readdirSync(BACKUP_DIR).filter((d) => d.startsWith('data-')).sort();
    while (dirs.length > BACKUP_KEEP) {
      const old = dirs.shift();
      fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
    }
    log('info', 'backup', `snapshot -> ${stamp}`);
  } catch (e) {
    log('error', 'backup', `snapshot failed: ${e?.message || e}`);
  }
}

/** 退出前强制落盘所有未保存的项目 */
function flushAll() {
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  for (const [projectId, st] of projectStates) {
    try {
      atomicWrite(projFile(projectId), JSON.stringify(st));
    } catch (e) {
      log('error', 'save', `flush failed: ${projectId}`, e.message);
    }
  }
}
process.on('SIGINT', () => { flushAll(); process.exit(0); });
process.on('SIGTERM', () => { flushAll(); process.exit(0); });
setInterval(snapshotBackup, BACKUP_INTERVAL_MS).unref?.();

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🪄 创作助手 · 剧本工坊 协同服务器已启动');
  console.log(`   本机访问：      http://localhost:${PORT}`);
  for (const ip of lanIps()) {
    console.log(`   局域网主页：    http://${ip}:${PORT}`);
    console.log(`   安卓 APK 直链：http://${ip}:${PORT}/apk/creation-studio.apk`);
    console.log(`   安卓下载页：    http://${ip}:${PORT}/apk/`);
  }
  console.log('   数据目录：', DATA_DIR);
  if (allOriginsOpen) {
    console.warn('   ⚠ CORS 当前为全放开(*) —— 适合局域网/调试。');
    console.warn('     若需对外/公网部署，请用 CORS_ORIGIN 收紧到你的来源白名单，例如：');
    console.warn('       CORS_ORIGIN=https://example.com node server/index.js');
  } else {
    console.log(`   ✔ CORS 已收紧到白名单：${ALLOWED_ORIGINS.join(', ')}`);
  }
  console.log('');
  snapshotBackup(); // 启动时立即做一次初始快照
});
