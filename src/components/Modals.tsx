/**
 * ============ 模态框宿主（所有弹窗统一入口） ============
 *  · ModalHost 根据 useStudio.modal 渲染对应弹窗：
 *    新建/打开/项目设置/设置/导出导入/协同/回收站/卡片回收站/写作模式/时间轴
 *  · 写作模式、时间轴（含日历）为懒加载子块
 *  · cmPrompt/csConfirm 等系统对话框见 SystemDialog.tsx
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 模态框：新建 / 打开 / 设置 / 导出 / 协同 ============
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useStudio } from '../store';
import { pickImage, isNative as isNativeEnv, shareFile, shareText } from '../native/nativeActions';
import { PAPER_SIZES, PROJECT_TYPE_LABEL, type EyeTheme, type PaperSize, type ProjectState, type ProjectType } from '../types';
import { PROJECT_TYPE_ENV_DESC, TYPE_SECTIONS } from '../defaults';
import { connectServer, disconnect, fetchServerProject, listServerProjects, uploadProject } from '../sync/ws';
import { downloadBlob, exportCanvasImage, exportProject, projectToHtml, projectToMarkdown, projectToTxt, saveBlobViaPicker } from '../export/export';
import { clearLogs, fmtTime, getLogs, toast, compressImageDataUrl, crashLogToText, clearCrashLogs } from '../util';
import { AI_ENDPOINT_PRESETS, saveCachedModels } from '../aiAgents';
// 重量级弹层懒加载：写作模式 / 时间轴·日历（含日历组件）
const WritingMode = lazy(() => import('./WritingMode'));
const TimelineHub = lazy(() => import('./TimelineHub'));
import { TrashIcon, CloseIcon, GearColorIcon, FolderIcon, RobotIcon, ImportIcon, DocIcon, SearchIcon, ClipboardIcon, ImageIcon, PencilIcon, PaintbrushIcon, BookIcon, BrainIcon, BoxIcon, CalendarColorIcon, TrashColorIcon, CheckIcon, AddIcon, SaveIcon, StarColorIcon, ExportIcon, LinkColorIcon, SparkleIcon, RestoreIcon, ReloadIcon, EyeIcon, SyncIcon } from './icons';

/** 云盘 WebDAV 预设（点击自动填入地址）。百度/夸克/360 等无原生 WebDAV，需经 AList 转接 */
const CLOUD_PRESETS: { label: string; url: string; hint?: string }[] = [
  { label: '坚果云', url: 'https://dav.jianguoyun.com/dav/创作助手', hint: '地址需以 /dav/ 开头，建议加一个目录名' },
  { label: 'Nextcloud', url: 'https://你的域名/remote.php/dav/files/用户名/创作助手', hint: 'Nextcloud 的 WebDAV 路径' },
  { label: 'Box', url: 'https://dav.box.com/dav/创作助手', hint: 'Box 支持 WebDAV' },
  { label: '🌐 AList(挂载 百度/夸克/360/115 等)', url: 'http://你的ip:5244/dav', hint: '百度/夸克/360 无原生 WebDAV，可在 NAS 装 AList 把网盘挂成 WebDAV 再填入' },
];

/** 护眼主题预设（观感配色，与 public/theme-overrides.css 的 data-cztheme 色板一致） */
const EYE_THEMES: { id: EyeTheme; name: string; dots: string[] }[] = [
  { id: '', name: '默认（跟随应用）', dots: ['#f5f8fd', '#ffffff', '#6a5cf5'] },
  { id: 'green', name: '豆沙绿 · 护眼', dots: ['#c9e4c9', '#e3f1e3', '#3e8e5a'] },
  { id: 'paper', name: '米白 · 纸质', dots: ['#f1e9d7', '#fbf6ea', '#a8722e'] },
  { id: 'warm', name: '暖夜 · 低刺激', dots: ['#28231e', '#2a2520', '#c99a5b'] },
  { id: 'ink', name: '墨蓝 · 冷静', dots: ['#1b2330', '#1f2836', '#5b8def'] },
];

