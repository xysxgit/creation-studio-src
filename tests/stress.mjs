// ============ 暴力/稳定性压力测试 ============
// 用法：先启动服务器（npm run server 或 npm start），再运行：
//   npm run test:stress
// 覆盖：非法项目 ID / 畸形 JSON / 大量项目增删 / WebSocket 高频 op / 并发连接
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws') + '/ws';
const N_PROJECTS = Number(process.env.STRESS_PROJECTS || 30);
const N_OPS = Number(process.env.STRESS_OPS || 200);
const N_CLIENTS = Number(process.env.STRESS_CLIENTS || 5);

let failures = 0;
let passed = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`✓ ${name}${extra ? '  [' + extra + ']' : ''}`);
  } else {
    failures++;
    console.log(`✗ ${name}${extra ? '  [' + extra + ']' : ''}`);
  }
}

function randId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function api(path, options) {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { res, text, json };
}

function makeState(id) {
  const now = Date.now();
  return {
    meta: { id, name: `压力测试 ${id}`, type: 'novel', createdAt: now, updatedAt: now },
    sections: [{ id: 'sec1', name: '世界观', emoji: '🌍', color: '#6c5ce7' }],
    cards: {},
    edges: {},
    pages: {},
    pageOrder: [],
  };
}

function wsJoin(projectId, clientId, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_BASE);
    const timer = setTimeout(() => reject(new Error('join timeout')), 5000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', projectId, name, clientId }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'welcome') {
        clearTimeout(timer);
        resolve({ ws, state: msg.state });
      } else if (msg.t === 'error') {
        clearTimeout(timer);
        reject(new Error(msg.message || 'join error'));
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function waitFor(condFn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (condFn()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

// 1. 非法 ID 路径穿越防护
{
  const evil = '../evil';
  const r1 = await api(`/api/projects/${encodeURIComponent(evil)}`);
  ok('非法 GET 项目 ID 被拒绝', r1.res.status === 400 || r1.res.status === 404, `HTTP ${r1.res.status}`);
  const r2 = await api(`/api/projects/${encodeURIComponent(evil)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makeState('x')) });
  ok('非法 POST 项目 ID 被拒绝', r2.res.status === 400, `HTTP ${r2.res.status}`);
}

// 2. 畸形 JSON 不导致 500 崩溃
{
  const r = await api('/api/projects/badjson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not-json' });
  ok('畸形 JSON 返回 4xx/5xx 但不崩溃', r.res.status >= 400 && r.res.status < 600, `HTTP ${r.res.status}`);
}

// 3. 大量项目增删
{
  const ids = [];
  for (let i = 0; i < N_PROJECTS; i++) {
    const id = randId('stress');
    ids.push(id);
    const r = await api(`/api/projects/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makeState(id)) });
    if (r.res.status !== 200) {
      ok(`创建项目 ${i}`, false, `HTTP ${r.res.status}`);
      break;
    }
  }
  ok(`批量创建 ${N_PROJECTS} 个项目`, ids.length === N_PROJECTS);
  const list = await api('/api/projects');
  ok('项目列表接口正常', Array.isArray(list.json));
  for (const id of ids) {
    await api(`/api/projects/${id}`, { method: 'DELETE' });
  }
  ok(`批量删除 ${N_PROJECTS} 个项目`, true);
}

// 4. WebSocket 高频 op 与多客户端广播
{
  const projectId = randId('wsproj');
  const state = makeState(projectId);
  // 先上传项目
  const up = await api(`/api/projects/${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  ok('WS 测试项目上传', up.res.status === 200, `HTTP ${up.res.status}`);

  const clients = [];
  for (let i = 0; i < N_CLIENTS; i++) {
    try {
      const c = await wsJoin(projectId, `c${i}`, `用户${i}`);
      clients.push(c);
    } catch (e) {
      ok(`WS 客户端 ${i} 加入`, false, e.message);
    }
  }
  ok(`WS 多客户端加入 (${clients.length}/${N_CLIENTS})`, clients.length === N_CLIENTS);

  if (clients.length >= 2) {
    const sender = clients[0];
    const receiver = clients[1];
    let received = 0;
    receiver.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === 'op') received += (msg.ops || []).length;
    });

    const now = Date.now();
    const ops = [];
    for (let i = 0; i < N_OPS; i++) {
      const cardId = `card_${i}`;
      ops.push({
        id: `op_${i}_${now}`,
        client: 'c0',
        ts: now + i,
        type: 'card.upsert',
        payload: {
          card: {
            id: cardId, kind: 'note', sectionId: 'sec1', title: `卡 ${i}`,
            content: { type: 'doc', content: [{ type: 'paragraph' }] },
            x: i * 10, y: 0, w: 200, h: 120, z: i + 1,
            createdAt: now, updatedAt: now + i,
          },
        },
      });
    }
    sender.ws.send(JSON.stringify({ t: 'op', ops }));
    try {
      await waitFor(() => received >= N_OPS, 8000);
      ok(`WS 高频 op 广播 (${N_OPS} ops)`, received >= N_OPS, `received=${received}`);
    } catch (e) {
      ok(`WS 高频 op 广播 (${N_OPS} ops)`, false, e.message);
    }

    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
  }
}

console.log(`\n========== 压力测试结果 ==========`);
console.log(`通过 ${passed} 项，失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
