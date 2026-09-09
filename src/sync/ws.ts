/**
 * ============ 局域网协同 WebSocket 客户端 ============
 *  · connectServer / disconnect：连接/断开协同服务器（项目级）
 *  · publishPresence：光标位置上报；isConnected：连接状态
 *  · maybeAutoReconnect：打开项目后自动重连（记住的服务器）
 *  · 项目拉取/上传（fetchServerProject / uploadProject / listServerProjects）
 *  op 级同步细节见 store/ops.ts。
 */
import { bindOpSink, getClientId, useStudio } from '../store';
import type { ProjectState } from '../types';
import { logDebug, logError, logInfo, logWarn } from '../util';

let ws: WebSocket | null = null;
let joinedProject: string | null = null;
let lastPresence: { px?: number; py?: number } = {};
let settled = false;

export function isConnected(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}

/** 连接服务器并加入项目；resolve 服务器权威状态（需调用方 applyRemoteProject） */
export function connectServer(url: string, projectId: string, name: string): Promise<ProjectState> {
  return new Promise((resolve, reject) => {
    disconnect();
    settled = false;
    useStudio.getState().setServerStatus('connecting');
    let wsUrl: string;
    try {
      wsUrl = url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
    } catch {
      reject(new Error('服务器地址无效'));
      return;
    }
      logInfo('sync', 'connectServer', { url: wsUrl, projectId });
    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl);
      ws = sock;
    } catch {
      reject(new Error('无法创建连接'));
      return;
    }
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('连接超时，请确认服务器已启动且地址正确'));
        try { sock.close(); } catch { /* ignore */ }
      }
    }, 8000);

    sock.onopen = () => {
      sock.send(JSON.stringify({ t: 'join', projectId, name, clientId: getClientId() }));
        logDebug('sync', 'ws open', { projectId });
    };
    sock.onmessage = (ev) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        joinedProject = projectId;
        useStudio.getState().setServerStatus('on');
          logInfo('sync', 'joined', { projectId });
        bindOpSink((ops) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ t: 'op', ops }));
          }
        });
        resolve(msg.state as ProjectState);
      } else if (msg.t === 'error') {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error(msg.message || '加入失败'));
            logWarn('sync', 'server error', { message: msg.message });
        }
      } else if (msg.t === 'op') {
        useStudio.getState().applyRemoteOps(msg.ops as any);
      } else if (msg.t === 'peers') {
        useStudio.getState().setPeers(msg.peers as any);
      } else if (msg.t === 'presence') {
        useStudio.getState().updatePeer(msg.from as string, msg.data as any);
      }
    };
    sock.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('无法连接服务器'));
      }
        logError('sync', 'ws error', new Error('无法连接服务器'));
    };
    sock.onclose = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('连接被关闭'));
        logWarn('sync', 'ws closed', { projectId });
      }
      if (ws === sock) {
        useStudio.getState().setServerStatus('off');
        useStudio.getState().setPeers({});
        ws = null;
        joinedProject = null;
        bindOpSink(null);
      }
    };
  });
}

export function disconnect() {
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
    logInfo('sync', 'disconnect', { joinedProject });
  joinedProject = null;
  bindOpSink(null);
  useStudio.getState().setServerStatus('off');
  useStudio.getState().setPeers({});
}

/** 发布存在感（画布光标等），调用方自带节流 */
export function publishPresence(data: { px?: number; py?: number }) {
  lastPresence = { ...lastPresence, ...data };
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const s = useStudio.getState();
  ws.send(JSON.stringify({
    t: 'presence',
    data: { ...lastPresence, editingCardId: s.editingCardId, viewport: s.viewport },
  }));
}

/** 上传整个项目到服务器 */
export async function uploadProject(url: string, state: ProjectState): Promise<void> {
  const res = await fetch(url.replace(/\/+$/, '') + `/api/projects/${encodeURIComponent(state.meta.id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`上传失败：HTTP ${res.status}`);
}

/** 列出服务器项目 */
export async function listServerProjects(url: string): Promise<ProjectState['meta'][]> {
  const res = await fetch(url.replace(/\/+$/, '') + '/api/projects');
  if (!res.ok) throw new Error(`获取列表失败：HTTP ${res.status}`);
  return res.json();
}

/** 从服务器拉取项目 */
export async function fetchServerProject(url: string, id: string): Promise<ProjectState> {
  const res = await fetch(url.replace(/\/+$/, '') + `/api/projects/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`获取项目失败：HTTP ${res.status}`);
  return res.json();
}

/** 刷新页面后自动恢复协同连接（需 settings.lastServerProject 与当前项目一致） */
export function maybeAutoReconnect() {
  const s = useStudio.getState();
  if (s.serverStatus !== 'off') return;
  if (!s.settings.serverUrl || !s.meta) return;
  if (s.settings.lastServerProject !== s.meta.id) return;
  connectServer(s.settings.serverUrl, s.meta.id, s.settings.nickname)
    .then((state) => {
      useStudio.getState().applyRemoteProject(state);
    })
    .catch(() => { /* 静默失败，用户可手动连接 */ });
}

/** 清理长期离线的成员 */
setInterval(() => {
  const s = useStudio.getState();
  const now = Date.now();
  const dead = Object.values(s.peers).filter((p) => now - p.lastSeen > 8000).map((p) => p.id);
  if (dead.length) {
    const peers = { ...s.peers };
    dead.forEach((id) => delete peers[id]);
    s.setPeers(peers);
  }
}, 5000);