// ---------- 弹窗通用外壳（标题/关闭/遮罩） ----------
// 所有弹窗（含操作说明）统一走此壳：mask + modal + head(标题/关闭) + [headExtra] + body
function ModalShell({ title, onClose, children, className = '', hideClose = false, headExtra }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; className?: string; hideClose?: boolean; headExtra?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-mask" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : '对话' }>
        <div className="modal-head">
          <h3>{title}</h3>
          {!hideClose && <button className="modal-x" aria-label="关闭" onClick={onClose}><CloseIcon /></button>}
        </div>
        {headExtra}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export { ModalShell };

// ---------- 新建项目 ----------
function DesktopSyncHero() {
  const [info, setInfo] = useState<{ urls: string[]; wsUrls: string[]; local: string } | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const updateSettings = useStudio((s) => s.updateSettings);
  useEffect(() => {
    const d = (window as any).creationDesktop;
    if (!d || !d.isDesktop) return;
    d.getLanInfo().then(setInfo).catch(() => {});
    d.getAutoStart().then(setAutoStart).catch(() => {});
  }, []);
  if (!info) return null;
  const host = info.urls[0] || info.local;
  const qrTarget = host;
  return (
    <div className="modal-sec desktop-sync">
      <h4><BoxIcon /> 本机 = 协同主控端</h4>
      <p className="hint">桌面版已内置协同服务器，打开即作为主控。其他设备（手机/平板）连下方地址即可加入协同。</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
        {info.urls.map((u, i) => (<div key={i}><code style={{ wordBreak: "break-all" }}>{u}</code></div>))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <img src={`${host}/apk/qr.svg?url=${encodeURIComponent(qrTarget)}`} alt="协同二维码" width={140} height={140} style={{ borderRadius: 8, border: "1px solid var(--border)" }} />
        <div className="hint" style={{ maxWidth: 260 }}>手机/平板扫描二维码进入本机协同页，即可与电脑进入同一项目、实时协同。</div>
      </div>
      <button style={{ marginTop: 10 }} onClick={() => { updateSettings({ serverUrl: info.local }); }}><BoxIcon /> 本机直接使用内置协同（{info.local}）</button>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" checked={autoStart} onChange={(e) => { const v = e.target.checked; setAutoStart(v); (window as any).creationDesktop?.setAutoStart?.(v); }} />
        开机自启协同（随系统启动自动作为主控端）
      </label>
    </div>
  );
}
// ---------- 弹窗：新建项目（类型/名称/样例） ----------
function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<ProjectType>('novel');
  const [name, setName] = useState('');
  const [withSample, setWithSample] = useState(false);
  const [cover, setCover] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const createProject = useStudio((s) => s.createProject);

  return (
    <ModalShell title="新建项目" onClose={onClose}>
      <div className="type-grid">
        {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => (
          <button key={t} className={`type-card ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
            <b>{PROJECT_TYPE_LABEL[t]}</b>
            <span>{t === 'novel' ? '章节式叙事' : t === 'rpg' ? '任务/装备/等级体系' : t === 'gal' ? '分支与好感度' : t === 'film' ? '分场与对白' : '全模板自由组合'}</span>
          </button>
        ))}
      </div>
      <div className="type-env-hint">
        <div className="type-env-desc">{PROJECT_TYPE_ENV_DESC[type]}</div>
        <div className="type-env-sections">
          {TYPE_SECTIONS[type].slice(0, 8).map((name) => (
            <span key={name} className="type-env-chip">{name}</span>
          ))}
          {TYPE_SECTIONS[type].length > 8 && <span className="type-env-chip">+{TYPE_SECTIONS[type].length - 8}</span>}
        </div>
      </div>
      <label className="fld">
        <span>项目名称</span>
        <input value={name} placeholder={`${PROJECT_TYPE_LABEL[type]} · 未命名`} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      {/* 兼容层：保留隐藏的样例项目开关，界面上不再展示“附带完整样例项目”勾选项 */}
      <input
        type="checkbox"
        checked={withSample}
        onChange={(e) => setWithSample(e.target.checked)}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="fld">
        <span>项目封面（可选）</span>
        <div className="cover-picker" onClick={async () => {
          // 原生端：系统相册选图
          if (isNativeEnv()) {
            try {
              const r = await pickImage();
              if (r?.dataUrl) setCover(r.dataUrl);
              return;
            } catch { /* 回退 web */ }
          }
          coverInputRef.current?.click();
        }}>
          {cover ? (
            <img className="cover-preview" src={cover} alt="项目封面" />
          ) : (
            <div className="cover-placeholder">
              <span className="cover-placeholder-icon">📷</span>
              点击选择封面
              <small>未设置时将使用项目名称生成封面</small>
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const r = new FileReader();
              r.onload = async () => {
                const dataUrl = String(r.result || '');
                const finalSrc = await compressImageDataUrl(dataUrl);
                setCover(finalSrc);
              };
              r.readAsDataURL(f);
            }}
          />
          <button type="button" className="btn small cover-pick-btn">{cover ? '更换封面' : '选择图片'}</button>
        </div>
        {cover && (
          <button type="button" className="btn small" onClick={() => setCover('')}>移除封面</button>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn primary" onClick={() => {
          const id = createProject(type, name.trim(), withSample, cover || undefined);
          toast('项目已创建 🎉', 'ok');
          onClose();
        }}>创建项目 🪄</button>
      </div>
    </ModalShell>
  );
}

// ---------- 打开项目 ----------
function OpenProjectModal({ onClose }: { onClose: () => void }) {
  const projects = useStudio((s) => s.projects);
  const folders = useStudio((s) => s.folders);
  const openProject = useStudio((s) => s.openProject);
  const deleteProject = useStudio((s) => s.deleteProject);
  const addFolder = useStudio((s) => s.addFolder);
  const renameFolder = useStudio((s) => s.renameFolder);
  const deleteFolder = useStudio((s) => s.deleteFolder);
  const setProjectFolder = useStudio((s) => s.setProjectFolder);
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const [srvUrl, setSrvUrl] = useState(settings.serverUrl);
  const [serverList, setServerList] = useState<{ id: string; name: string; type: string; updatedAt: number }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!data?.meta?.id || !Array.isArray(data.sections)) throw new Error('不是有效的创作助手项目 JSON');
      useStudio.getState().importProjectState(data);
      toast(`已导入项目「${data.meta.name || '未命名'}」`, 'ok');
      onClose();
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'err');
    }
  };

  const refreshServer = async () => {
    if (!srvUrl.trim()) {
      toast('请先填写服务器地址', 'warn');
      return;
    }
    setLoading(true);
    updateSettings({ serverUrl: srvUrl.trim() });
    try {
      setServerList(await listServerProjects(srvUrl.trim()));
    } catch (e) {
      toast(`获取服务器项目失败：${(e as Error).message}`, 'err');
    }
    setLoading(false);
  };

  const openServer = async (id: string) => {
    try {
      const state = await fetchServerProject(srvUrl.trim(), id);
      updateSettings({ serverUrl: srvUrl.trim() });
      useStudio.getState().applyRemoteProject(state);
      // 建立实时连接，进入协同
      try {
        const live = await connectServer(srvUrl.trim(), id, useStudio.getState().settings.nickname);
        useStudio.getState().applyRemoteProject(live);
        updateSettings({ serverUrl: srvUrl.trim(), lastServerProject: id });
        toast('已从服务器打开，进入实时协同 👥', 'ok');
      } catch (e2) {
        toast(`已打开（实时连接失败：${(e2 as Error).message}）`, 'warn');
      }
      onClose();
    } catch (e) {
      toast(`打开失败：${(e as Error).message}`, 'err');
    }
  };

  const projRow = (p: typeof projects[number], folderSelect = true) => (
    <div key={p.id} className="proj-item">
      <button className="proj-main" onClick={() => { openProject(p.id); onClose(); }}>
        <b>{p.name}</b>
        <span>{PROJECT_TYPE_LABEL[p.type]} · 更新于 {fmtTime(p.updatedAt)}</span>
      </button>
      {folderSelect && (
        <select
          className="proj-folder-select"
          title="移动到文件夹"
          value={p.folderId || ''}
          onChange={(e) => setProjectFolder(p.id, e.target.value)}
        >
          <option value="">未分组</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>📁 {f.name}</option>
          ))}
        </select>
      )}
      <button className="btn small danger" title="删除" onClick={async () => {
        if (await csConfirm(`删除项目「${p.name}」？此操作不可恢复。`)) deleteProject(p.id);
      }}><TrashIcon size={14} /></button>
    </div>
  );

  const ungrouped = projects.filter((p) => !p.folderId);
  const inFolder = (fid: string) => projects.filter((p) => p.folderId === fid);

  return (
    <ModalShell title="打开 / 导入项目" onClose={onClose} className="modal-open-project">
      <div className="modal-sec folder-bar">
        <button
          className="btn small"
          onClick={async () => {
            const name = await csPrompt('文件夹名称：', '我的创作');
            if (name !== null && name.trim()) {
              addFolder(name.trim());
              toast('已新建文件夹 📁', 'ok');
            }
          }}
        >
          ＋ 新建文件夹
        </button>
        <button
          className="btn small"
          onClick={() => useStudio.getState().setModal('trash')}
          title="删除的项目可在这里恢复"
        >
          <TrashColorIcon /> 回收站{useStudio.getState().trashProjects.length ? `（${useStudio.getState().trashProjects.length}）` : ''}
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()} title="导入 JSON 备份"><ImportIcon /> 导入 JSON</button>
        <span className="hint">用文件夹分组整理项目；项目可随时移动</span>
      </div>
      <div className="proj-list">
        {folders.map((f) => {
          const list = inFolder(f.id);
          return (
            <div key={f.id} className="folder-block">
              <div className="folder-head">
                <span className="folder-name"><FolderIcon size={13} /> {f.name}</span>
                <em>{list.length} 个项目</em>
                <span className="folder-actions">
                  <button title="重命名文件夹" onClick={async () => {
                    const name = await csPrompt('文件夹名称：', f.name);
                    if (name !== null && name.trim()) renameFolder(f.id, name.trim());
                  }}><PencilIcon size={14} /></button>
                  <button title="删除文件夹（项目移到未分组）" onClick={async () => {
                    if (await csConfirm(`删除文件夹「${f.name}」？其中项目将移到「未分组」。`)) deleteFolder(f.id);
                  }}><TrashIcon size={14} /></button>
                </span>
              </div>
              {list.length ? list.map((p) => projRow(p, false)) : <div className="muted pad-sm">（空文件夹）</div>}
            </div>
          );
        })}
        {ungrouped.length > 0 && (
          <div className="folder-block">
            <div className="folder-head">
              <span className="folder-name">🗃 未分组</span>
              <em>{ungrouped.length} 个项目</em>
            </div>
            {ungrouped.map((p) => projRow(p))}
          </div>
        )}
        {!projects.length && <div className="muted pad">还没有本地项目，点「新建项目」开始吧</div>}
      </div>
      <div className="modal-sec">
        <h4>🌐 从局域网服务器打开</h4>
        <div className="fld">
          <span>服务器地址</span>
          <input value={srvUrl} placeholder="http://192.168.1.100:8787" onChange={(e) => setSrvUrl(e.target.value)} />
        </div>
        {serverList ? (
          <div className="proj-list">
            {serverList.map((p) => (
              <div key={p.id} className="proj-item">
                <button className="proj-main" onClick={() => openServer(p.id)}>
                  <b>{p.name}</b>
                  <span>{PROJECT_TYPE_LABEL[p.type as ProjectType] || p.type} · {fmtTime(p.updatedAt)}</span>
                </button>
              </div>
            ))}
            {!serverList.length && <div className="muted pad">服务器上还没有项目</div>}
          </div>
        ) : (
          <button className="btn" onClick={refreshServer} disabled={loading}>
            {loading ? '加载中…' : '刷新服务器列表'}
          </button>
        )}
        <p className="hint">需要先在服务器上运行的「创作助手」中上传项目，其他人才可见。</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          doImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </ModalShell>
  );
}

// ---------- 设置 ----------
function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const meta = useStudio((s) => s.meta);
const cloudVersions = useStudio((s) => s.cloudVersions);
const cloudStatus = useStudio((s) => s.cloudStatus);
const [selCloudVer, setSelCloudVer] = useState('');
  // ---- AI 连接测试 / 读取模型 ----
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTest, setAiTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [aiModels, setAiModels] = useState<string[] | null>(null);
  /** 去掉尾部斜杠与 /chat/completions 后缀，得到 API 根地址 */
  const aiBaseUrl = () => (settings.ai.endpoint || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  /** 调用 OpenAI 兼容 /models 接口读取模型列表（成功返回 id 数组，失败抛错） */
  const requestAiModels = async (): Promise<string[]> => {
    const base = aiBaseUrl();
    if (!base) throw new Error('请先填写 API 地址');
    const res = await fetch(`${base}/models`, {
      headers: settings.ai.apiKey ? { Authorization: `Bearer ${settings.ai.apiKey}` } : {},
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 160);
      throw new Error(`HTTP ${res.status}${body ? '：' + body : ''}`);
    }
    const data = (await res.json().catch(() => ({}))) as { data?: unknown[]; models?: unknown[] };
    const arr: unknown[] = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const list = arr
      .map((m) => {
        if (typeof m === 'string') return m;
        const x = m as { id?: string; name?: string; model?: string };
        return x.id || x.name || x.model || '';
      })
      .filter(Boolean) as string[];
    return list;
  };
  const testAiConnection = async () => {
    setAiBusy(true);
    setAiTest(null);
    const t0 = Date.now();
    try {
      const list = await requestAiModels();
      const ms = Date.now() - t0;
      setAiModels(list);
      setAiTest({ ok: true, msg: `✅连接成功（${ms}ms）${list.length ? `，接口返回 ${list.length} 个模型` : '，接口可用但未返回模型列表'}` });
      toast('AI 连接成功', 'ok');
    } catch (e) {
      setAiTest({ ok: false, msg: `❌连接失败：${(e as Error).message}` });
      toast(`AI 连接失败：${(e as Error).message}`, 'err');
    }
    setAiBusy(false);
  };
  const loadAiModels = async () => {
    setAiBusy(true);
    setAiTest(null);
    try {
      const list = await requestAiModels();
      if (!list.length) throw new Error('接口未返回模型列表');
      setAiModels(list);
      saveCachedModels(list);
      if (!settings.ai.model) updateSettings({ ai: { ...settings.ai, model: list[0] } });
      setAiTest({ ok: true, msg: `✅已读取 ${list.length} 个模型，可从下方下拉选择` });
      toast(`已读取 ${list.length} 个模型`, 'ok');
    } catch (e) {
      const msg = (e as Error).message;
      setAiTest({ ok: false, msg: `❌读取模型失败：${msg}` });
      toast(`读取模型失败：${msg}`, 'err');
    }
    setAiBusy(false);
  };
  const [logs, setLogs] = useState(getLogs());
  const refreshLogs = () => setLogs(getLogs());
  // —— 自动刷新：设置在开时每 1s 重读日志，新增记录自动浮现（类 ComfyUI 的实时感，无需手点刷新）——
  const preRef = useRef<HTMLPreElement>(null);
  const lastLogSig = useRef({ n: logs.length, lastTs: logs.length ? logs[logs.length - 1].ts : 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const l = getLogs();
      const sig = { n: l.length, lastTs: l.length ? l[l.length - 1].ts : 0 };
      if (sig.n !== lastLogSig.current.n || sig.lastTs !== lastLogSig.current.lastTs) {
        lastLogSig.current = sig;
        setLogs(l);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  // 有新增时跟随最末一行（自动滚到底，让新日志可见）
  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);
  // —— 排查/实时 两用视图 ——
  const [logView, setLogView] = useState<'live' | 'diag'>('diag');
  const [lv, setLv] = useState<'error' | 'warn'>('error');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const errN = logs.filter((l) => l.level === 'error').length;
  const warnN = logs.filter((l) => l.level === 'warn').length;
  const problems = logs.filter((l) => l.level === lv).slice().reverse();
  const formatLogs = () => logs.map((l) => {
    const time = new Date(l.ts).toLocaleString('zh-CN', { hour12: false });
    const data = l.data !== undefined ? ' ' + (typeof l.data === 'string' ? l.data : JSON.stringify(l.data)) : '';
    const stack = l.stack ? '\n' + l.stack : '';
    return `[${time}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${data}${stack}`;
  }).join('\n');
  const copyLogs = async () => {
    const text = formatLogs();
    try {
      await navigator.clipboard.writeText(text);
      toast('日志已复制', 'ok');
    } catch {
      toast('复制失败，请手动选择复制', 'err');
    }
  };
  const exportLogs = () => {
    const text = formatLogs();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `创作助手日志-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    toast('日志已导出', 'ok');
  };
  // —— 崩溃日志（持久化于 localStorage，不随刷新丢失）导出/清空 ——
  const exportCrashLogs = () => {
    const text = crashLogToText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `创作助手崩溃日志-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    toast('崩溃日志已导出', 'ok');
  };
  return (
    <ModalShell title="设置" onClose={onClose}>
      <div className="modal-sec">
        <h4><PaintbrushIcon /> 外观</h4>
        <div className="fld">
          <span>主题模式</span>
          <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'system' })}>
            <option value="light">☀️ 亮色</option>
            <option value="dark">🌙 深色</option>
            <option value="system">🖥️ 跟随系统</option>
          </select>
          {settings.theme === 'system' && <p className="hint">跟随系统外观自动切换亮/暗，也会即时响应系统的深色模式变化。</p>}
        </div>
        <div className="fld eyetheme-fld">
          <div className="fld-row-h">
            <span className="fld-lbl">护眼主题</span>
            <span className="eyetheme-cur">{EYE_THEMES.find((t) => (settings.czTheme || '') === t.id)?.name || ''}</span>
          </div>
          <div className="eyetheme-picker" role="radiogroup" aria-label="护眼主题预设">
            {EYE_THEMES.map((t) => {
              const sel = (settings.czTheme || '') === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  className={`eyetheme-opt ${sel ? 'on' : ''}`}
                  title={t.name}
                  onClick={() => updateSettings({ czTheme: t.id as EyeTheme })}
                >
                  <span className="eyetheme-dot" style={{ background: `linear-gradient(90deg, ${t.dots[0]}, ${t.dots[1]})` }} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="fld row">
          <span>画布网格</span>
          <input type="checkbox" checked={settings.grid} onChange={(e) => updateSettings({ grid: e.target.checked })} />
        </div>
        <div className="fld">
          <span>屏幕方向（安卓端生效）</span>
          <select value={settings.orientation} onChange={(e) => updateSettings({ orientation: e.target.value as 'auto' | 'portrait' | 'landscape' })}>
            <option value="auto">跟随系统</option>
            <option value="portrait">竖屏</option>
            <option value="landscape">横屏</option>
          </select>
        </div>
      </div>
      <div className="modal-sec">
        <h4><SaveIcon /> 保存</h4>
        <div className="fld row">
          <span>自动保存（每次修改后立即写入本地）</span>
          <input type="checkbox" checked={settings.autoSave} onChange={(e) => updateSettings({ autoSave: e.target.checked })} />
        </div>
        <p className="hint">自动保存开启时每次修改即时保存；关闭时仅在点「💾 保存」或 Ctrl+S 时保存（页面关闭前仍会自动落盘，防止丢失）。关闭后顶栏会显示保存状态。</p>
        <div className="modal-actions">
          <button className="btn primary" onClick={() => useStudio.getState().saveNow(true)}><SaveIcon /> 立即保存</button>
        </div>
      </div>
      <div className="modal-sec">
        <h4><SyncIcon /> 云盘同步（WebDAV）</h4>
        <div className="fld row">
          <span>启用云盘同步（自动备份项目到云盘）</span>
          <input type="checkbox" checked={settings.cloud.enabled} onChange={(e) => updateSettings({ cloud: { ...settings.cloud, enabled: e.target.checked } })} />
        </div>
        <div className="fld">
          <span>WebDAV 地址</span>
          <input
            value={settings.cloud.url}
            placeholder="https://dav.jianguoyun.com/dav/创作助手（坚果云等主流云盘）"
            onChange={(e) => updateSettings({ cloud: { ...settings.cloud, url: e.target.value } })}
          />
        </div>
        <div className="fld">
          <span>网盘预设（点击自动填入，支持 WebDAV 的网盘）</span>
          <div className="ai-presets">
            {CLOUD_PRESETS.map((p) => (
              <button
                key={p.label}
                title={p.hint || p.url}
                onClick={() => updateSettings({ cloud: { ...settings.cloud, url: p.url, enabled: true } })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint">百度网盘 / 夸克网盘 / 360网盘没有原生 WebDAV 接口，无法直接同步；可在 NAS 用「AList」把它们挂载成 WebDAV 后填入上面的地址。</p>
        </div>
        <div className="fld">
          <span>账号</span>
          <input value={settings.cloud.user} placeholder="云盘账号（坚果云建议用邮箱）" onChange={(e) => updateSettings({ cloud: { ...settings.cloud, user: e.target.value } })} />
        </div>
        <div className="fld">
          <span>应用密码</span>
          <input type="password" value={settings.cloud.pass} placeholder="云盘应用密码 / 授权码" onChange={(e) => updateSettings({ cloud: { ...settings.cloud, pass: e.target.value } })} />
        </div>
        <div className="fld">
          <span>自动同步间隔（分钟）</span>
          <input type="number" min={1} max={240} value={settings.cloud.intervalMin} onChange={(e) => updateSettings({ cloud: { ...settings.cloud, intervalMin: Math.max(1, Number(e.target.value) || 10) } })} />
        </div>
        <p className="hint">
          支持 WebDAV 的主流云盘：坚果云（<code>https://dav.jianguoyun.com/dav/目录</code>）、Nextcloud、Box 等。
           同步经局域网服务器转发以绕过浏览器 CORS 限制（未配置服务器地址时尝试直连）。
           每次同步会在云盘生成一份 <code>项目名-v版本-时间戳.json</code> 多版本备份（自动保留最近30份）；
           账号密码仅存本机浏览器。恢复可下拉选择历史版本，恢复前会自动先把当前项目备份一份到云盘。
         </p>
         <div className="modal-actions">
           <button
             className="btn"
             disabled={cloudStatus === 'syncing'}
             onClick={() => useStudio.getState().cloudSyncNow()}
           >
{cloudStatus === 'syncing' ? '同步中…' : <><SyncIcon /> 立即同步（多版本）</>}
            </button>
            <button className="btn" onClick={() => useStudio.getState().cloudRefreshVersions()}><ReloadIcon /> 列出云端版本</button>
           <span className="hint cloud-status">
             {cloudStatus === 'ok' ? '✅ 上次同步成功' :
              cloudStatus === 'err' ? '❌ 上次同步失败' : '未同步'}
           </span>
         </div>
         {cloudVersions.length > 0 && (
           <div className="fld" style={{ marginTop: 6 }}>
             <span>选择要恢复的云端备份（共 {cloudVersions.length} 份）</span>
             <select
               value={selCloudVer}
               onChange={(e) => setSelCloudVer(e.target.value)}
             >
               {cloudVersions.map((f, i) => (
                 <option key={i} value={f}>📁 {f}</option>
               ))}
             </select>
             <div className="modal-actions">
               <button
                 className="btn danger"
                 disabled={!selCloudVer}
                 onClick={() => useStudio.getState().cloudRecoverVersion(selCloudVer)}
               >
                 ⬇ 恢复所选版本（恢复前自动备份当前到云盘）
               </button>
             </div>
           </div>
         )}
       </div>
      <DesktopSyncHero />
      <div className="modal-sec">
        <h4>🌐 局域网协同</h4>
        <div className="fld">
          <span>昵称（协同显示）</span>
          <input value={settings.nickname} placeholder="在这台设备上的名称，他人协同中可见" onChange={(e) => updateSettings({ nickname: e.target.value })} />
        </div>
        <div className="fld">
          <span>服务器地址</span>
          <input value={settings.serverUrl} placeholder="http://192.168.1.100:8787" onChange={(e) => updateSettings({ serverUrl: e.target.value })} />
        </div>
        <p className="hint">运行 <code>npm start</code> 的电脑会打印局域网地址；本机运行时可填 <code>http://localhost:8787</code>。</p>
      </div>
      <div className="modal-sec">
        <h4><RobotIcon /> AI 助手（可选）</h4>
        <div className="fld row">
          <span>启用 AI</span>
          <input type="checkbox" checked={settings.ai.enabled} onChange={(e) => updateSettings({ ai: { ...settings.ai, enabled: e.target.checked } })} />
        </div>
        <div className="fld">
          <span>服务预设（点击自动填入）</span>
          <div className="ai-presets">
            {AI_ENDPOINT_PRESETS.map((p) => (
              <button
                key={p.label}
                title={p.hint || p.endpoint}
                onClick={() => updateSettings({ ai: { ...settings.ai, endpoint: p.endpoint, model: p.model } })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="fld">
          <span>API 地址</span>
          <input value={settings.ai.endpoint} placeholder="https://api.deepseek.com/v1 或 http://localhost:11434/v1" onChange={(e) => updateSettings({ ai: { ...settings.ai, endpoint: e.target.value } })} />
        </div>
        <div className="fld">
          <span>API 密钥</span>
          <input type="password" value={settings.ai.apiKey} placeholder="sk-…（本地模型可留空）" onChange={(e) => updateSettings({ ai: { ...settings.ai, apiKey: e.target.value } })} />
        </div>
        <div className="btn-row ai-test-actions">
          <button className="btn small" disabled={aiBusy || !settings.ai.endpoint.trim()} onClick={testAiConnection}>
            {aiBusy ? '处理中…' : <><LinkColorIcon /> 连接测试</>}
          </button>
          <button className="btn small" disabled={aiBusy || !settings.ai.endpoint.trim()} onClick={loadAiModels}>
            {aiBusy ? '处理中…' : <><ImportIcon /> 读取模型</>}
          </button>
        </div>
        {aiTest && <p className={`ai-test ${aiTest.ok ? 'ok' : 'err'}`}>{aiTest.msg}</p>}
        <div className="fld">
          <span>模型</span>
          <input value={settings.ai.model} placeholder="deepseek-chat / qwen2.5:7b" onChange={(e) => updateSettings({ ai: { ...settings.ai, model: e.target.value } })} />
        </div>
        {aiModels && aiModels.length > 0 && (
          <div className="fld">
            <span>选择已读取的模型</span>
            <select value="" onChange={(e) => { const v = e.target.value; if (v) { updateSettings({ ai: { ...settings.ai, model: v } }); toast(`已选择模型：${v}`, 'ok'); } }}>
              <option value="">⬇ 从列表中选择…</option>
              {aiModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        <p className="hint">密钥只保存在本机浏览器，不会上传。支持 OpenAI 兼容接口（DeepSeek / Kimi / 通义 / OpenAI 等）。</p>
        <p className="hint">
          🧠 <b>本地模型</b>：选择「Ollama 本地」或「LM Studio 本地」预设即可接入本机模型（地址为 localhost，无需密钥）。也可在局域网内填其他电脑的 IP，如 <code>http://192.168.1.8:11434/v1</code>。
        </p>
      </div>
      <div className="modal-sec">
        <h4><ClipboardIcon /> 日志（用于排查问题）</h4>
        <div className="log-actions">
          <button className="btn small" onClick={refreshLogs}><ReloadIcon /> 刷新</button>
          <button className="btn small" onClick={copyLogs}><ClipboardIcon /> 复制</button>
          <button className="btn small" onClick={exportLogs}><ExportIcon /> 导出</button>
          <button className="btn small" onClick={exportCrashLogs}><ExportIcon /> 崩溃日志</button>
          <button className="btn small danger" onClick={() => { clearLogs(); refreshLogs(); toast('日志已清空', 'ok'); }}><TrashColorIcon /> 清空</button>
          <button className="btn small danger" onClick={() => { clearCrashLogs(); toast('崩溃日志已清空', 'ok'); }}><TrashColorIcon /> 清崩溃</button>
        </div>
        <div className="log-sum">
          <div className="log-vtabs">
            <button className={logView === 'diag' ? 'on' : ''} onClick={() => setLogView('diag')}><SearchIcon /> 排查</button>
            <button className={logView === 'live' ? 'on' : ''} onClick={() => setLogView('live')}><EyeIcon /> 实时</button>
          </div>
          <div className="log-count">
            <span className={errN ? 'count-bad err' : 'count-ok'}>✗ 错误 {errN}</span>
            <span className={warnN ? 'count-bad warn' : 'count-ok'}>⚠ 警告 {warnN}</span>
            <span className="count-info">共 {logs.length}</span>
          </div>
        </div>
        {logView === 'diag' ? (
          <div className="diag-panel">
            <div className="diag-filter">
              <span className="f-hint">只看：</span>
              <button className={`diag-lv ${lv === 'error' ? 'on' : ''}`} onClick={() => setLv('error')}>✗ 错误</button>
              <button className={`diag-lv w ${lv === 'warn' ? 'on' : ''}`} onClick={() => setLv('warn')}>⚠ 警告</button>
            </div>
            {problems.length === 0 ? (
              <div className="diag-empty">✅ 当前没有{lv === 'error' ? '错误' : '警告'}，运行正常。</div>
            ) : (
              <div className="diag-list">
                {problems.map((pl) => (
                  <div key={pl.id} className="diag-item">
                    <button className="diag-row" onClick={() => setOpenRow(openRow === pl.id ? null : pl.id)}>
                      <span className="diag-med">{pl.code ? pl.code : (lv === 'error' ? 'ERR' : 'WARN')}</span>
                      <span className="diag-msg">{pl.message}</span>
                      <span className="diag-src">{pl.source}</span>
                      <span className="diag-chev">{openRow === pl.id ? '⌃' : '⌄'}</span>
                    </button>
                    {openRow === pl.id && pl.code && (
                      <div className="diag-detail">错误码 {pl.code} · 也可用它在本页搜索定位</div>
                    )}
                    {openRow === pl.id && pl.stack && <pre className="diag-stack">{pl.message}{pl.stack ? '\n' + pl.stack : ''}{pl.data !== undefined ? '\n' + (typeof pl.data === 'string' ? pl.data : JSON.stringify(pl.data)) : ''}</pre>}
                  </div>
                ))}
              </div>
            )}
            <p className="hint diag-tip">提示：日志只在设备本地，报错不会被自动上传。点某条可展开更多细节，或「📋 复制」整份发给维护者。</p>
          </div>
        ) : (
          <pre ref={preRef} className="log-view">{logs.length ? formatLogs() : '暂无日志'}</pre>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>完成</button>
      </div>
    </ModalShell>
  );
}

// ---------- 项目设置 ----------
function ProjectSettingsModal({ onClose }: { onClose: () => void }) {
  const meta = useStudio((s) => s.meta);
  const sections = useStudio((s) => s.sections);
  const cards = useStudio((s) => s.cards);
  const edges = useStudio((s) => s.edges);
  const pages = useStudio((s) => s.pages);
  const renameProject = useStudio((s) => s.renameProject);
  const deleteProject = useStudio((s) => s.deleteProject);
  const closeProject = useStudio((s) => s.closeProject);
  const patchMeta = useStudio((s) => s.patchMeta);
  const [name, setName] = useState(meta?.name || '');

  if (!meta) return null;
  const visibleCards = Object.values(cards).filter((c) => !c.writingOnly);
  const visibleCardIds = new Set(visibleCards.map((c) => c.id));
  const visibleEdges = Object.values(edges).filter((e) => visibleCardIds.has(e.from) && visibleCardIds.has(e.to));
  const totalWords = visibleCards.reduce((sum, c) => sum + (c.content ? JSON.stringify(c.content).length : 0), 0);

  return (
    <ModalShell title={<><GearColorIcon /> 项目设置</>} onClose={onClose}>
      <div className="modal-sec">
        <div className="fld">
          <span>项目名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== meta.name) renameProject(name.trim()); }} />
        </div>
        <div className="fld">
          <span>项目类型</span>
          <input value={PROJECT_TYPE_LABEL[meta.type]} disabled />
        </div>
        <div className="fld">
          <span>创建时间</span>
          <input value={fmtTime(meta.createdAt)} disabled />
        </div>
        <div className="fld">
          <span>纸张规格</span>
          <select
            value={meta.paper || 'A4'}
            onChange={(e) => patchMeta({ paper: e.target.value as PaperSize })}
            title="项目统一纸张规格（6.3）：卡片文字面与正文稿纸共用同一规格，比例固定；切换时卡片与正文同步按新规格排版"
          >
            {(Object.keys(PAPER_SIZES) as PaperSize[]).map((k) => (
              <option key={k} value={k}>{PAPER_SIZES[k].label}</option>
            ))}
          </select>
        </div>
        <p className="hint">
          页面 {pages.length} 个 · 分区 {sections.length} 个 · 卡片 {visibleCards.length} 张 · 连线 {visibleEdges.length} 条 · 正文 {useStudio.getState().manuscript.chapters.length} 章
        </p>
      </div>
      <div className="modal-sec">
        <h4><FolderIcon /> 项目管理</h4>
        <div className="btn-grid">
          <button className="btn" onClick={() => { onClose(); useStudio.getState().setModal('new'); }}><AddIcon /> 新建项目</button>
          <button className="btn" onClick={() => { onClose(); useStudio.getState().setModal('open'); }}><FolderIcon /> 打开项目</button>
          <button className="btn" onClick={() => { closeProject(); onClose(); }}><CloseIcon /> 关闭项目</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (await csConfirm(`删除项目「${meta.name}」？此操作不可恢复。`)) {
                deleteProject(meta.id);
                onClose();
              }
            }}
          >
            <TrashIcon size={14} /> 删除项目
          </button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>完成</button>
      </div>
    </ModalShell>
  );
}

// ---------- 回收站（项目）----------
function TrashModal({ onClose }: { onClose: () => void }) {
  const trashProjects = useStudio((s) => s.trashProjects);
  const restoreProject = useStudio((s) => s.restoreProject);
  const purgeProject = useStudio((s) => s.purgeProject);
  return (
    <ModalShell title={<><TrashColorIcon /> 回收站（项目）</>} onClose={onClose} className="modal-trash">
      {trashProjects.length ? (
        <div className="proj-list">
          {trashProjects.map((t) => (
            <div key={t.meta.id} className="proj-item">
              <div className="proj-main" style={{ cursor: 'default' }}>
                <b>{t.meta.name}</b>
                <span>{PROJECT_TYPE_LABEL[t.meta.type]} · 删除于 {fmtTime(t.meta.updatedAt)}</span>
              </div>
              <button className="btn small" title="恢复项目" onClick={() => restoreProject(t.meta.id)}>↩ 恢复</button>
              <button className="btn small danger" title="彻底删除" onClick={() => purgeProject(t.meta.id)}><TrashIcon size={14} /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon"><TrashColorIcon /></span>
          <span>回收站是空的</span>
          <span className="hint">删除的项目会先进入回收站，可随时恢复；彻底删除后不可恢复。</span>
        </div>
      )}
    </ModalShell>
  );
}

// ---------- 弹窗：卡片回收站 ----------
function CardTrashModal({ onClose }: { onClose: () => void }) {
  const trashCards = useStudio((s) => s.trashCards);
  const restoreCardFromTrash = useStudio((s) => s.restoreCardFromTrash);
  const purgeTrashCard = useStudio((s) => s.purgeTrashCard);
  const clearTrashCards = useStudio((s) => s.clearTrashCards);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleAll = () => {
    setChecked((prev) => prev.size === trashCards.length ? new Set<number>() : new Set(trashCards.map((_, i) => i)));
  };
  const restoreSelected = () => {
    if (!checked.size) return;
    [...checked].sort((a, b) => b - a).forEach((i) => restoreCardFromTrash(i));
    setChecked(new Set());
    toast('已恢复所选卡片', 'ok');
  };
  const purgeSelected = async () => {
    if (!checked.size) return;
    if (!await csConfirm(`彻底删除选中的 ${checked.size} 张卡片？`)) return;
    [...checked].sort((a, b) => b - a).forEach((i) => purgeTrashCard(i));
    setChecked(new Set());
    toast('已彻底删除所选卡片', 'ok');
  };

  return (
    <ModalShell title={<><TrashColorIcon /> 卡片回收站</>} onClose={onClose} className="modal-sm modal-trash">
      {trashCards.length ? (
        <>
          <div className="trash-toolbar">
            <label className="trash-check-all">
              <input type="checkbox" checked={checked.size === trashCards.length} onChange={toggleAll} />
              全选
            </label>
            <button className="btn small" disabled={!checked.size} onClick={restoreSelected}><RestoreIcon /> 恢复选中</button>
            <button className="btn small danger" disabled={!checked.size} onClick={purgeSelected}><TrashColorIcon /> 删除选中</button>
          </div>
          <div className="trash-list">
            {trashCards.map((tc, i) => (
              <div key={i} className={`trash-item ${checked.has(i) ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                <span className="trash-title">{tc.title || '未命名卡片'}</span>
                <button title="恢复" onClick={() => { restoreCardFromTrash(i); setChecked((prev) => { const n = new Set(prev); n.delete(i); return n; }); }}>↩</button>
                <button title="彻底删除" onClick={async () => { if (await csConfirm('彻底删除这张卡片？')) { purgeTrashCard(i); setChecked((prev) => { const n = new Set(prev); n.delete(i); return n; }); } }}><TrashIcon size={13} /></button>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={async () => { if (await csConfirm('清空卡片回收站？')) { clearTrashCards(); setChecked(new Set()); } }}>清空回收站</button>
          </div>
        </>
      ) : (
        <>
          <div className="empty">
            <span className="empty-icon"><TrashColorIcon /></span>
            <span>卡片回收站是空的</span>
            <span className="hint">删除的卡片会先进入这里，可恢复或彻底删除；支持多选批量清理。</span>
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ---------- 导出 ----------
type ExportFormat = 'md' | 'html' | 'doc' | 'txt' | 'json' | 'image';

function exportDefaultName(format: ExportFormat) {
  const safe = (useStudio.getState().meta?.name || '未命名项目').replace(/[\\/:*?"<>|]/g, '_');
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return format === 'image' ? `${safe}_画布_${stamp}.png` : `${safe}_${stamp}.${format}`;
}

function exportMime(format: ExportFormat) {
  return format === 'md' ? 'text/markdown;charset=utf-8'
    : format === 'html' ? 'text/html;charset=utf-8'
    : format === 'doc' ? 'application/msword'
    : format === 'json' ? 'application/json'
    : format === 'image' ? 'image/png'
    : 'text/plain;charset=utf-8';
}

/** 简易 Markdown → HTML（用于导出预览渲染，效果等同下载后打开） */
function mdInline(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '"');
  let html = '';
  let listOpen = false;
  const closeList = () => { if (listOpen) { html += '</ul>'; listOpen = false; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const lvl = (line.match(/^#+/) as RegExpMatchArray)[0].length;
      html += `<h${lvl}>${mdInline(esc(line.replace(/^#+\s*/, '')))}</h${lvl}>\n`;
    } else if (/^\s*[-*]\s/.test(line)) {
      if (!listOpen) { html += '<ul>'; listOpen = true; }
      html += `<li>${mdInline(esc(line.replace(/^\s*[-*]\s/, '')))}</li>\n`;
    } else if (/^\s*---+\s*$/.test(line)) {
      closeList();
      html += '<hr>\n';
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      html += `<p>${mdInline(esc(line))}</p>\n`;
    }
  }
  closeList();
  return html;
}

function mdToDoc(md: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;padding:16px;color:#222;line-height:1.7;max-width:720px;margin:0 auto}h1,h2,h3,h4{margin:10px 0 6px;line-height:1.4}hr{border:none;border-top:1px solid #ddd;margin:12px 0}ul{padding-left:22px}code{background:#f3f4f6;border-radius:4px;padding:1px 5px;font-size:0.92em}a{color:#2d6cdf}p{margin:6px 0}</style></head><body>${mdToHtml(md)}</body></html>`;
}

/** 导出确认 + 预览 + 保存位置选择 */
// ---------- 弹窗：导出预览（格式切换/内容预览） ----------
function ExportPreview({ format, onBack, onClose }: { format: ExportFormat; onBack: () => void; onClose: () => void }) {
  const [name, setName] = useState(() => exportDefaultName(format));
  const [content, setContent] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasPicker, setHasPicker] = useState(false);

  useEffect(() => {
    const native = !!(window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid?.saveBase64;
    setHasPicker(!native && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function');
    let alive = true;
    if (format === 'image') {
      const st = useStudio.getState();
      exportCanvasImage(st.cards, st.sections, undefined, {
        maxSize: 7680,
        edges: st.edges,
        annotations: st.annotations,
        onBlob: (blob) => { if (alive) { setImgBlob(blob); setImgSrc(URL.createObjectURL(blob)); } },
      });
    } else {
      const st = useStudio.getState();
      if (!st.meta) { if (alive) setContent('（当前没有打开项目，无法导出）'); return; }
      const full: ProjectState = format === 'json'
        ? (st.exportStateForSync() as ProjectState)
        : { meta: st.meta, sections: st.sections, cards: st.cards, edges: st.edges };
      const text = format === 'md' ? projectToMarkdown(full)
        : format === 'html' || format === 'doc' ? projectToHtml(full)
        : format === 'txt' ? projectToTxt(full)
        : JSON.stringify(full, null, 2);
      if (alive) setContent(text);
    }
    return () => { alive = false; };
  }, [format]);

  const doExport = async (usePicker: boolean) => {
    if (busy) return;
    setBusy(true);
    const native = !!(window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid?.saveBase64;
    try {
      const fname = name.trim() || exportDefaultName(format);
      toast(`正在导出 ${fname} …`, 'info');
      let blob: Blob;
      if (format === 'image') {
        if (!imgBlob) { toast('画布图片仍在生成中，请稍候再点一次…', 'warn'); setBusy(false); return; }
        blob = imgBlob;
      } else {
        if (content == null) throw new Error('内容尚未生成，请稍候');
        blob = new Blob([content], { type: exportMime(format) });
      }
      // App 原生壳：直接走系统保存对话框（桥），不依赖 File System Access API
      if (native) {
        downloadBlob(blob, fname);
        toast(`正在打开系统「选择保存位置」对话框…`, 'info');
        onClose();
        setBusy(false);
        return;
      }
      if (usePicker) {
        const r = await saveBlobViaPicker(fname, blob);
        if (r === 'saved') { toast(`已保存：${fname}`, 'ok'); onClose(); }
        else if (r === 'cancel') { toast('已取消保存', 'warn'); }
        else {
          downloadBlob(blob, fname);
          toast(`已开始下载 ${fname}（浏览器默认位置）`, 'ok');
          onClose();
        }
      } else {
        downloadBlob(blob, fname);
        toast(`已开始下载 ${fname}`, 'ok');
        onClose();
      }
    } catch (err) {
      toast(`导出失败：${(err as Error).message}`, 'err');
    }
    setBusy(false);
  };
  // 原生分享：把导出的内容/文件通过系统分享面板分享出去（原生端最顺手的分享方式）
  const doShare = async () => {
    const fname = name.trim() || exportDefaultName(format);
    try {
      let blob: Blob;
      if (format === 'image') {
        if (!imgBlob) { toast('画布图片仍在生成中，请稍候再点一次…', 'warn'); return; }
        blob = imgBlob;
      } else {
        if (content == null) throw new Error('内容尚未生成，请稍候');
        blob = new Blob([content], { type: exportMime(format) });
      }
      if (isNativeEnv()) {
        // 原生：读取 blob → base64 → 系统分享
        const buf = await blob.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const base64 = btoa(bin);
        const shareTitle = useStudio.getState().meta?.name || '创作助手';
        const ok = await shareFile(fname, base64, blob.type, shareTitle);
        toast(ok ? '已调起系统分享面板' : '分享未完成', ok ? 'ok' : 'warn');
      } else {
        // Web：文本内容复制到剪贴板；图片/二进制提示下载
        if (blob.type.startsWith('text') || format === 'json') {
          const txt = await blob.text();
          const shareTitle = useStudio.getState().meta?.name || '创作助手';
          const r = await shareText(txt, shareTitle);
          if (r === 'copied') toast('已复制到剪贴板', 'ok');
          else {
            downloadBlob(blob, fname);
            toast(`已开始下载 ${fname}`, 'ok');
          }
        } else {
          downloadBlob(blob, fname);
          toast(`已开始下载 ${fname}`, 'ok');
        }
        onClose();
      }
    } catch (err) {
      toast(`分享失败：${(err as Error).message}`, 'err');
    }
  };
  return (
    <div className="modal-sec">
      <h4><ExportIcon /> 导出预览{format === 'image' ? '（画布图片）' : `（${format.toUpperCase()}）`}</h4>
      <div className="field-row">
        <label>文件名</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {imgSrc ? (
        <div style={{ textAlign: 'center', margin: '10px 0' }}>
          <img src={imgSrc} alt="画布预览" style={{ maxWidth: '100%', maxHeight: 'min(48vh, 520px)', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
        </div>
      ) : content != null ? (
        format === 'html' || format === 'doc' || format === 'md' ? (
          <iframe
            title="导出效果预览"
            srcDoc={format === 'md' ? mdToDoc(content) : content}
            style={{ width: '100%', height: 240, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
          />
        ) : (
          <pre style={{ maxHeight: 220, overflow: 'auto', background: 'var(--panel2)', padding: 10, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {content.length > 4000 ? content.slice(0, 4000) + '\n…（内容较长，仅预览前 4000 字）' : content}
          </pre>
        )
      ) : (
        <div className="muted" style={{ padding: 20, textAlign: 'center' }}>正在生成预览…</div>
      )}
      <p className="hint">
        确认内容无误后再导出；点击下方主按钮会弹出「选择保存位置」对话框（App 内为系统文件管理器；浏览器内为系统保存对话框或浏览器下载）。
      </p>
      <div className="btn-grid">
        <button className="btn primary" disabled={busy} onClick={() => doExport(true)}><SaveIcon /> 选择位置并下载</button>
        <button className="btn" disabled={busy} onClick={doShare}><ExportIcon /> 分享</button>
        {hasPicker && <button className="btn" disabled={busy} onClick={() => doExport(false)}>⤓ 浏览器默认下载</button>}
        <button className="btn" disabled={busy} onClick={onBack}>⬅ 返回</button>
      </div>
    </div>
  );
}

// ---------- 弹窗：导入/导出项目 ----------
function ExportModal({ onClose }: { onClose: () => void }) {
  const meta = useStudio((s) => s.meta);
  const setModal = useStudio((s) => s.setModal);
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const state = meta ? {
    meta,
    sections: useStudio.getState().sections,
    cards: useStudio.getState().cards,
    edges: useStudio.getState().edges,
  } : null;
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!data?.meta?.id || !Array.isArray(data.sections)) throw new Error('不是有效的创作助手项目 JSON');
      useStudio.getState().importProjectState(data);
      toast(`已导入项目「${data.meta.name || '未命名'}」`, 'ok');
      onClose();
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'err');
    }
  };

  if (!state) {
    return (
      <ModalShell title="导入 / 导出项目" onClose={onClose}>
        <div className="modal-sec">
          <h4><FolderIcon /> 导入项目备份</h4>
          <p className="hint">当前没有打开项目。可以导入 JSON 备份文件，导入后会自动打开该项目；也可以先打开已有项目，再进行项目级导出。</p>
          <div className="btn-grid">
            <button className="btn primary" onClick={() => fileRef.current?.click()}><FolderIcon /> 导入 JSON 项目</button>
            <button className="btn" onClick={() => { onClose(); setModal('open'); }}><FolderIcon /> 打开项目</button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            doImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </ModalShell>
    );
  }

  if (pending) {
    return (
      <ModalShell title="导出确认" onClose={onClose}>
        <ExportPreview format={pending} onBack={() => setPending(null)} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell title="导出 / 导入项目" onClose={onClose}>
      <div className="modal-sec">
        <h4><ExportIcon /> 导出</h4>
        <p className="hint">导出前会先展示内容预览，并弹出系统「选择保存位置」对话框；确认后保存。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => setPending('image')}><ImageIcon /> 画布 8K 图片</button>
          <button className="btn" onClick={() => setPending('json')}><SaveIcon /> 保存项目 JSON</button>
        </div>
      </div>

      <div className="modal-sec">
        <h4><FolderIcon /> 项目读取</h4>
        <p className="hint">读取项目 JSON 备份，完整恢复分区、卡片、连线与页面结构（迁移 / 恢复用）。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => fileRef.current?.click()}><FolderIcon /> 读取项目 JSON</button>
        </div>
      </div>

      <div className="modal-sec">
        <h4><FolderIcon /> 项目管理</h4>
        <div className="btn-grid">
          <button className="btn" onClick={() => { onClose(); setModal('open'); }}><FolderIcon /> 打开项目</button>
          <button className="btn" onClick={() => { onClose(); setModal('writing'); }}><PencilIcon /> 正文创作导出</button>
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>关闭</button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          doImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </ModalShell>
  );
}

// ---------- 协同 ----------
function SyncModal({ onClose }: { onClose: () => void }) {
  const settings = useStudio((s) => s.settings);
  const updateSettings = useStudio((s) => s.updateSettings);
  const serverStatus = useStudio((s) => s.serverStatus);
  const peers = useStudio((s) => s.peers);
  const meta = useStudio((s) => s.meta);
  const [url, setUrl] = useState(settings.serverUrl);
  const [busy, setBusy] = useState(false);

  const doConnect = async (uploadFirst: boolean) => {
    if (!meta) return;
    if (!url.trim()) {
      toast('请填写服务器地址', 'warn');
      return;
    }
    setBusy(true);
    try {
      if (uploadFirst) {
        const st = useStudio.getState();
        const state = st.exportStateForSync();
        if (!state) throw new Error('当前没有打开的项目');
        await uploadProject(url.trim(), state);
        toast('已上传到服务器', 'ok');
      }
      const state = await connectServer(url.trim(), meta.id, settings.nickname);
      useStudio.getState().applyRemoteProject(state);
      updateSettings({ serverUrl: url.trim(), lastServerProject: meta.id });
      toast('已连接，进入实时协同 👥', 'ok');
      onClose();
    } catch (e) {
      toast(`连接失败：${(e as Error).message}`, 'err');
    }
    setBusy(false);
  };

  return (
    <ModalShell title="局域网协同" onClose={onClose}>
      {serverStatus === 'on' ? (
        <div className="modal-sec">
          <h4>👥 在线成员（{Object.keys(peers).length}）</h4>
          <div className="peer-list">
            {Object.values(peers).map((p) => (
              <div key={p.id} className="peer-item">
                <span className="peer-dot" style={{ background: p.color }} />
                {p.name}
                {p.editingCardId && <em>正在编辑…</em>}
              </div>
            ))}
          </div>
          <p className="hint">大家的修改实时同步；谁在编辑哪张卡片会实时显示。拖动连线锚点、框选、自动布局等操作同样同步。</p>
          <div className="modal-actions">
            <button className="btn danger" onClick={() => { disconnect(); toast('已断开协同', 'warn'); }}>断开连接</button>
          </div>
        </div>
      ) : (
        <div className="modal-sec">
          <h4>当前项目：{meta?.name}</h4>
          <div className="fld">
            <span>服务器地址</span>
            <input value={url} placeholder="http://192.168.1.100:8787" onChange={(e) => setUrl(e.target.value)} />
          </div>
          <p className="hint">
            步骤：① 一台电脑运行 <code>npm start</code>（见启动时打印的局域网地址）；
            ② 在这里填入地址；③ 先「上传并连接」把项目发布到服务器；④ 其他协同成员在「打开项目」里从服务器打开同一项目，即可实时共创。
          </p>
          <div className="modal-actions">
            <button className="btn primary" disabled={busy} onClick={() => doConnect(false)}>
              {busy ? '连接中…' : '🔌 连接'}
            </button>
            <button className="btn" disabled={busy} onClick={() => doConnect(true)}>
              {busy ? '上传中…' : '⬆ 上传并连接（首次）'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ---------- 宿主 ----------
export default function ModalHost() {
  const modal = useStudio((s) => s.modal);
  const setModal = useStudio((s) => s.setModal);
  if (!modal) return null;
  const close = () => setModal(null);
  if (modal === 'new') return <NewProjectModal onClose={close} />;
  if (modal === 'open') return <OpenProjectModal onClose={close} />;
  if (modal === 'settings') return <SettingsModal onClose={close} />;
  if (modal === 'project-settings') return <ProjectSettingsModal onClose={close} />;
  if (modal === 'export') return <ExportModal onClose={close} />;
  if (modal === 'writing') return <Suspense fallback={null}><WritingMode onClose={close} /></Suspense>;
  if (modal === 'hub') return <Suspense fallback={null}><TimelineHub onClose={close} /></Suspense>;
  if (modal === 'trash') return <TrashModal onClose={close} />;
  if (modal === 'card-trash') return <CardTrashModal onClose={close} />;
  if (modal === 'sync') return <SyncModal onClose={close} />;
  return null;
}
