/**
 * ============ 屏幕方向控制（原生端生效） ============
 *  · applyOrientation('portrait' | 'landscape' | 'auto')
 *  · auto：跟随设备当前方向；非原生环境静默忽略
 */
import { ScreenOrientation } from '@capacitor/screen-orientation';

const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

export async function applyOrientation(mode: 'auto' | 'portrait' | 'landscape') {
  if (!isNative) return;
  try {
    if (mode === 'auto') {
      await ScreenOrientation.unlock();
    } else if (mode === 'portrait') {
      await ScreenOrientation.lock({ orientation: 'portrait-primary' });
    } else if (mode === 'landscape') {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    }
  } catch {
    /* 忽略 */
  }
}
