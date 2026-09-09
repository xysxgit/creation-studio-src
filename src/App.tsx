/**
 * ============ 应用根组件 App ============
 * 职责：
 *  · 无打开项目 → 渲染 Welcome（最近项目/新建/入口）
 *  · 已打开项目 → 渲染编辑器主布局（TopBar + LeftSidebar + CanvasBoard + RightPanel + StatusBar）
 * 全局副作用：主题↔系统状态栏联动、屏幕方向、安卓返回键拦截（只关应用自己的层）、
 *            打开项目后自动重连协同 + 首次帮助提示。
 * 重量级组件（AIAssistant / FullscreenEditor）懒加载。
 */
import { csConfirm, csPrompt } from './components/SystemDialog';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useStudio } from './store';
import { Capacitor } from '@capacitor/core';
import { StatusBar as CapStatusBar, Style } from '@capacitor/status-bar';
import { App as CapApp } from '@capacitor/app';
import TopBar from './components/TopBar';
import LeftSidebar from './components/LeftSidebar';
import RightPanel from './components/RightPanel';
import CanvasBoard from './components/CanvasBoard';
import StatusBar from './components/StatusBar';
// 重量级组件懒加载：第一次打开时才下载/解析（本地包内加载极快，无感知）
const AIAssistant = lazy(() => import('./components/AIAssistant'));
import ModalHost from './components/Modals';
const FullscreenEditor = lazy(() => import('./components/FullscreenEditor'));
import HelpModal, { showHelpOnce } from './components/HelpModal';
import Playground from './components/Playground';
import Toasts from './components/Toasts';
import { PROJECT_TYPE_EMOJI, PROJECT_TYPE_LABEL, type ProjectType } from './types';
import { countWords, fmtTime, toast } from './util';
import { maybeAutoReconnect } from './sync/ws';
import { applyOrientation } from './orientation';
import { nativeAppInfo, isNative } from './native/nativePlugins';
import { applyNativeTheme } from './native/nativeActions';
import { TrashIcon } from './components/icons';
import { docToHtml } from './tiptap';
import SystemDialogHost from './components/SystemDialog';

/** 图片卡未配图时的占位 SVG，不作为真实封面 */
const isPlaceholderCover = (src: string) => src.startsWith('data:image/svg') && src.includes('%E5%9B%BE%E7%89%87%E5%8D%A0%E4%BD%8D');

interface ProjectStat {
  wordCount: number;
  cover: string | null;
}

function readProjectStats(p: { id: string; type: ProjectType; cover?: string }): ProjectStat {
  try {
    const raw = localStorage.getItem(`cs.project.${p.id}`);
    if (!raw) return { wordCount: 0, cover: (p.cover && !isPlaceholderCover(p.cover)) ? p.cover : null };
    const data = JSON.parse(raw);
    const pages: Record<string, { cards?: Record<string, import('./types').Card> }> = data.pages || {};
    let wordCount = 0;
    let cover: string | null = (p.cover && !isPlaceholderCover(p.cover)) ? p.cover : null;
    for (const page of Object.values(pages)) {
      for (const c of Object.values(page.cards || {})) {
        if (c.writingOnly) continue;
        if (!cover && c.kind === 'image' && c.imageSrc && !isPlaceholderCover(c.imageSrc)) cover = c.imageSrc;
        wordCount += countWords(docToHtml(c.content));
      }
    }
    // 独立正文字数（v2.33：Manuscript 随项目存储）
    const ms = data.manuscript as { chapters?: { content?: unknown }[] } | undefined;
    for (const ch of ms?.chapters || []) {
      wordCount += countWords(docToHtml((ch.content ?? null) as import('./types').JSONDoc | null));
    }
    return { wordCount, cover };
  } catch {
    return { wordCount: 0, cover: p.cover || null };
  }
}

