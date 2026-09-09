/**
 * ============ 顶栏 ============
 *  · 项目名/类型徽标、保存/导入导出、时间轴入口、设置
 *  · 页面切换器（PageSwitcher，画布多页面）、分类筛选、合作方模式开关
 * 移动端精简为图标按钮。
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 顶栏 ============
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '../store';
import { PROJECT_TYPE_EMOJI, PROJECT_TYPE_LABEL } from '../types';
import { canvasViewCenter, fileToDataURL, compressImageDataUrl } from '../util';
import { BrushIcon, ClockIcon, FlaskIcon, ExportIcon, GearColorIcon, TrashColorIcon, BulbIcon, MenuIcon, DocIcon, CalendarColorIcon, RestoreIcon, ChartIcon, FlashIcon, AlignIcon, GlobeIcon, PencilIcon, ProjectTypeIcon, WandIcon, AddIcon, FolderIcon, GearIcon, CloseIcon } from './icons';

function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const meta = useStudio((s) => s.meta);
  const setModal = useStudio((s) => s.setModal);
  const deleteProject = useStudio((s) => s.deleteProject);
  const closeProject = useStudio((s) => s.closeProject);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // 菜单锚定按钮实际位置（portal + fixed），任何宽度下都贴着按钮弹出
  // 以按钮左下为基准点做“左对齐下拉”，并对窄屏做左右钳制，杜绝与按钮错位
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const vw = window.innerWidth;
      const left = Math.max(6, Math.min(r.left, vw - 218)); // 218≈菜单最小宽，防右侧溢出
      setMenuPos({ x: left, y: r.bottom });
    } else {
      setMenuPos(null);
    }
    setOpen(!open);
  };
  return (
    <div className="project-menu-wrap" ref={wrapRef}>
      <button ref={btnRef} className="tb-btn" title="项目菜单：新建/关闭/删除/设置" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MenuIcon size={18} />
      </button>
      {open && createPortal(
        <div
          className="project-menu"
          style={{ position: 'fixed', left: (menuPos?.x ?? 0), top: (menuPos?.y ?? 0) + 6, right: 'auto', transformOrigin: 'top left', maxHeight: 'min(70vh, 480px)', overflowY: 'auto', zIndex: 16000 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
                    <div className="menu-group-title">项目</div>
          <button onClick={() => { setOpen(false); setModal('new'); }}><AddIcon size={14} /> 新建项目</button>
          <button onClick={() => { setOpen(false); setModal('open'); }}><FolderIcon size={14} /> 打开项目</button>
          <button onClick={() => { setOpen(false); setModal('project-settings'); }}><GearColorIcon size={14} /> 项目设置</button>
          <button onClick={() => { setOpen(false); closeProject(); }}><CloseIcon size={14} /> 关闭项目</button>
          <button
            className="danger"
            onClick={async () => {
              setOpen(false);
              if (meta && await csConfirm(`删除项目「${meta.name}」？此操作不可恢复。`)) deleteProject(meta.id);
            }}
          >
            <TrashColorIcon size={14} /> 删除项目
          </button>
          <div className="menu-group-title menu-duplicate">数据</div>
          <button className="menu-duplicate" onClick={() => { setOpen(false); setModal('export'); }}><ExportIcon size={14} /> 导出 / 导入</button>
          <div className="menu-group-title menu-duplicate">系统</div>
          <button className="menu-duplicate" onClick={() => { setOpen(false); setModal('sync'); }}><GlobeIcon size={14} /> 局域网协同</button>
          <button className="menu-duplicate" onClick={() => { setOpen(false); setModal('settings'); }}><GearIcon size={14} /> 设置</button>
        </div>,
        document.body
      )}
    </div>
  );
}

export function PageSwitcher() {
  const pages = useStudio((s) => s.pages);
  const currentPageId = useStudio((s) => s.currentPageId);
  const switchPage = useStudio((s) => s.switchPage);
  const addPage = useStudio((s) => s.addPage);
  const renamePage = useStudio((s) => s.renamePage);
  const removePage = useStudio((s) => s.removePage);
  const pageTrash = useStudio((s) => s.pageTrash);
  const restorePage = useStudio((s) => s.restorePage);
  const purgePage = useStudio((s) => s.purgePage);
  const clearPageTrash = useStudio((s) => s.clearPageTrash);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cur = pages.find((p) => p.id === currentPageId) || pages[0];

  /** 翻页（‹ › 按钮 / 滚轮共用）：循环切换 */
  const goPage = (dir: -1 | 1) => {
    if (pages.length < 2) return;
    const idx = pages.findIndex((p) => p.id === currentPageId);
    const next = pages[(idx + dir + pages.length) % pages.length];
    if (next && next.id !== currentPageId) switchPage(next.id);
  };

  // 滚轮切换页面（3.8 交互冗余：滚轮 = 快捷切换，点击 = 打开列表）
  // 画布工具条在 .canvas-wrap 内，滚轮会冒泡触发画布缩放——这里用原生监听拦截（React 合成事件时机太晚）
  const lastWheelSwitch = useRef(0);
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (pages.length < 2) return; // 单页无页可切
      const now = Date.now();
      if (now - lastWheelSwitch.current < 220) return; // 节流：一次滚动切一页
      lastWheelSwitch.current = now;
      goPage(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pages, currentPageId, switchPage]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="page-switcher" ref={wrapRef}>
      {/* 页面名（点按开列表）；页面切换 = 滚轮或工具条顶/底分组箭头 */}
      <button ref={btnRef} className="tb-btn page-switcher-btn" title={`页面切换：当前「${cur?.name || '页面'}」共 ${pages.length} 页；在按钮上滚动滚轮即可切换页面`} aria-haspopup="menu" aria-expanded={open} onClick={() => { const r = btnRef.current?.getBoundingClientRect(); setMenuPos(r ? { x: r.left, y: r.bottom, w: r.width } : null); setOpen(!open); }}>
        <DocIcon size={16} /> <span className="ps-name">{cur?.name || '页面'}</span> <span className="ps-arrow">▾</span>
      </button>
      {open && createPortal(
        <div className="page-menu" style={{ position: 'fixed', top: menuPos ? menuPos.y + 6 : 0, left: menuPos ? Math.max(8, Math.min(menuPos.x + menuPos.w / 2 - 150, window.innerWidth - 308)) : 0, maxHeight: 'min(72vh, 440px)', overflowY: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 16000 }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="page-menu-title"><DocIcon size={13} /> 页面（每页独立画布）</div>
          {/* 列表滚动区：页面再多也只在此区域内滚动，底栏「新建」始终可见 */}
          <div className="page-menu-scroll">
            {pages.map((p) => (
              <div key={p.id} className={`page-item ${p.id === currentPageId ? 'active' : ''}`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchPage(p.id); setOpen(false); } }} onClick={() => { switchPage(p.id); setOpen(false); }}>
                <span className="page-name">{p.emoji} {p.name}</span>
                <span className="page-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    title="重命名页面"
                    onClick={async () => {
                      const name = await csPrompt('页面名称：', p.name);
                      if (name !== null && name.trim()) renamePage(p.id, name.trim());
                    }}
                  ><PencilIcon size={12} /></button>
                  {pages.length > 1 && (
                    <button
                      title="删除页面（进页面回收站）"
                      onClick={() => {
                        removePage(p.id);
                        setOpen(false);
                      }}
                    ><TrashColorIcon size={12} /></button>
                  )}
                </span>
              </div>
            ))}
            {pageTrash.length > 0 && (
              <div className="page-trash-sec">
                <div className="page-trash-title">
                  <TrashColorIcon size={13} /> 已删除页面（点击名称恢复）
                  <button className="page-trash-clear" title="清空页面回收站" onClick={async () => { if (await csConfirm('清空页面回收站？彻底删除后不可恢复。')) clearPageTrash(); }}>清空</button>
                </div>
                {pageTrash.map((t, i) => (
                  <div key={t.meta.id + i} className="page-trash-row">
                    <button className="page-trash-item" title={`删除于 ${new Date(t.deletedAt).toLocaleString()}`} onClick={() => { restorePage(i); }}>
                      <RestoreIcon size={13} /> {t.meta.emoji} {t.meta.name}
                    </button>
                    <button className="page-trash-del" title="彻底删除（不可恢复）" onClick={async () => { if (await csConfirm(`彻底删除页面「${t.meta.name}」？不可恢复。`)) purgePage(i); }}><TrashColorIcon size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="page-add" onClick={() => { addPage(); setOpen(false); }}>＋ 新建页面</button>
        </div>, document.body)}

    </div>
  );
}

function PerformanceMeter() {
  const cards = useStudio((s) => s.cards);
  const [open, setOpen] = useState(false);
  const [perfPos, setPerfPos] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(60);
  const [frameMs, setFrameMs] = useState(16.7);
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const perfBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let accFrameMs = 0;
    let lastSample = performance.now();

    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (dt > 0 && dt < 100) {
        accFrameMs += dt;
        frames++;
      }
      if (t - lastSample >= 500) {
        const elapsed = Math.max(1, t - lastSample);
        const currentFps = Math.round((frames * 1000) / elapsed);
        const avgFrame = accFrameMs / Math.max(1, frames);
        setFps(currentFps);
        setFrameMs(Number(avgFrame.toFixed(1)));
        setSamples((prev) => [...prev.slice(-29), currentFps]);
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        setMemoryMB(mem ? Math.round(mem.usedJSHeapSize / 1048576) : null);
        frames = 0;
        accFrameMs = 0;
        lastSample = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const avgFps = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : fps;
  const grade = avgFps >= 50 ? '流畅' : avgFps >= 30 ? '一般' : '卡顿';
  const color = avgFps >= 50 ? 'var(--ok)' : avgFps >= 30 ? '#f39c12' : 'var(--danger)';
  const cardCount = Object.values(cards).filter((c) => !c.writingOnly).length;

  return (
    <div className="perf-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={perfBtnRef}
        className={`tb-btn perf-btn ${open ? 'active' : ''}`}
        title={`性能评估：${grade}（${avgFps} FPS）`}
        aria-label="性能评估"
        aria-expanded={open}
        onClick={() => {
          const r = perfBtnRef.current?.getBoundingClientRect();
          setPerfPos(r ? { x: r.right, y: r.bottom } : null);
          setOpen(!open);
        }}
      >
        <span className="perf-dot" style={{ background: color }} />
        <ChartIcon size={15} />
      </button>
      {open && createPortal(
        <div
          className="perf-panel"
          style={{ position: 'fixed', top: (perfPos?.y ?? 0) + 6, right: Math.max(8, window.innerWidth - (perfPos?.x ?? 0)), zIndex: 16000 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="perf-title"><FlashIcon size={14} /> 性能评估</div>
          <div className="perf-row">
            <span>当前帧率</span>
            <b>{fps} FPS</b>
          </div>
          <div className="perf-row">
            <span>平均帧率</span>
            <b>{avgFps} FPS</b>
          </div>
          <div className="perf-row">
            <span>帧耗时</span>
            <b>{frameMs} ms</b>
          </div>
          <div className="perf-row">
            <span>内存占用</span>
            <b>{memoryMB === null ? '不可用' : `${memoryMB} MB`}</b>
          </div>
          <div className="perf-row">
            <span>画布卡片</span>
            <b>{cardCount} 张</b>
          </div>
          <div className="perf-grade" style={{ color }}>
            综合：{grade}
          </div>
          <p className="hint">数据每 0.5 秒采样一次，仅用于本地性能参考。</p>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function TopBar() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('cs.topbar.collapsed');
    if (stored !== null) return stored === '1';
    // 首次使用：竖屏默认收起（省垂直空间），横屏/宽屏默认展开
    return window.matchMedia('(orientation: portrait)').matches;
  });
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem('cs.topbar.collapsed', n ? '1' : '0');
      return n;
    });
  };
  const meta = useStudio((s) => s.meta);
  const renameProject = useStudio((s) => s.renameProject);
  const setSidebarTab = useStudio((s) => s.setSidebarTab);
  const setRightTab = useStudio((s) => s.setRightTab);
  const setModal = useStudio((s) => s.setModal);
  const modal = useStudio((s) => s.modal);
  const serverStatus = useStudio((s) => s.serverStatus);
  const peers = useStudio((s) => s.peers);
  const trashCards = useStudio((s) => s.trashCards);
  const selection = useStudio((s) => s.selection);
  const toggleMobilePanel = useStudio((s) => s.toggleMobilePanel);
  const desktopPanels = useStudio((s) => s.desktopPanels);
  const toggleDesktopPanel = useStudio((s) => s.toggleDesktopPanel);
  /** 左右栏开关：窄屏（≤1024）= 抽屉；桌面宽度 = 折叠/展开侧栏列（面板常驻可见时开关才有意义） */
  const togglePanel = (side: 'left' | 'right') => {
    if (window.matchMedia('(max-width: 1024px)').matches) toggleMobilePanel(side);
    else toggleDesktopPanel(side);
  };
  const panelBtn = (side: 'left' | 'right') => {
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const active = isMobile ? false : side === 'left' ? !desktopPanels.left : !desktopPanels.right;
    return active;
  };
  const [alignOpen, setAlignOpen] = useState(false);
  const [alignPos, setAlignPos] = useState<{ x: number; y: number } | null>(null);
  const alignRef = useRef<HTMLDivElement>(null);
  const alignBtnRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!alignOpen) return;
    const onDown = (e: PointerEvent) => {
      if (alignRef.current && !alignRef.current.contains(e.target as Node)) setAlignOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [alignOpen]);

  const alignCards = (mode: Parameters<ReturnType<typeof useStudio.getState>['alignCards']>[0]) => {
    useStudio.getState().alignCards(mode);
    setAlignOpen(false);
  };

  const centerAdd = (fn: (x: number, y: number) => string) => {
    const s = useStudio.getState();
    const vp = s.viewport;
    const c = canvasViewCenter(vp);
    const id = fn(c.x, c.y);
    s.setSelection([id]);
  };

  const btn = (title: string, label: ReactNode, onClick: () => void, active = false, extra = '') => (
    <button type="button" className={`tb-btn ${active ? 'active' : ''} ${extra}`} title={title} aria-label={title} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className={`topbar topbar-two-row ${collapsed ? 'collapsed' : ''}`}>
      <div className="tb-title-row">
        <button type="button" className={`tb-btn mobile-only tb-menu-icon ${panelBtn('left') ? 'active' : ''}`} title="分区与大纲（窄屏抽屉 / 桌面折叠面板）" aria-label="分区与大纲" aria-expanded={useStudio.getState().mobilePanel === 'left' || desktopPanels.left} onClick={() => togglePanel('left')}><MenuIcon size={17} /></button>
        <div className="tb-title-inner">
          <button type="button" className="tb-logo" title="正文创作（写正文/章节）" aria-label="正文创作" onClick={() => setModal('writing')}>
            {meta ? <ProjectTypeIcon type={meta.type} /> : <WandIcon size={18} />}
          </button>
          <input
            className="tb-project-name"
            value={meta?.name || '未命名项目'}
            onChange={(e) => renameProject(e.target.value)}
            placeholder="项目名称"
          />
          {meta && <span className="tb-badge">{PROJECT_TYPE_LABEL[meta.type]}</span>}
        </div>
        <div className="tb-title-right">
          <button type="button" className={`tb-btn mobile-only tb-inspire-icon ${panelBtn('right') ? 'active' : ''}`} title="灵感与检查器（窄屏抽屉 / 桌面折叠面板）" aria-label="灵感与检查器" aria-expanded={useStudio.getState().mobilePanel === 'right' || desktopPanels.right} onClick={() => togglePanel('right')}><BulbIcon size={17} /></button>
          <button
            type="button"
            className="tb-collapse-btn"
            title={collapsed ? '展开顶栏' : '收起顶栏'}
            aria-label={collapsed ? '展开顶栏' : '收起顶栏'}
            onClick={toggleCollapse}
          >
            {collapsed ? '▾ 展开' : '▴ 收起'}
          </button>
        </div>
      </div>

      {!collapsed && (
      <div className="tb-actions-row">
        <ProjectMenu />
        {serverStatus === 'on' && (
          <span className="tb-peers" title="在线协同成员">
            {Object.values(peers).map((p) => (
              <span key={p.id} className="peer-dot" style={{ background: p.color }} title={p.name} />
            ))}
            {Object.keys(peers).length > 0 && <em>{Object.keys(peers).length}</em>}
          </span>
        )}
        {serverStatus === 'connecting' && <span className="tb-status connecting">连接中…</span>}
        {serverStatus === 'on' && <span className="tb-status on">● 协同中</span>}
        {serverStatus === 'off' && <span className="tb-status off" title="本地模式，可到设置中连接局域网服务器">○ 本地</span>}
        {btn('正文创作', <><BrushIcon size={16} /> 正文</>, () => setModal('writing'), modal === 'writing', 'desktop-only')}
        {btn('日历+时间轴：排期与过去/现在/未来时间轴', <ClockIcon size={16} />, () => setModal('hub'), modal === 'hub')}
        {btn('娱乐场：拿画布卡片当素材碰撞脑洞/换皮预览/掷点子（Playground）', <FlaskIcon size={16} />, () => setModal('playground'), modal === 'playground')}
        {btn('导出', <ExportIcon size={16} />, () => setModal('export'), modal === 'export', 'desktop-only')}
        <div className="align-wrap" ref={alignRef}>
          {(() => (
            <button
              type="button"
              ref={alignBtnRef}
              className={`tb-btn ${alignOpen ? 'active' : ''}`}
              title="对齐所选卡片"
              aria-haspopup="menu"
              aria-expanded={alignOpen}
              onClick={() => {
                const r = alignBtnRef.current?.getBoundingClientRect();
                setAlignPos(r ? { x: r.left, y: r.bottom } : null);
                setAlignOpen(!alignOpen);
              }}
            >
              <AlignIcon size={15} />
            </button>
          ))()}
          {alignOpen && createPortal(
            <div
              className="align-menu"
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: alignPos ? alignPos.y + 6 : 0,
                left: alignPos ? Math.max(8, Math.min(alignPos.x + 24 / 2 - 110, window.innerWidth - 240)) : 0,
                zIndex: 16000,
              }}
            >
              <div className="align-menu-title">对齐所选（{selection.length} 张）</div>
              {selection.length > 1 ? (
                <div className="align-grid">
                  <button onClick={() => alignCards('left')}>⬅ 左对齐</button>
                  <button onClick={() => alignCards('hcenter')}>↔ 水平居中</button>
                  <button onClick={() => alignCards('right')}>➡ 右对齐</button>
                  <button onClick={() => alignCards('top')}>⬆ 顶对齐</button>
                  <button onClick={() => alignCards('vcenter')}>↕ 垂直居中</button>
                  <button onClick={() => alignCards('bottom')}>⬇ 底对齐</button>
                  <button onClick={() => alignCards('hspace')}>⇔ 水平等距</button>
                  <button onClick={() => alignCards('vspace')}>⇕ 垂直等距</button>
                </div>
              ) : (
                <div className="align-empty">请先选中 2 张或更多卡片</div>
              )}
            </div>,
            document.body
          )}
        </div>
        {btn('卡片回收站', <><TrashColorIcon size={14} />{trashCards.length ? ` ${trashCards.length}` : ''}</>, () => setModal('card-trash'), modal === 'card-trash')}
        {btn('局域网协同', <GlobeIcon size={16} />, () => setModal('sync'), modal === 'sync', 'desktop-only')}
        <PerformanceMeter />
        {btn('设置', <GearColorIcon size={16} />, () => setModal('settings'), modal === 'settings', 'desktop-only')}
      </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
         onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const src = await fileToDataURL(f);
          const finalSrc = await compressImageDataUrl(src);
          centerAdd((x, y) => useStudio.getState().addImageCard(finalSrc, x - 160, y - 130));
        }}
      />
    </div>
  );
}
