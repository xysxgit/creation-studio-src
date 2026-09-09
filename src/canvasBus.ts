/**
 * ============ 画布轻量事件总线 ============
 * 组件间解耦通知（无参数、无状态）：
 *  · busOn('layout-done')：自动布局完成后通知（如通知视图复位）
 *  · busOn('cancel-long-press')：取消长按（如拖动开始时）
 * 返回取消订阅函数；用于跨组件且不经过 store 的一次性事件。
 */
type BusEvent = 'layout-done' | 'cancel-long-press';
const listeners: Record<string, Set<() => void>> = {};

export function busOn(ev: BusEvent, fn: () => void): () => void {
  (listeners[ev] ||= new Set()).add(fn);
  return () => listeners[ev]?.delete(fn);
}
export function busEmit(ev: BusEvent) {
  listeners[ev]?.forEach((fn) => fn());
}
