/**
 * ============ 轻提示（toast） ============
 * 全局 toast 队列：短暂显示后自动消失（util.ts 的 toast() 触发），
 * 支持类型（ok/err/warn）与主题化样式；单例挂载 App 根部。
 */
import { useEffect, useState } from 'react';
import { onToast, type Toast } from '../util';

export default function Toasts() {
  const [toasts, setToasts] = useState<(Toast & { live: boolean })[]>([]);

  useEffect(() => {
    const off = onToast((t) => {
      const item = { ...t, live: true };
      setToasts((prev) => [...prev.slice(-4), item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3200);
    });
    return off;
  }, []);

  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}
