/**
 * ============ 单张卡片渲染（性能敏感，已 memo） ============
 *  · 展示卡片内容/封面/状态角标/批注数，处理选中与拖拽视觉
 *  · customCompare：仅当尺寸/位置/内容等关键字段变化才重渲染
 *  · 交互事件（点击/拖动/右键）由 CanvasBoard 统一处理，此处只负责呈现
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../types';
import { docToHtml } from '../tiptap';
import { docIsEmpty } from '../util';
import { useStudio } from '../store';
import RichEditor from './RichEditor';
import { CAL_STATUS } from './cardStatus';
import { busOn } from '../canvasBus';
import { cardTemplates, randomizeInspirationText, templateToCardRandom } from '../defaults';
import { DiceIcon, TagIcon, ImageIcon, EyeIcon, BookIcon, LockIcon, NodeIcon, CalendarColorIcon, BrainIcon, LockColorIcon, PenIcon, PencilIcon, CheckIcon, CloseIcon, SectionIcon } from './icons';

interface Props {
  card: Card;
  selected: boolean;
  editing: boolean;
  animating: boolean;
  peerEditing: string | null;
  sectionColor?: string;
  sectionEmoji?: string;
  sectionName?: string;
  onResizeStart: (e: React.PointerEvent, id: string, dir: string) => void;
  onContextMenu: (e: React.MouseEvent, card: Card) => void;
  onPointerDownCard: (e: React.PointerEvent, id: string) => void;
  onDoubleClick: (id: string) => void;
  onConnectStart: (e: React.PointerEvent, id: string, dir: string) => void;
  onEnsureVisible?: (id: string) => void;
  edgeTarget?: boolean;
  connectTarget?: boolean;
  connectFrom?: string | null;
  zoom: number;
}

function CardViewInner({ card, selected, editing, animating, peerEditing, sectionColor, sectionEmoji, sectionName, onResizeStart, onContextMenu, onPointerDownCard, onDoubleClick, onConnectStart, onEnsureVisible, edgeTarget = false, connectTarget = false, connectFrom = null }: Props) {
  const sections = useStudio((s) => s.sections);
  const section = sections.find((x) => x.id === card.sectionId);
  const groupColor = card.groupId ? useStudio.getState().groups[card.groupId]?.color : undefined;
  const accent = card.color || sectionColor || section?.color || '#b2bec3';
  // 编组不改变卡片自身颜色（accent 只用卡片色，组色仅用于编组框 group-frame）
  const [titleEdit, setTitleEdit] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // 标题最大字数限制（用户可调）：超过则截断，避免标题栏被撑得过高
  const MAX_TITLE_LEN = 100;
  // “随机模板”待确认态：带 templateKey 的模板卡（含从模板库插入的初始卡）一经出现即处于待确认态，
  // 卡片下方显示 删除(删除本卡)/确认(确认定稿) 气泡，左上角 随机 可随时“再随机”刷新内容。
  //  · 确认 = 清除 templateKey（变普通内容卡，随机 与 删除/确认 气泡随之消失）
  //  · 删除 = 直接删除本卡（卡片消失）
  //  · 随机 = 原地再随机一次内容（内容即时可变，仍处待确认态）
  const deleteCards = useStudio((s) => s.deleteCards);
  const locked = !!card.locked;
  const imageCard = card.kind === 'image';
  // 一卡两面（3.4）：正面=文字面（标题+正文），反面=图片面（配图）；翻面即切换视图，同一张卡
  // kind 仅表示当前翻到哪一面，两面内容互不干扰（setCardKind 不清除另一面内容）
  const toggleKind = () => {
    const st = useStudio.getState();
    const cur = (st.cards && st.cards[card.id]?.kind) ?? card.kind;
    const next = cur === 'image' ? 'note' : 'image';
    st.setCardKind(card.id, next);
  };
  // 圆角半径：与卡片边框保持一致；通过 --card-radius 传给内部（card-body 底部圆角跟随）
  const cardRadius = card.radius === 'sm' ? 6 : card.radius === 'lg' ? 20 : 10;

  const updateCard = useStudio((s) => s.updateCard);
  const setModal = useStudio((s) => s.setModal);
  const setHubFocus = useStudio((s) => s.setHubFocus);
  const zoom = useStudio((s) => s.viewport.zoom);
  // 思路：任何带 templateKey 的模板卡天然处于“待确认态”。点 随机 只在原卡上“原地再随机”一遍内容，
  // 卡片始终保留 templateKey 直至 确认；删除 则把整张卡删除（卡片消失）。
  const randomizeTemplate = () => {
    if (!card.templateKey) return;
    if (card.templateKey === 'inspiration') {
      // 灵感/信息卡：只随机正文内容，保留当前主题/标题（不删卡、不显 删除/确认）
      const lines = randomizeInspirationText(card.title);
      const content = {
        type: 'doc',
        content: lines.filter(Boolean).map((line) => {
          const idx = line.search(/[：:]/);
          if (idx > 0) {
            return {
              type: 'paragraph',
              content: [
                { type: 'text', marks: [{ type: 'bold' }], text: line.slice(0, idx + 1) },
                { type: 'text', text: line.slice(idx + 1).trim() },
              ],
            };
          }
          return { type: 'paragraph', content: [{ type: 'text', text: line }] };
        }),
      };
      updateCard(card.id, { title: card.title, content });
      return;
    }
    const tpl = cardTemplates.find((t) => t.key === card.templateKey);
    if (!tpl) return;
    const rc = templateToCardRandom(tpl, card.sectionId, { x: card.x, y: card.y });
    // 原地再随机：立即应用随机内容，卡片仍处待确认态（templateKey 保留）
    updateCard(card.id, { title: rc.title, content: rc.content });
  };
  // 确认 确认定稿：清除模板标记，卡片变为普通内容卡（随机 与 删除/确认 气泡随之消失）
  const confirmRandomTemplate = () => {
    updateCard(card.id, { templateKey: undefined });
  };
  // 删除 取消：直接删除本卡（卡片立即消失）
  const cancelRandomTemplate = () => {
    deleteCards([card.id]);
  };
  const longPress = useRef<{ t: number; x: number; y: number; move: (ev: PointerEvent) => void; up: () => void } | null>(null);
    const longPressFiredAt = useRef(0);
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const manualTapFiredAt = useRef(0);
  const pointerDownPos = useRef<{ x: number; y: number; t: number } | null>(null);
  const clearLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current.t);
      window.removeEventListener('pointermove', longPress.current.move);
      window.removeEventListener('pointerup', longPress.current.up);
      window.removeEventListener('pointercancel', longPress.current.up);
      longPress.current = null;
    }
  };
  useEffect(() => busOn('cancel-long-press', clearLongPress), []);
  const handlePointerUp = (e: React.PointerEvent) => {
    clearLongPress();
    if (e.pointerType !== 'touch' || !pointerDownPos.current) return;
    const down = pointerDownPos.current;
    pointerDownPos.current = null;
    const dt = Date.now() - down.t;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (dt > 500 || dist > 16) return;
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev && now - prev.t < 400 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
      lastTapRef.current = null;
      manualTapFiredAt.current = now;
      if (locked) return;
      const target = e.target as HTMLElement;
      // 双击卡片名称（标题）：进入标题编辑，不进入富文本正文
      if (target.closest('.card-title-input')) {
        setTitleEdit(true);
        setTimeout(() => titleRef.current?.focus(), 0);
        return;
      }
      // 双击落在卡片内的可交互控件（功能按钮/chip/锚点等）上：不误触发全屏编辑，避免“双击进全屏时误触功能”
      if (target.closest('.card-collapse-btn, .card-fold-btn, .card-tpl-act, .anchor, .card-date-chip, .card-status-chip, .card-section-chip, .card-mode-chip, button, [contenteditable="true"]')) {
        return;
      }
      if (card.mode === 'node' || card.preview) {
        useStudio.getState().setFullscreenCard(card.id);
      } else {
        onDoubleClick(card.id);
      }
    } else {
      lastTapRef.current = { x: e.clientX, y: e.clientY, t: now };
    }
  };
  const hs = 26 / zoom; // 手柄屏幕尺寸恒定(触控友好)
  const as = 28 / zoom; // 锚点屏幕尺寸恒定(触控友好)
  // 标题字号自适应：支持多行换行后，字号不再随长度无限缩小，而是保留可读下限，
// 长标题通过自动换行展示（避免单行省略号）。短标题/宽卡片用稍大字号。
  const titleText = card.title || '';
  const titleLen = titleText.length;
  // 平均每字约占 1em；卡片可用宽 ≈ card.w - 56（扣除内边距/chip）
  const usableW = card.w - 56;
  // 折叠态：标题自适应长度显示（允许多行完整展开），字号保持可读、不强行压缩；
  // 展开态：卡片有固定高度，标题行数受限，字号按需缩小。
  const titleMaxLines = card.collapsed ? 8 : 5;
  // 估算按当前字号能容纳的行数，据此反推字号：字号越大越易溢出，留给换行。
  let titleFontSize = 13.5;
  const perLineApprox = Math.max(4, Math.floor(usableW / 13.5));
  const estimatedLines = Math.max(1, Math.ceil(titleLen / perLineApprox));
  if (estimatedLines > titleMaxLines) {
    // 超出行数上限时适当缩小（但保持 >= 11，其余靠换行/省略由 overflow 兜底）
    titleFontSize = Math.max(11, Math.min(13.5, usableW / Math.max(titleLen / titleMaxLines, 4)));
  } else {
    // 行数上限内：按单行宽度微调，太窄的卡片仍适当缩小
    titleFontSize = Math.max(11, Math.min(13.5, usableW / Math.max(titleLen, 4)));
  }
  // 卡片正文字号：用户设置值反缩放（÷zoom），画布缩放时屏幕大小恒定
  const bodyFontSize = card.fontSize ?? 14; // 正文随画布缩放一起作用(不再反缩放)
  // 标题高度上限：折叠态自适应长度显示（允许多行完整展开），展开态受限（约3行）
  const titleMaxHeight = card.collapsed ? Math.round(titleFontSize * 8.5) : Math.round(titleFontSize * 6.2);
  const resizeTitle = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, titleMaxHeight) + 'px';
  };
  // 折叠/展开状态或标题变化时，重新校准标题自适应高度
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      requestAnimationFrame(() => resizeTitle(el));
    }
  }, [card.collapsed, card.title, titleMaxHeight]);
  const html = useMemo(() => imageCard ? '' : docToHtml(card.content), [card.content, imageCard]);
  const wordCount = useMemo(() => {
    if (editing || imageCard) return 0;
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
    return text.replace(/\s/g, '').length;
  }, [html, editing, imageCard]);

  const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

  return (
    <div
      ref={cardRef}
      className={`card ${Date.now() - (card.createdAt || 0) < 800 ? 'card-new' : ''} ${selected ? 'selected' : ''} ${edgeTarget ? 'edge-target-selected' : ''} ${connectTarget ? 'connect-hit' : ''} ${editing ? 'editing' : ''} ${locked ? 'locked' : ''} ${animating ? 'anim' : ''} ${imageCard ? 'image-card' : `paper-${card.paper || 'card'}`} ${card.collapsed ? 'collapsed' : ''} ${card.mode === 'node' ? 'node-mode' : ''} ${card.preview ? 'preview-mode' : ''} ${connectFrom === card.id ? 'connect-dragging' : ''}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.collapsed ? undefined : card.h,
        zIndex: card.z,
        borderRadius: cardRadius,
        ['--card-radius' as string]: `${cardRadius}px`,
        // 锚点/手柄偏移的缩放系数：缩放时保持贴边（offset = 固定px × 1/zoom）
        ['--inv-zoom' as string]: String(1 / zoom),
        ['--sel-color' as string]: accent,
        // 显式设置颜色的卡片，边框同步染色（与顶部色条呼应）
        ...(card.color ? { borderColor: accent } : {}),
        // 顶部色条由独立元素 .card-topbar 绘制（加大上边框，功能按钮置入其中）
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDownCard(e, card.id);
        if (e.pointerType === 'touch' && e.button === 0) {
          clearLongPress();
          pointerDownPos.current = { x: e.clientX, y: e.clientY, t: Date.now() };
          // 刚通过双击空白新建出来的卡片，短时间内不启动长按，避免误弹菜单
          if (Date.now() - (card.createdAt || 0) < 800) return;
          const x = e.clientX;
          const y = e.clientY;
          // 长按监听放在 window 上：拖动/离开卡片也会取消，避免与拖拽、双击编辑冲突
          const move = (ev: PointerEvent) => {
            if (Math.abs(ev.clientX - x) > 12 || Math.abs(ev.clientY - y) > 12) clearLongPress();
          };
          const up = () => clearLongPress();
          longPress.current = {
            x,
            y,
            move,
            up,
            t: window.setTimeout(() => {
              longPress.current = null;
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              window.removeEventListener('pointercancel', up);
                longPressFiredAt.current = Date.now();
              try { navigator.vibrate?.(24); } catch { /* 不支持振动时忽略 */ }
                onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: x, clientY: y } as unknown as React.MouseEvent, card);
            }, 600),
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up);
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' && longPress.current) {
          if (Math.abs(e.clientX - longPress.current.x) > 12 || Math.abs(e.clientY - longPress.current.y) > 12) clearLongPress();
        }
      }}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => { if (e.pointerType === 'touch') { clearLongPress(); pointerDownPos.current = null; } }}
        onDoubleClickCapture={(e) => {
          // 长按刚弹出菜单后，阻止本次双击继续触发内部编辑（预览/节点/正文）
          if (Date.now() - longPressFiredAt.current < 800) e.stopPropagation();
        }}
      onDoubleClick={(e) => {
        e.stopPropagation();
          // 双击卡片名称（标题）：由标题自身的双击编辑处理，不进入富文本正文
          if ((e.target as HTMLElement).closest('.card-title-input')) return;
          // 双击落在卡片内的可交互控件（功能按钮/chip/锚点等）上：不误触发全屏/编辑，避免“双击进全屏时误触功能”
          if ((e.target as HTMLElement).closest('.card-collapse-btn, .card-fold-btn, .card-tpl-act, .anchor, .card-date-chip, .card-status-chip, .card-section-chip, .card-mode-chip, button, [contenteditable="true"]')) return;
          // 长按刚弹出菜单后，紧接着的一次“双击”不应再进入编辑，避免手势冲突
          if (Date.now() - longPressFiredAt.current < 800) return;
          // 触屏已手动识别双击时，避免浏览器再触发一次原生 dblclick
          if (Date.now() - manualTapFiredAt.current < 500) return;
        if (locked) return;
        if (card.mode === 'node' || card.preview) {
          useStudio.getState().setFullscreenCard(card.id);
          return;
        }
        onDoubleClick(card.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, card);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        // 图片拖入卡片
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (!files.length) return;
        const file = files[0];
        if (!file.type.startsWith('image/')) return;
        const r = new FileReader();
        r.onload = () => {
          const src = String(r.result);
          if (card.kind === 'image') {
            updateCard(card.id, { imageSrc: src });
          } else {
            updateCard(card.id, {
              content: {
                type: 'doc',
                content: [...(card.content?.content || []), { type: 'image', attrs: { src, width: '100%' } }],
              },
            });
          }
        };
        r.readAsDataURL(file);
      }}
    >
      <div className="card-flip-wrap">
      {/* 顶部色条已由卡片背景渐变绘制（见 style.backgroundImage） */}

      {/* 顶部色条（加大上边框）：功能按钮置入其中，标题独占下一行 */}
      <div className="card-topbar" style={{ background: `linear-gradient(120deg, ${accent} 0%, ${accent}d9 100%)` }}>
        <div className="card-topbar-actions">
          {!locked && (
            <>
              {card.templateKey && card.templateKey !== 'inspiration' && (
                <button
                  className="card-collapse-btn"
                  title="随机生成模板内容"
                  aria-label="随机生成模板内容"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    randomizeTemplate();
                  }}
                ><DiceIcon /></button>
              )}
              <button
                className="card-collapse-btn"
                title={imageCard ? '翻到正面（文字面：标题+正文）' : '翻到反面（图片面：卡片配图）'}
                aria-label={imageCard ? '翻到文字面' : '翻到图片面'}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); toggleKind(); }}
              >
                {imageCard ? <ImageIcon /> : <TagIcon />}
              </button>
              <button
                className="card-collapse-btn"
                title={card.preview ? '退出预览模式' : '预览模式：完整显示排版格式'} aria-label={card.preview ? '退出预览模式' : '预览模式'}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  updateCard(card.id, { preview: !card.preview });
                }}
              >
                {card.preview ? <BookIcon /> : <EyeIcon />}
              </button>
            </>
          )}
        </div>
        {/* 折叠按钮：独立放到卡片右上角，做成“书页一角折起/展开”的折角视觉，
            与左上角折叠角标对称的小折角；未收=折起的角，收起=展开的角 */}
        {!locked && (
          <button
            className={`card-fold-btn ${card.collapsed ? 'folded' : ''}`}
            title={card.collapsed ? '展开' : '折叠'} aria-label={card.collapsed ? '展开' : '折叠'}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              updateCard(card.id, { collapsed: !card.collapsed });
            }}
          >
            <span className={`card-fold-corner ${card.collapsed ? 'folded' : ''}`}>
              {/* 实心书页折角：直角在右上，斜边沿“左上→右下”对角朝内；
                  颜色用类纸的米白、半透明低调（参考左上角标 fold-pill 的半透明质感），营造“纸角”质感 */}
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M24 1 L1 1 L23 23 Z" fill="rgba(246, 241, 231, 0.55)" stroke="none" />
              </svg>
            </span>
          </button>
        )}
      </div>
      {/* 标题行（独占宽度，不再与按钮争空间） */}
      <div className="card-header">
        <textarea
          className="card-title-input"
          value={card.title}
          placeholder={imageCard ? '图片说明' : '未命名卡片'}
          readOnly={!titleEdit}
          ref={titleRef}
          rows={1}
          style={{ fontSize: titleFontSize }}
          onChange={(e) => {
            // 标题字数限制：最多 MAX_TITLE_LEN(100) 字，超出部分截断（受控输入自动回落）
            updateCard(card.id, { title: e.target.value.slice(0, MAX_TITLE_LEN) });
            // 标题支持换行：折叠态自适应长度完整显示，展开态受限（约5行）
            resizeTitle(e.target);
          }}
          onKeyDown={(e) => {
            // 不支持用 Enter 提交等特判；Shift+Enter 保留换行，Esc 退出标题编辑
            if (e.key === 'Escape' && titleEdit) { setTitleEdit(false); (e.target as HTMLTextAreaElement).blur(); }
            if (e.key === 'Enter' && !e.shiftKey && titleEdit) { e.preventDefault(); setTitleEdit(false); (e.target as HTMLTextAreaElement).blur(); }
          }}
          onFocus={() => {
            const st = useStudio.getState();
            if (!st.selection.includes(card.id)) st.setSelection([card.id]);
            resizeTitle(titleRef.current);
          }}
          onDoubleClick={(e) => { e.stopPropagation(); setTitleEdit(true); setTimeout(() => titleRef.current?.focus(), 0); }}
          onBlur={() => { setTitleEdit(false); onEnsureVisible?.(card.id); }}
        />
        {sectionEmoji && <span className="card-section-chip" title={sectionName || section?.name}><SectionIcon emoji={sectionEmoji} size={11} /></span>}
        {typeof card.order === 'number' && card.order > 0 && <span className="card-order">№{card.order}</span>}
        {card.date && <span className="card-date-chip clickable" title={`已排进故事日历：${card.date}（点击查看）`} onClick={(e) => { e.stopPropagation(); setHubFocus({ date: card.date, cardId: card.id }); setModal('hub'); }}><CalendarColorIcon size={12} /> {card.date.slice(5).replace('-', '/')}</span>}
        {card.status && (
          <span
            className="card-status-chip"
            style={{ borderColor: CAL_STATUS[card.status]?.dot || 'transparent', color: CAL_STATUS[card.status]?.dot || 'inherit' }}
            title={`故事状态：${CAL_STATUS[card.status]?.label || card.status}`}
          >
            <i style={{ background: CAL_STATUS[card.status]?.dot || '#999' }} />
            {(CAL_STATUS[card.status]?.label || '').replace(/^[^\s]+\s*/, '')}
          </span>
        )}
        {card.mode === 'node' && <span className="card-mode-chip" title="思维导图节点模式"><BrainIcon size={12} /></span>}
        {locked && <span className="card-lock" title="已锁定"><LockColorIcon size={12} /></span>}
      </div>

      {/* 正文 */}
      {!card.collapsed && (
        <div className="card-body" style={{ borderRadius: `0 0 ${Math.max(0, cardRadius - 1)}px ${Math.max(0, cardRadius - 1)}px` }}>
          <div className={`card-flip ${imageCard ? 'flipped' : ''}`}>
            <div className="card-face card-face-note">
              {card.preview ? (
                // 预览模式：完整显示排版格式（表格/图片/标题/列表等），随编辑实时同步
                <div
                  className="card-preview-body"
                  onDoubleClick={(e) => { e.stopPropagation(); useStudio.getState().setFullscreenCard(card.id); }}
                >
                  <div className="rich-static" style={{ fontSize: `${bodyFontSize}px` }} dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              ) : card.mode === 'node' ? (
                <div className="node-summary" onDoubleClick={(e) => { e.stopPropagation(); useStudio.getState().setFullscreenCard(card.id); }}>
                  <span>{summaryText(card)}</span>
                  <em className="node-wc">{wordCount.toLocaleString()} 字 · 双击全屏写作</em>
                </div>
              ) : editing ? (
                <RichEditor
                  doc={card.content}
                  onChange={(doc) => updateCard(card.id, { content: doc })}
                  onEscape={() => useStudio.getState().setEditingCard(null)}
                />
              ) : !docIsEmpty(card.content) ? (
                <div className="rich-static" ref={bodyRef} style={{ fontSize: `${bodyFontSize}px` }} dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="rich-static rich-empty" ref={bodyRef} style={{ fontSize: `${bodyFontSize}px` }} title="双击写正文">
                  <span>{locked ? <><LockColorIcon size={13} /> 已锁定</> : <><PencilIcon size={13} /> 双击此处写正文</>}</span>
                </div>
              )}
            </div>
            <div className="card-face card-face-image">
              <div className="card-image-wrap">
                <img src={card.imageSrc} alt={card.title} style={{ objectFit: card.imageFit || 'contain' }} draggable={false} loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 字数 / 协同标记 */}
      {!editing && !card.collapsed && !imageCard && wordCount > 0 && (
        <span className="card-wc">{wordCount.toLocaleString()} 字</span>
      )}
      {peerEditing && <span className="card-peer"><PencilIcon size={12} /> {peerEditing}</span>}

      {/* 缩放手柄（屏幕尺寸恒定） */}
      {selected && !locked && !card.collapsed && handles.map((h) => (
        <div
          key={h}
          className={`rh rh-${h}`}
          style={{ width: hs, height: hs }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onResizeStart(e, card.id, h);
          }}
        />
      ))}

      {/* 连线锚点（屏幕尺寸恒定） */}
      {selected && !locked && (
        <>
          <div className="anchor anchor-e" style={{ width: as, height: as }} title="拖拽连线" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onConnectStart(e, card.id, 'e'); }} />
          <div className="anchor anchor-w" style={{ width: as, height: as }} title="拖拽连线" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onConnectStart(e, card.id, 'w'); }} />
          <div className="anchor anchor-n" style={{ width: as, height: as }} title="拖拽连线" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onConnectStart(e, card.id, 'n'); }} />
          <div className="anchor anchor-s" style={{ width: as, height: as }} title="拖拽连线" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onConnectStart(e, card.id, 's'); }} />
        </>
      )}

      {/* 随机模板待确认气泡：任何带 templateKey 的模板卡（含从模板库新增的）一经出现即处于待确认态。
          删除 = 删除本卡（卡片消失）；确认 = 确认定稿（清除模板标记，成为普通内容卡） */}
      {!locked && card.templateKey && card.templateKey !== 'inspiration' && (
        <div className="card-tpl-confirm" style={{ ['--inv-zoom' as string]: String(1 / zoom) }}>
          <button
            className="card-tpl-act"
            title="删除这张卡"
            aria-label="删除这张卡"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); cancelRandomTemplate(); }}
          ><CloseIcon size={13} /></button>
          <button
            className="card-tpl-act card-tpl-ok"
            title="确认定稿"
            aria-label="确认定稿"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); confirmRandomTemplate(); }}
          ><CheckIcon size={13} /></button>
        </div>
      )}
      </div>
    </div>
  );
}

