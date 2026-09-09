/**
 * ============ 系统对话框 ============
 * 应用内 确认/输入/选择 对话框，替代浏览器原生 confirm/prompt：
 *  · 主题化外观、多按钮支持、Promise 风格 API
 *  · 导出：csConfirm（确认/取消）、csPrompt（输入）、csAlert / csChoice 等
 *  · 宿主组件 SystemDialogHost 挂在 App 根部，全局单例
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AskIcon, PencilIcon, TrashColorIcon } from './icons';

/**
 * 内置对话框（替代 window.confirm / window.prompt 的系统原生弹窗）
 * - csConfirm: 返回 Promise<boolean>，语义与 window.confirm 一致（确定=true / 取消=null 均 false）
 * - csPrompt : 返回 Promise<string | null>，确定=输入文本（可为空串）/ 取消=null，语义与 window.prompt 一致
 * 弹窗自动排队，多个并发调用依次显示；视觉完全复用应用主题（.modal/.btn/CSS 变量）。
 */

type AnyDialog =
  | {
      kind: 'confirm';
      text: string;
      okText?: string;
      danger?: boolean;
      resolve: (v: boolean) => void;
    }
  | {
      kind: 'prompt';
      text: string;
      def?: string;
      placeholder?: string;
      multiline?: boolean;
      resolve: (v: string | null) => void;
    };

const queue: AnyDialog[] = [];
let listeners = new Set<() => void>();
const emit = () => {
  listeners.forEach((l) => l());
};

export function csConfirm(text: string, opts?: { okText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ kind: 'confirm', text, resolve, ...opts });
    emit();
  });
}

export function csPrompt(text: string, def?: string, placeholder?: string, multiline?: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ kind: 'prompt', text, def, placeholder, multiline, resolve });
    emit();
  });
}

export default function SystemDialogHost() {
  const [cur, setCur] = useState<AnyDialog | null>(null);
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // 从队列取下一个待显示弹窗（当前无显示中时）
  useEffect(() => {
    const fn = () => {
      setCur((prev) => {
        if (prev) return prev;
        const next = queue.shift();
        if (next) {
          setVal(next.kind === 'prompt' ? next.def ?? '' : '');
          return next;
        }
        return null;
      });
    };
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // prompt：显示后自动聚焦并全选默认值，方便直接覆盖输入
  useEffect(() => {
    if (cur?.kind === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      (inputRef.current as HTMLInputElement).select?.();
    }
  }, [cur]);

  const close = (result: boolean | string | null) => {
    if (!cur) return;
    cur.resolve(result as never);
    setCur(null);
    // 立即展示队列中下一个
    const next = queue.shift();
    if (next) {
      setVal(next.kind === 'prompt' ? next.def ?? '' : '');
      setCur(next);
    }
  };

  if (!cur) return null;
  const isPrompt = cur.kind === 'prompt';
  const isDanger = cur.kind === 'confirm' && !!cur.danger;

  return (
    <div
      className="sys-mask"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close(isPrompt ? null : false);
      }}
    >
      <div className="sys-card" role="dialog" aria-modal="true">
        <div className={`sys-ico${isDanger ? ' danger' : ''}`}>{isPrompt ? <PencilIcon size={22} /> : isDanger ? <TrashColorIcon size={22} /> : <AskIcon size={22} />}</div>
        <div className="sys-text">{cur.text}</div>
        {isPrompt && cur.multiline ? (
          <textarea
            ref={inputRef as RefObject<HTMLTextAreaElement>}
            className="sys-input sys-input-area"
            rows={4}
            value={val}
            placeholder={cur.placeholder ?? '请输入…'}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close(null);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.altKey)) {
                e.preventDefault();
                close(val);
              }
            }}
          />
        ) : (
          isPrompt && (
            <input
              ref={inputRef as RefObject<HTMLInputElement>}
              className="sys-input"
              value={val}
              placeholder={cur.placeholder ?? '请输入…'}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') close(val);
                if (e.key === 'Escape') close(null);
              }}
            />
          )
        )}
        <div className="sys-actions">
          <button className="btn" onClick={() => close(isPrompt ? null : false)}>
            取消
          </button>
          <button
            className={`btn ${isDanger ? 'danger' : 'primary'}`}
            onClick={() => close(isPrompt ? val : true)}
          >
            {isPrompt ? '确定' : cur.okText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