function Welcome() {
  const projects = useStudio((s) => s.projects);
  const trashCount = useStudio((s) => s.trashProjects.length);
  const setModal = useStudio((s) => s.setModal);
  const openProject = useStudio((s) => s.openProject);
  const deleteProject = useStudio((s) => s.deleteProject);
  const renameProjectMeta = useStudio((s) => s.renameProjectMeta);
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const recentStats = useMemo(() => {
    const map = new Map<string, ProjectStat>();
    for (const p of projects.slice(0, 8)) {
      map.set(p.id, readProjectStats(p));
    }
    return map;
  }, [projects]);

  return (
    <div className="welcome">
      <button className="welcome-gear" onClick={() => setModal('settings')} title="设置" aria-label="设置">⚙️</button>
      <div className="welcome-hero">
        <span className="welcome-logo">🪄</span>
        <h1>创作助手</h1>
        <p>从设定到 IP 的全链路创作工具 —— 设定（画布）→ 整理（时间轴）→ 成品（正文）→ IP 探索（工坊）</p>
        <p className="welcome-sub">像搭积木一样拼出你的故事 —— 卡片自由排版、思维导图连线、富文本排版、工坊分板块、局域网实时共创</p>
        <div className="welcome-actions">
          <button className="btn primary big" onClick={() => setModal('new')}>＋ 新建项目</button>
          <button className="btn big" onClick={() => setModal('open')}>📂 打开项目</button>
          <button className="btn big" onClick={() => setModal('export')}>📂 导入/导出项目</button>
          <button className="btn big" onClick={() => setModal('sync')}>🌐 局域网协同</button>
          <button className="btn big" onClick={() => setModal('help')}>📖 操作说明</button>
          <button className="btn big" onClick={() => setModal('trash')}>🗑 回收站{trashCount ? `（${trashCount}）` : ''}</button>
        </div>
      </div>
      {projects.length > 0 && (
        <div className="welcome-recent">
          <h3>最近项目</h3>
          <div className="welcome-grid">
            {projects.slice(0, 8).map((p) => {
              const stat = recentStats.get(p.id) || { wordCount: 0, cover: null };
              const flipped = flippedId === p.id;
              return (
                <div key={p.id} className={`welcome-book ${flipped ? 'flipped' : ''}`}>
                  <div className="welcome-book-inner">
                    <div
                      role="button"
                      tabIndex={0}
                      className="welcome-book-face welcome-book-front"
                      onClick={() => setFlippedId(flipped ? null : p.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlippedId(flipped ? null : p.id); } }}
                      onContextMenu={(e) => { e.preventDefault(); setFlippedId(flipped ? null : p.id); }}
                    >
                      <span
                        className={`welcome-book-cover ${stat.cover ? '' : 'default-cover'}`}
                        style={stat.cover ? { backgroundImage: `url("${stat.cover}")`, backgroundColor: '#a29bfe' } : undefined}
                      >
                        {!stat.cover && <span className="welcome-book-emoji">{PROJECT_TYPE_EMOJI[p.type]}</span>}
                        {!stat.cover && <span className="welcome-book-cover-title">{p.name}</span>}
                        {stat.cover && <span className="welcome-book-type-badge">{PROJECT_TYPE_EMOJI[p.type]} {PROJECT_TYPE_LABEL[p.type]}</span>}
                      </span>
                      <span className="welcome-book-info">
                        <span className="welcome-book-title">{p.name}</span>
                        <span className="welcome-book-meta">{stat.wordCount.toLocaleString()} 字 · {fmtTime(p.updatedAt)}</span>
                      </span>
                      <button
                        type="button"
                        className="welcome-del"
                        title="删除项目（移入回收站）"
                        aria-label="删除项目"
                        onClick={(e) => { e.stopPropagation(); deleteProject(p.id); toast('已删除项目', 'ok'); }}
                      >🗑</button>
                    </div>
                    <div className="welcome-book-face welcome-book-back">
                      <div className="welcome-book-back-title">{p.name}</div>
                      <button type="button" onClick={() => { openProject(p.id); setFlippedId(null); }}>📂 打开</button>
                      <button type="button" onClick={async () => {
                        const name = await csPrompt('重命名项目：', p.name);
                        if (name !== null && name.trim()) renameProjectMeta(p.id, name.trim());
                        setFlippedId(null);
                      }}>✏️ 重命名</button>
                      <button type="button" className="danger" onClick={() => { deleteProject(p.id); toast('已删除项目', 'ok'); setFlippedId(null); }}>🗑 删除</button>
                      <button type="button" onClick={() => setFlippedId(null)}>↩ 取消</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const projectId = useStudio((s) => s.projectId);
  const theme = useStudio((s) => s.settings.theme);
  const mobilePanel = useStudio((s) => s.mobilePanel);
  const setMobilePanel = useStudio((s) => s.setMobilePanel);
  const desktopPanels = useStudio((s) => s.desktopPanels);

  // 电脑触屏支持：带触摸屏的 PC（主指针是鼠标，pointer:fine）不会被 pointer:coarse 命中，
  // 这里按设备触摸能力打上 .touch-capable 标记，让触屏优化（更大触控目标/画布手柄）同样生效
  useEffect(() => {
    const el = document.documentElement;
    const apply = () => el.classList.toggle('touch-capable', (navigator.maxTouchPoints || 0) > 0);
    apply();
    // 某些设备初始 maxTouchPoints 为 0，收到首次触摸信号后补标记
    const onFirstTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { el.classList.add('touch-capable'); window.removeEventListener('pointerdown', onFirstTouch, true); }
    };
    window.addEventListener('pointerdown', onFirstTouch, true);
    return () => window.removeEventListener('pointerdown', onFirstTouch, true);
  }, []);

  // 原生端：获取原生 app 信息（版本等）
  useEffect(() => {
    if (isNative()) {
      nativeAppInfo().then((info) => {
        if (info && info.versionName) {
          document.documentElement.dataset.nativeVersion = info.versionName;
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    // 主题应用：将「主题模式」解析为实际亮/暗，写入 data-theme
    // system=跟随系统，用 prefers-color-scheme 解析并在系统切换时实时联动
    const prefersDark = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    const apply = () => {
      const effective: 'light' | 'dark' = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = effective;
      // 原生端：状态栏随主题联动（深色→白字深底；浅色→深字浅底）
      try {
        if (Capacitor.isNativePlatform()) {
          // 优先走自定义 NativeTheme 插件（可同时设置状态栏/导航栏颜色与图标明暗）
          applyNativeTheme(effective === 'dark' ? '#161a26' : '#f5f8fd', effective === 'dark');
          if (effective === 'dark') {
            CapStatusBar.setStyle({ style: Style.Dark });
            CapStatusBar.setBackgroundColor({ color: '#161a26' });
          } else {
            CapStatusBar.setStyle({ style: Style.Light });
            CapStatusBar.setBackgroundColor({ color: '#f5f8fd' });
          }
        }
      } catch {
        /* 非原生环境忽略 */
      }
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      if (mq?.addEventListener) {
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
      }
    }
  }, [theme]);
  const czTheme = useStudio((s) => s.settings.czTheme || '');
  useEffect(() => {
    if (czTheme) document.documentElement.setAttribute('data-cztheme', czTheme);
    else document.documentElement.removeAttribute('data-cztheme');
  }, [czTheme]);
  const orientation = useStudio((s) => s.settings.orientation);
  useEffect(() => {
    applyOrientation(orientation);
  }, [orientation]);

  useEffect(() => {
    const syncOrientation = () => {
      const effective = orientation === 'auto'
        ? (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape')
        : orientation;
      document.documentElement.dataset.orientation = effective;
    };
    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    return () => window.removeEventListener('resize', syncOrientation);
  }, [orientation]);

  useEffect(() => {
    if (projectId) {
      maybeAutoReconnect();
      showHelpOnce();
    }
  }, [projectId]);

  // 安卓：屏蔽「左右边缘滑动=系统返回」的触发，避免误滑导致退出应用/乱跳
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', () => {
        const s = useStudio.getState();
        // 只关闭应用自己打开的临时层；其余（画布/项目列表）一律屏蔽，
        // 即：左右边缘滑动不再触发「返回上一级」或「退出应用」
        if (s.modal) { s.setModal(null); return; }             // 关弹窗/写作模式
        if (s.fullscreenCardId) { s.setFullscreenCard(null); return; } // 退全屏编辑器
        if (s.mobilePanel !== 'none') { s.setMobilePanel('none'); return; } // 收侧栏抽屉
        // 屏蔽：不返回项目列表、不退出应用（吞掉本次返回）
      }).then((h: { remove: () => void }) => { handle = h; }).catch(() => {});
    }
    return () => { if (handle) handle.remove(); };
  }, []);

  if (!projectId) {
    return (
      <>
        <Welcome />
        <HelpModal />
        <Playground />
        <ModalHost />
        <Toasts />
        <SystemDialogHost />
      </>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className={`app-main ${desktopPanels.left ? '' : 'hide-desktop-left'} ${desktopPanels.right ? '' : 'hide-desktop-right'}`}>
        <LeftSidebar />
        <CanvasBoard />
        <RightPanel />
      </div>
      <StatusBar />
      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
      {mobilePanel !== 'none' && (
        <div className="drawer-mask" onClick={() => useStudio.getState().setMobilePanel('none')} />
      )}
      <Suspense fallback={null}>
        <FullscreenEditor />
      </Suspense>
      <HelpModal />
      <Playground />
      <ModalHost />
      <Toasts />
      <SystemDialogHost />
    </div>
  );
}
