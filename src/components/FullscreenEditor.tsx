/**
 * ============ 全屏卡片编辑器（覆盖层） ============
 *  · 编辑卡片正文/大纲/字段，富文本 + 字数统计
 *  · 带顶部保存/关闭与底部工具栏，适配横屏大屏（CanvasApp 风格）
 *  · 与画布状态联动（编辑中的卡片实时同步）；懒加载组件
 */
import { useRef, useState } from 'react';
import { useStudio } from '../store';
import { pickImage, isNative as isNativeEnv } from '../native/nativeActions';
import { compressImageDataUrl } from '../util';
import RichEditor from './RichEditor';
import { docWordCount } from '../tiptap';
import { ImageIcon, PencilIcon, ArrowDownIcon, FolderIcon, SectionIcon } from './icons';

export default function FullscreenEditor() {
  const cardId = useStudio((s) => s.fullscreenCardId);
  const card = useStudio((s) => (s.fullscreenCardId ? s.cards[s.fullscreenCardId] : null));
  const sections = useStudio((s) => s.sections);
  const setFullscreenCard = useStudio((s) => s.setFullscreenCard);
  const updateCard = useStudio((s) => s.updateCard);
  const imageInputRef = useRef<HTMLInputElement>(null);


  if (!card || !cardId) return null;
  const sec = sections.find((x) => x.id === card.sectionId);
  const words = docWordCount(card.content);
  const isImage = card.kind === 'image';
  // 统一固定 A4 纸比例（无模式切换）
  const paperClass = 'a4';
  const richEditor = (
    <RichEditor
      doc={card.content}
      onChange={(doc) => updateCard(cardId, { content: doc })}
      onEscape={() => setFullscreenCard(null)}
    />
  );

  const replaceImage = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      const dataUrl = String(r.result || '');
      const finalSrc = await compressImageDataUrl(dataUrl);
      updateCard(cardId, { imageSrc: finalSrc });
    };
    r.readAsDataURL(f);
  };
  // 替换图片：原生端用系统相册，Web 端回退 file input
  const pickAndReplace = async () => {
    if (isNativeEnv()) {
      try {
        const r = await pickImage();
        if (r?.dataUrl) updateCard(cardId, { imageSrc: r.dataUrl });
        return;
      } catch { /* 回退 web */ }
    }
    imageInputRef.current?.click();
  };

  return (
    <div className={`fullscreen-editor ${isImage ? 'image-editor' : ''}`} role="dialog" aria-modal="true" aria-label={isImage ? '图片编辑' : '全屏写作'}>
      <div className="fe-bar">
        <span className="fe-title">{isImage ? <><ImageIcon size={16} /> 图片编辑</> : <><PencilIcon size={16} /> 编辑</>}</span>
        <span className="fe-meta">
          {sec ? <><SectionIcon emoji={sec.emoji} size={13} /> {sec.name}</> : ''}
        </span>
        <div className="fe-actions">
          {/* 收起 = 次要操作：轻量描边样式，不抢编辑区视觉焦点 */}
          <button className="btn fe-collapse" title="收起编辑器，回到画布（内容已自动保存）" aria-label="收起并保存" onClick={() => setFullscreenCard(null)}>
            <ArrowDownIcon size={14} /> 收起
          </button>
        </div>
      </div>
      <div className="fe-title-input">
        <input
          value={card.title}
          placeholder={isImage ? '图片说明' : '未命名卡片'}
          onChange={(e) => updateCard(cardId, { title: e.target.value })}
        />
      </div>

      {isImage ? (
        <div className="fe-body fe-image-body">
          <div className="image-edit-preview">
            {card.imageSrc ? (
              <img src={card.imageSrc} alt={card.title} style={{ objectFit: card.imageFit || 'contain' }} />
            ) : (
              <div className="image-edit-empty">尚未选择图片</div>
            )}
          </div>
          <div className="image-edit-controls">
            <button className="btn primary" onClick={pickAndReplace}><FolderIcon size={14} /> 替换图片</button>
            <div className="fld">
              <span>显示方式</span>
              <div className="btn-row">
                <button className={`btn small ${(card.imageFit || 'contain') === 'contain' ? 'active' : ''}`} onClick={() => updateCard(cardId, { imageFit: 'contain' })}>完整显示</button>
                <button className={`btn small ${card.imageFit === 'fill' ? 'active' : ''}`} onClick={() => updateCard(cardId, { imageFit: 'fill' })}>铺满卡片</button>
              </div>
            </div>
            <p className="hint">双击图片卡会进入图片编辑，可直接替换图片、切换显示方式或修改说明。</p>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { replaceImage(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      ) : (
        <div className="fe-body paper-body">
          <div className={`paper-stage ${paperClass}`}>
            <div className="paper-sheet">
              {richEditor}
            </div>
          </div>
        </div>
      )}

      {!isImage && <span className="fe-wc">{words.toLocaleString()}字</span>}
    </div>
  );
}
