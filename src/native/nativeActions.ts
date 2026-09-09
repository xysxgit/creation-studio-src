/**
 * 原生业务动作统一封装层
 * 把「选图 / 分享 / 保存 / 通知 / 主题」等业务动作封装成「原生优先、Web 回退」的接口，
 * 业务层只需调用这些函数，无需关心当前是在安卓原生还是 Web 环境。
 */
import { isNative, NativeGallery, NativeShare, NativeNotification, NativeTheme } from './nativePlugins';
import { compressImageDataUrl } from '../util';

/** 是否在当前安卓原生环境运行 */
export { isNative };

/* ============ 图片选择 ============ */
export interface PickedImage {
  base64: string;   // 不含 data: 前缀的纯 base64
  mime: string;
  dataUrl: string;  // 带 mime 前缀的 data URL，可直接赋给 img / background
}

/**
 * 选一张图片。原生端走系统相册（NativeGallery），Web 端回退到 <input type=file>。
 * 用户取消时返回 null；任一路径失败都回退 web 兜底。
 */
export async function pickImage(): Promise<PickedImage | null> {
  if (isNative()) {
    try {
      const r = await NativeGallery.pickImage();
      if (r && r.base64) {
        const mime = r.mime || 'image/jpeg';
        let dataUrl = `data:${mime};base64,${r.base64}`;
        // 性能增强：大图压缩/缩放，避免 base64 撑爆内存与 localStorage（只影响新插入图片）
        dataUrl = await compressImageDataUrl(dataUrl);
        const outMime = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mime;
        const base64 = dataUrl.split(',')[1] || r.base64;
        return { base64, mime: outMime, dataUrl };
      }
      return null;
    } catch (e) {
      console.warn('[native] 原生相册不可用，回退 Web 选图', e);
    }
  }
  // Web / 兜底：file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const r = new FileReader();
      r.onload = async () => {
        const dataUrl = String(r.result || '');
        const mime = file.type || 'image/jpeg';
        // 性能增强：大图压缩/缩放，避免 base64 撑爆内存与 localStorage
        const compressed = await compressImageDataUrl(dataUrl);
        const outMime = compressed.startsWith('data:image/jpeg') ? 'image/jpeg' : mime;
        const base64 = compressed.split(',')[1] || dataUrl.split(',')[1] || '';
        resolve({ base64, mime: outMime, dataUrl: compressed });
      };
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    };
    // 部分安卓 WebView 无 oncancel，靠 focus 兜底
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/* ============ 原生分享 ============ */
/**
 * 分享纯文本。原生端走系统分享面板，Web 端回退复制到剪贴板。
 */
export async function shareText(text: string, title = '创作助手'): Promise<'shared' | 'copied' | 'failed'> {
  if (isNative()) {
    try {
      await NativeShare.shareText({ text, title });
      return 'shared';
    } catch (e) {
      console.warn('[native] 原生分享失败', e);
    }
  }
  // Web 兜底：复制到剪贴板
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * 分享一个文件（base64）。原生端走系统分享面板（对 PDF/图片等尤其有用）。
 * 非原生环境返回 false（调用方应回退下载）。
 */
export async function shareFile(filename: string, base64: string, mime?: string, title = '创作助手'): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await NativeShare.shareFile({ filename, base64, mime, title });
    return true;
  } catch (e) {
    console.warn('[native] 原生文件分享失败', e);
    return false;
  }
}

/* ============ 原生通知 ============ */
/**
 * 发送一条系统通知。原生端走 NotificationPlugin；Web 端若有通知权限则用系统通知，否则忽略。
 */
export async function notify(title: string, body: string, id?: number): Promise<void> {
  if (isNative()) {
    try { await NativeNotification.show({ title, body, id }); return; } catch { /* ignore */ }
  }
  // Web 兜底：Notification API
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const p = await Notification.requestPermission();
        if (p === 'granted') new Notification(title, { body });
      }
    }
  } catch { /* ignore */ }
}

/* ============ 原生主题 ============ */
/**
 * 应用系统栏主题（状态栏/导航栏颜色与图标明暗）。
 * 原生端走 ThemePlugin 设置系统栏；Web 端仅设置 data-theme。
 * 传入 color 为主色调（如 #6c5ce7），isDark 表示当前是否深色模式。
 */
export async function applyNativeTheme(color: string, isDark: boolean): Promise<void> {
  if (isNative()) {
    try { await NativeTheme.applyTheme({ color, isDark, immersive: false }); } catch { /* ignore */ }
  }
}