const CardView = memo(CardViewInner, (a, b) => {
  const ac = a.card;
  const bc = b.card;
  return (
    a.selected === b.selected &&
    a.edgeTarget === b.edgeTarget &&
    a.connectTarget === b.connectTarget &&
    a.editing === b.editing &&
    a.animating === b.animating &&
    a.peerEditing === b.peerEditing &&
    ac.id === bc.id &&
    ac.x === bc.x &&
    ac.y === bc.y &&
    ac.w === bc.w &&
    ac.h === bc.h &&
    ac.z === bc.z &&
    ac.title === bc.title &&
    ac.collapsed === bc.collapsed &&
    ac.preview === bc.preview &&
    ac.locked === bc.locked &&
    ac.color === bc.color &&
    ac.sectionId === bc.sectionId &&
    ac.mode === bc.mode &&
    ac.radius === bc.radius &&
    ac.kind === bc.kind &&
    ac.templateKey === bc.templateKey &&
    ac.paper === bc.paper &&
    ac.fontSize === bc.fontSize &&
    ac.imageSrc === bc.imageSrc &&
    ac.imageFit === bc.imageFit &&
    ac.order === bc.order &&
    ac.content === bc.content &&
    a.sectionColor === b.sectionColor &&
    a.sectionEmoji === b.sectionEmoji &&
    a.sectionName === b.sectionName &&
    a.zoom === b.zoom &&
    a.connectFrom === b.connectFrom &&
    ac.groupId === bc.groupId
  );
});

export default CardView;

/** 节点模式的摘要文本（优先标题，去除空段） */
function summaryText(card: Card): string {
  const doc = card.content;
  if (!doc || !doc.content) return '';
  const parts: string[] = [];
  for (const n of doc.content) {
    if (n.type === 'heading') {
      const t = (n.content || []).map((x) => x.text || '').join('').trim();
      if (t) parts.push(t);
    } else if (n.type === 'paragraph') {
      const t = (n.content || []).map((x) => x.text || '').join('').trim();
      if (t) parts.push(t);
    }
    if (parts.length >= 2) break;
  }
  const text = parts.join(' · ') || '（空白卡片）';
  return text.slice(0, 60) + (text.length > 60 ? '…' : '');
}
