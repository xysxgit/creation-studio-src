/**
 * ============ 应用入口 ============
 * 职责：
 *  · 挂载 React 根（StrictMode + 全局 ErrorBoundary）
 *  · window 错误 / 未处理 Promise 拒绝 → 写入应用日志
 *  · 浏览器/PWA 环境注册 Service Worker（原生 WebView 跳过，避免旧缓存）
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { logError } from './util';
import './styles.css';

window.addEventListener('error', (e) => {
  logError('app', 'window.onerror', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  logError('app', 'unhandledrejection', e.reason);
});

/**
 * 视口真实高度基准（--app-h）：修移动端"下半空白/界面整体上移"。
 * 现象：部分移动视口/浏览器下 documentElement.clientHeight（layout viewport）< window.innerHeight
 *       （如地址栏/软键盘/设备差异），依赖 height:100% 的主布局只撑到 clientHeight，屏下方留白。
 * 做法：以 window.innerHeight（动态视口高度，随地址栏/软键盘/旋转自适应）写入 CSS 变量 --app-h，
 *       html/body/#root/.app 据此撑满真实可视区。
 * 边界：仅当页面未被用户捏合缩放（visualViewport.scale≈1）时用 innerHeight；
 *       若页面被捏合缩放，CSS 布局基准为 layout viewport（clientHeight），此时回退 100% 以免溢出。
 */
function syncViewportHeight() {
  const vv = window.visualViewport;
  const scaleOk = !vv || Math.abs(vv.scale - 1) < 0.02; // 未捏合缩放（含无 visualViewport 的旧浏览器）
  const h = window.innerHeight || document.documentElement.clientHeight;
  if (scaleOk && h > 0) {
    document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  } else {
    document.documentElement.style.removeProperty('--app-h');
  }
}
syncViewportHeight();
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);
window.visualViewport?.addEventListener('resize', syncViewportHeight);
window.visualViewport?.addEventListener('scroll', syncViewportHeight);

/**
 * 顶栏实际高度基准（--topbar-h）：修"顶栏与左右菜单面板之间的突兀空白"。
 * 现象：窄屏（≤1024px）下侧栏变为覆盖式抽屉，其顶部 padding-top 之前用硬编码
 *       （顶栏收起 54px / 展开 112px）预留顶栏空间；但顶栏收起态实际仅 42px，
 *       预留量与真实高度不匹配 → 抽屉内容从过高的位置开始，露出大片无内容空白。
 * 做法：顶栏渲染后（及收起/展开、resize、窗口尺寸/方向变化时）实测其高度，写入
 *       CSS 变量 --topbar-h，各依赖顶栏高度的悬浮层（抽屉/悬浮菜单）据此自适应，
 *       真正做到"顶栏高多少，下方就准确预留多少"，消除多余空白。
 */
/**
 * 读取顶栏真实高度并写入 CSS 变量 --topbar-h。
 * 由 MutationObserver / ResizeObserver / resize 等触发。
 * 关键：顶栏 class 刚切换（收起/展开）时，浏览器往往尚未完成该帧的布局/样式回收，
 * 此时同步 getBoundingClientRect() 读到的是旧高度（如折叠 42px），导致抽屉顶部避让量
 * 用了过时的较小值 → 抽屉/悬浮层内容顶部被顶栏遮挡。
 * 这里在读取前先强制一次同步重排（读取 offsetHeight），确保拿到的是顶栏当前真实高度。
 */
function syncTopbarHeight() {
  const top = document.querySelector('.topbar') as HTMLElement | null;
  if (!top) { document.documentElement.style.removeProperty('--topbar-h'); return; }
  // 强制同步重排：确保顶栏收/展的样式已回收，读到的才是当前真实高度
  void top.offsetHeight;
  const h = Math.round(top.getBoundingClientRect().height);
  if (h > 0) {
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  } else {
    document.documentElement.style.removeProperty('--topbar-h');
  }
}
const TOPBAR_OBSERVE_CLASSES = ['collapsed', 'topbar-two-row'];
const TOPBAR_OBSERVE_CLASSES_SAVED = ['collapsed', 'topbar-two-row'];
function giveTopbarHeight() {
  // 重新查找顶栏并挂载其尺寸观察（顶栏可能被 React 重建，需重新绑定）
  const top = document.querySelector('.topbar');
  if (!top) return;
  // 监听顶栏 class 变化（收起/展开），触发高度同步
  const mo = new MutationObserver(() => syncTopbarHeight());
  mo.observe(top, { attributes: true, attributeFilter: ['class'] });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => syncTopbarHeight()).observe(top);
  }
  syncTopbarHeight();
}
function observeTopbarHeight() {
  syncTopbarHeight();
  giveTopbarHeight();
  // 顶栏节点可能因 React 渲染被替换/重建，用观察 #root 子树的方式兜底：
  // 一旦发现新的顶栏节点（或顶栏整体变动），重新绑定尺寸观察并同步。
  const root = document.getElementById('root');
  if (root && typeof MutationObserver !== 'undefined') {
    const ro = new MutationObserver(() => {
      giveTopbarHeight();
    });
    ro.observe(root, { childList: true, subtree: true });
  }
}
// 页面加载完成后顶栏节点才就绪；同时用动态 render 回调兜底
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', observeTopbarHeight);
} else {
  observeTopbarHeight();
}
window.addEventListener('resize', syncTopbarHeight);
window.addEventListener('orientationchange', syncTopbarHeight);
window.visualViewport?.addEventListener('resize', syncTopbarHeight);
window.visualViewport?.addEventListener('scroll', syncTopbarHeight);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Capacitor 原生 WebView 中不注册 Service Worker（避免缓存旧版导致更新不生效）
const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 离线缓存失败不影响使用 */ });
  });
}
