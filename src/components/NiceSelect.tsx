/**
 * ============ 自绘下拉选择（10.2.1 七：控件自绘，不唤起系统原生下拉） ============
 * 与原生 <select> 同义的极简 API：value / onChange / options / className / title / disabled。
 * 弹出列表经 portal 定位在按钮下方（JS 量点，任何滚动容器内都不被裁剪）；
 * 支持点击外部 / Esc 关闭、选中项高亮、键盘 Enter/空格打开。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface NiceSelectOption { value: string; label: string; title?: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: NiceSelectOption[];
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** 弹出列表最小宽度（px），默认随按钮宽 */
  popMinWidth?: number;
}

export default function NiceSelect({ value, onChange, options, className = '', title, ariaLabel, disabled, popMinWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (btnRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.bottom, w: r.width });
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={`nice-select ${open ? 'on' : ''} ${className}`}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <span className="nice-select-label">{cur?.label ?? ''}</span>
        <svg className="nice-select-arrow" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          className="nice-select-pop"
          role="listbox"
          style={{ position: 'fixed', left: Math.max(6, Math.min(pos?.x ?? 0, window.innerWidth - 180)), top: (pos?.y ?? 0) + 6, minWidth: Math.max(popMinWidth ?? 0, pos?.w ?? 0, 120), maxHeight: 'min(300px, 60vh)', overflowY: 'auto', zIndex: 30000 }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              title={o.title}
              className={`nice-select-item ${o.value === value ? 'on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              <span className="nice-select-item-label">{o.label}</span>
              {o.value === value && <span className="nice-select-check">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
