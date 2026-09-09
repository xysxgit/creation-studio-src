/**
 * ============ 富文本编辑器（TipTap 封装） ============
 * 卡片/正文/全屏共用：工具栏（标题/加粗/列表/表格/高亮/图片…）、
 * 字数统计、目录/段落缩进；通过 EditorAIBridge 与悬浮 AI 联动。
 */
import { csPrompt } from './SystemDialog';
// ============ 卡片内嵌富文本编辑器（TipTap）============
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import NiceSelect from './NiceSelect';
import { cleanDoc, extensions, mdToDoc, setDocIndent } from '../tiptap';
import type { JSONDoc } from '../types';
import type { Mark } from '@tiptap/pm/model';
import { fileToDataURL, toast, uid, compressImageDataUrl } from '../util';
import { setEditorBridge, type EditorAIBridge } from '../editorAiStore';
import { ImportIcon, LinkColorIcon, ImageIcon, PaintbrushIcon } from './icons';

interface Props {
  doc: JSONDoc | null;
  onChange: (doc: JSONDoc) => void;
  onEscape: () => void;
  onPasteImage?: (src: string) => void;
  /** 可选：渲染在滚动内容流内的覆盖层（如 A4 分页分割线） */
  overlay?: ReactNode;
}
export default function RichEditor({ doc, onChange, onEscape, onPasteImage, overlay }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [colorPop, setColorPop] = useState(false);
  const [highlightPop, setHighlightPop] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
    const [importedFonts, setImportedFonts] = useState<{ family: string; data: string }[]>([]);

  // 挂载时从 localStorage 恢复已导入字体并注册
  useEffect(() => {
    let alive = true;
    try {
      const arr: { family: string; data: string }[] = JSON.parse(localStorage.getItem('cs.importedFonts') || '[]');
      for (const f of arr) {
        try {
          const face = new FontFace(f.family, `url(${f.data})`);
          document.fonts.add(face);
          face.load();
        } catch { /* 忽略单个字体失败 */ }
      }
      if (alive) setImportedFonts(arr);
    } catch { /* 忽略 */ }
    return () => { alive = false; };
  }, []);

  const onImportFont = async (file: File | undefined) => {
    if (!file) return;
    const data = await fileToDataURL(file);
    const family = (file.name.replace(/\.[^.]+$/, '') || '自定义字体');
    try {
      const face = new FontFace(family, `url(${data})`);
      await face.load();
      document.fonts.add(face);
      const arr = [...importedFonts.filter((f) => f.family !== family), { family, data }];
      setImportedFonts(arr);
      localStorage.setItem('cs.importedFonts', JSON.stringify(arr));
      toast(`已导入字体「${family}」`, 'ok');
    } catch (e) {
      toast(`导入字体失败：${(e as Error).message}`, 'err');
    }
  };

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [moreOpen]);

  useEffect(() => {
    if (!colorPop && !highlightPop) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (colorPop && colorRef.current && !colorRef.current.contains(t)) setColorPop(false);
      if (highlightPop && highlightRef.current && !highlightRef.current.contains(t)) setHighlightPop(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [colorPop, highlightPop]);

  const editor = useEditor({
    extensions,
    content: doc || undefined,
    editorProps: {
      attributes: {
        class: 'rich-editor-body',
        spellcheck: 'false',
        style: 'user-select:text;-webkit-user-select:text;',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          onEscape();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              fileToDataURL(file).then(async (src) => {
                const finalSrc = await compressImageDataUrl(src);
                const imgNode = view.state.schema.nodes.image.create({ src: finalSrc, width: '100%' });
                view.dispatch(view.state.tr.replaceSelectionWith(imgNode));
                onPasteImage?.(finalSrc);
              });
            }
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON());
  },
  });

  // 挂载时向浮球 AI 助手注册「编辑器桥」，供其读取当前正文选中文字并写回结果
  useEffect(() => {
    if (!editor) return;
    const b: EditorAIBridge = {
      id: uid('edi'),
      label: '正文编辑',
      getSelection: () => {
        const sel = editor.state.selection;
        if (!sel.empty) {
          return editor.state.doc.textBetween(sel.from, sel.to, '\n').trim();
        }
        // 编辑器只读时（迷你面板打开）tiptap 不维护内部 selection，回退读取浏览器原生选中文本
        try {
          const dsel = window.getSelection();
          if (dsel && !dsel.isCollapsed && dsel.toString().trim()) {
            const anc = dsel.anchorNode;
            if (anc && editor.view.dom.contains(anc)) return dsel.toString().trim();
          }
        } catch { /* 忽略 */ }
        return '';
      },
      getDocPlain: () => editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n').trim().slice(0, 9000),
      setReadonly: (ro) => {
        if (ro) {
          // 先记住当前选中的文字范围，切只读后恢复，让选中高亮不消失
          let savedRange: Range | null = null;
          let hadText = false;
          try {
            const dsel = window.getSelection();
            if (dsel && !dsel.isCollapsed) {
              const anc = dsel.anchorNode;
              if (anc && editor.view.dom.contains(anc)) {
                hadText = true;
                savedRange = dsel.getRangeAt(0).cloneRange();
              }
            }
          } catch { /* 忽略 */ }
          editor.setEditable(false);
          if (hadText && savedRange) {
            try {
              const dsel = window.getSelection();
              dsel?.removeAllRanges();
              dsel?.addRange(savedRange);
            } catch { /* 忽略 */ }
          } else if (typeof document !== 'undefined' && document.activeElement) {
            const ae = document.activeElement as HTMLElement;
            if (ae && ae.blur && ae !== document.body) ae.blur();
          }
        } else {
          editor.setEditable(true);
        }
      },
      insertResult: (text, mode, aiId) => {
        if (!text) return;
        // 定位目标位置：优先编辑器内部选区；正文只读（迷你面板打开）时回退读取浏览器原生选中
        let from = editor.state.selection.from;
        let to = editor.state.selection.to;
        if (editor.state.selection.empty) {
          try {
            const ds = window.getSelection();
            if (ds && !ds.isCollapsed) {
              const a = ds.anchorNode;
              const f = ds.focusNode;
              if (a && f && editor.view.dom.contains(a) && editor.view.dom.contains(f)) {
                const pa = editor.view.posAtDOM(a, ds.anchorOffset);
                const pf = editor.view.posAtDOM(f, ds.focusOffset);
                if (pa >= 0 && pf >= 0) {
                  from = Math.min(pa, pf);
                  to = Math.max(pa, pf);
                }
              }
            }
          } catch { /* 忽略 */ }
        }
        if (mode === 'replace' && from === to) return; // 替换需要一段选中
        const hid = aiId || '';
        // —— 富文本落法：Markdown 解析为真实排版（标题/列表/表格/加粗等），并给文本打上 AI 标记便于回退
        const rich = typeof localStorage === 'undefined' || localStorage.getItem('cs.aiApplyRich') !== 'plain';
        if (rich) {
          const doc = mdToDoc(text);
          const tagNodes = (nodes: JSONDoc[] | undefined): JSONDoc[] | undefined => {
            if (!nodes) return nodes;
            return nodes.map((n) => {
              if (n.type === 'text') {
                const marks = n.marks ? [...n.marks] : [];
                if (!marks.some((mk) => mk.type === 'aiTag')) marks.push({ type: 'aiTag', attrs: { id: hid } });
                return { ...n, marks };
              }
              if (n.type === 'codeBlock' || !n.content) return n; // 代码块内文本不允许带 mark
              return { ...n, content: tagNodes(n.content) };
            });
          };
          const content = tagNodes(doc.content || []) || [];
          if (content.length) {
            editor.chain().focus().insertContentAt({ from, to }, content).run();
          }
          return;
        }
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = text
          .split(/\n{2,}/)
          .map((p) => `<p><span data-ai="${hid}" style="background:rgba(106,92,245,.14);border-bottom:1px dashed #6a5cf5;border-radius:2px;padding:0 1px;">${esc(p).replace(/\n/g, '<br>')}</span></p>`)
          .join('');
        if (mode === 'replace') editor.chain().insertContentAt({ from, to }, html).run();
        else editor.chain().insertContentAt({ from: to, to }, html).run();
      },
      applyAiRevert: (aiId, orig, mode) => {
        let min = -1;
        let max = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText) {
            node.marks.forEach((mk) => {
              if (mk.type.name === 'aiTag' && mk.attrs.id === aiId) {
                if (min < 0) min = pos;
                max = Math.max(max, pos + node.nodeSize);
              }
            });
          }
        });
        if (min < 0) return false;
        if (mode === 'after') {
          editor.view.dispatch(editor.state.tr.delete(min, max));
        } else {
          const esc2 = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const backHtml = (orig || '').split(/\n{2,}/).map((p) => `<p>${esc2(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';
          editor.chain().insertContentAt({ from: min, to: max }, backHtml).run();
        }
        return true;
      },
      clearAiMark: (aiId) => {
        let min = -1;
        let max = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.isText) {
            node.marks.forEach((mk) => {
              if (mk.type.name === 'aiTag' && mk.attrs.id === aiId) {
                if (min < 0) min = pos;
                max = Math.max(max, pos + node.nodeSize);
              }
            });
          }
        });
        if (min < 0) return false;
        const tr = editor.state.tr.removeMark(min, max, editor.state.schema.marks.aiTag);
        editor.view.dispatch(tr);
        return true;
      },
    };
    setEditorBridge(b);
    return () => setEditorBridge(null);
  }, [editor]);

  // 外部（如 AI 替换正文）更新 doc 时同步到编辑器；普通打字时 doc 与编辑器内容一致，不会触发，避免打断输入
  useEffect(() => {
    if (!editor || !doc) return;
    try {
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(doc)) {
        editor.commands.setContent(doc, false);
      }
    } catch { /* 忽略 */ }
  }, [doc, editor]);

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        h1: e.isActive('inlineHeading', { level: 1 }),
        h2: e.isActive('inlineHeading', { level: 2 }),
        h3: e.isActive('inlineHeading', { level: 3 }),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        quote: e.isActive('blockquote'),
        code: e.isActive('codeBlock'),
        alignL: e.isActive({ textAlign: 'left' }),
        alignC: e.isActive({ textAlign: 'center' }),
        alignR: e.isActive({ textAlign: 'right' }),
        imageSel: e.isActive('image'),
        imageWidth: (e.getAttributes('image') as { width?: string }).width || '',
        table: e.isActive('table'),
        color: (e.getAttributes('textStyle') as { color?: string }).color || '#333333',
        highlight: (e.getAttributes('highlight') as { color?: string }).color || '#ffe58f',
        fontSize: (e.getAttributes('textStyle') as { fontSize?: string }).fontSize || '',
        fontFamily: (e.getAttributes('textStyle') as { fontFamily?: string }).fontFamily || '',
      };
    },
  });

  const pickImage = () => fileRef.current?.click();

  const onFileChosen = async (f: File | undefined) => {
    if (!f || !editor) return;
    const src = await fileToDataURL(f);
    const finalSrc = await compressImageDataUrl(src);
    editor.chain().focus().setImage({ src: finalSrc, width: '100%' } as never).run();
    onPasteImage?.(finalSrc);
  };

  const setLink = async () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = await csPrompt('链接地址：', prev || 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    }
  };

  const setImageWidth = (w: string) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', { width: w }).run();
  };

  const applyClean = () => {
    if (!editor) return;
    const { state } = editor;
      const { from, to, empty } = state.selection;
      let f = from;
      let t = to;
      if (empty) {
        const $from = state.selection.$from;
        f = $from.start();
        t = $from.end();
      }
      const deletes: { from: number; to: number }[] = [];
      state.doc.nodesBetween(f, t, (node, pos) => {
        if (node.type.name === 'paragraph') {
          const text = node.textContent.trim();
          let hasMedia = false;
            node.content.forEach((n) => { if (n.type.name === 'image' || n.type.name === 'hardBreak') hasMedia = true; });
          if (!text && !hasMedia) deletes.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      if (!deletes.length) return;
      editor.chain().focus().command(({ tr }) => {
        for (let i = deletes.length - 1; i >= 0; i--) tr.delete(deletes[i].from, deletes[i].to);
        return true;
      }).run();
    
  };

  const toggleIndent = () => {
    if (!editor) return;
    const doc = editor.getJSON();
    const { state } = editor;
      const { from, to, empty } = state.selection;
      let f = from;
      let t = to;
      if (empty) {
        const $from = state.selection.$from;
        f = $from.start();
        t = $from.end();
      }
      let hasIndent = false;
      state.doc.nodesBetween(f, t, (node) => {
        if (node.type.name === 'paragraph' && (node.attrs as { indent?: string } | undefined)?.indent) hasIndent = true;
      });
      const nextIndent = hasIndent ? null : '2em';
      editor.chain().focus().command(({ tr, state: s }) => {
        const { from: f2, to: t2, empty: e2 } = s.selection;
        let a = f2;
        let b = t2;
        if (e2) {
          const $from = s.selection.$from;
          a = $from.start();
          b = $from.end();
        }
        s.doc.nodesBetween(a, b, (node, pos) => {
          if (node.type.name === 'paragraph') {
            const attrs = { ...node.attrs } as Record<string, unknown>;
            if (nextIndent) attrs.indent = nextIndent;
            else delete attrs.indent;
            tr.setNodeMarkup(pos, undefined, attrs);
          }
        });
        return true;
      }).run();
    
    
  };

  const headingsToParagraphs = () => {
    if (!editor) return;
      const { state } = editor;
      const { from, to, empty } = state.selection;
      let f = from;
      let t = to;
      if (empty) {
        const $from = state.selection.$from;
        f = $from.start();
        t = $from.end();
      }
      const targets: { pos: number; attrs: Record<string, unknown> }[] = [];
      state.doc.nodesBetween(f, t, (node, pos) => {
        if (node.type.name === 'heading') targets.push({ pos, attrs: { ...node.attrs } as Record<string, unknown> });
      });
      if (!targets.length) return;
      editor.chain().focus().command(({ tr, state: s }) => {
        for (let i = targets.length - 1; i >= 0; i--) {
          const attrs = { ...targets[i].attrs };
          delete attrs.level;
          tr.setNodeMarkup(targets[i].pos, s.schema.nodes.paragraph, attrs);
        }
        return true;
      }).run();
      return;
  };

  const trimSpaces = () => {
    if (!editor) return;
      const { state } = editor;
      const { from, to, empty } = state.selection;
      let f = from;
      let t = to;
      if (empty) {
        const $from = state.selection.$from;
        f = $from.start();
        t = $from.end();
      }
      const replacements: { from: number; to: number; text: string; marks: Mark[] }[] = [];
      state.doc.nodesBetween(f, t, (node, pos) => {
        if (node.isText && pos >= f && pos + node.nodeSize <= t) {
          const newText = (node.text || '').replace(/[ \t]+/g, ' ').replace(/^ +| +$/g, '');
          if (newText !== node.text) replacements.push({ from: pos, to: pos + node.nodeSize, text: newText, marks: [...node.marks] });
        }
      });
      if (!replacements.length) return;
      editor.chain().focus().command(({ tr, state: s }) => {
        for (let i = replacements.length - 1; i >= 0; i--) {
          const r = replacements[i];
          tr.replaceWith(r.from, r.to, s.schema.text(r.text, r.marks));
        }
        return true;
      }).run();
      return;
  };
    const applyHeading = (level: 1 | 2 | 3) => {
      if (!editor) return;
      // 行内标题：只改变选中文字的大小/粗细，不影响其他文字和段落结构
      editor.chain().focus().toggleMark('inlineHeading', { level }).run();
    };

  const btn = (title: string, on: boolean, onClick: () => void, label: ReactNode) => (
    <button
      type="button"
      title={title}
      className={`rtb ${on ? 'on' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  // 智能 toggle：有选区时应用一次后取消持久（后续输入不再应用）；无选区时正常切换（持久，状态高亮提示）
  const smartToggle = (mark: string) => () => {
    if (!editor) return;
    const sel = editor.state.selection;
    const hadSel = !sel.empty;
    editor.chain().focus().toggleMark(mark).run();
    if (hadSel) {
      // 把光标移到选区末尾之后的下一位置，脱离刚应用的 mark 区间，后续输入不再继承该格式
      const end = Math.min(sel.to + 1, editor.state.doc.content.size - 2);
      editor.chain().focus().setTextSelection(end).run();
    }
  };

  if (!editor || !st) return null;
  const canUndo = editor.can().undo();
    const canRedo = editor.can().redo();

  return (
    <div className="rich-editor" onMouseDown={(e) => e.stopPropagation()}>
      <div className="rich-toolbar">
          <span className="rtb-cat">历史</span>
          <button
            type="button"
            className={`rtb ${canUndo ? '' : 'disabled'}`}
            title="撤销 Ctrl+Z"
            aria-label="撤销"
            disabled={!canUndo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().undo().run()}
          >↩</button>
          <button
            type="button"
            className={`rtb ${canRedo ? '' : 'disabled'}`}
            title="重做 Ctrl+Y"
            aria-label="重做"
            disabled={!canRedo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().redo().run()}
          >↪</button>
          <span className="rtb-sep" />
          <span className="rtb-cat">文字</span>
        {btn('加粗', st.bold, smartToggle('bold'), 'B')}
        {btn('斜体', st.italic, smartToggle('italic'), 'I')}
        {btn('下划线', st.underline, smartToggle('underline'), 'U')}
        {btn('删除线', st.strike, smartToggle('strike'), 'S')}
        <span className="rtb-sep" />
          <span className="rtb-cat">格式</span>
          <NiceSelect
            className="rtb-nice"
            title="字号：给选中的文字设置字号"
            ariaLabel="字号"
            value={st.fontSize ? String(parseInt(st.fontSize, 10) || 16) : '0'}
            onChange={(v) => {
              if (!editor) return;
              if (v === '0') editor.chain().focus().updateAttributes('textStyle', { fontSize: null }).run();
              else editor.chain().focus().setMark('textStyle', { fontSize: v + 'px' }).run();
            }}
            options={[{ value: '0', label: '字号' }, ...[8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 42].map((s) => ({ value: String(s), label: `${s}px` }))]}
          />
          <NiceSelect
            className="rtb-nice rtb-font"
            title="字体：给选中的文字设置字体（可导入）"
            ariaLabel="字体"
            value={st.fontFamily || ''}
            onChange={(v) => {
              if (!editor) return;
              if (!v) editor.chain().focus().updateAttributes('textStyle', { fontFamily: null }).run();
              else editor.chain().focus().setMark('textStyle', { fontFamily: v }).run();
            }}
            options={[
              { value: '', label: '字体' },
              { value: 'inherit', label: '系统默认' },
              { value: 'serif', label: '衬线' },
              { value: 'sans-serif', label: '无衬线' },
              { value: 'monospace', label: '等宽' },
              ...importedFonts.map((f) => ({ value: f.family, label: f.family })),
            ]}
          />
          <button
            type="button"
            className="rtb imp-font"
            title="导入字体（ttf/otf/woff），导入后可在字体下拉中选择"
            aria-label="导入字体"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fontInputRef.current?.click()}
          ><ImportIcon size={15} /></button>
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,.ttc"
            style={{ display: 'none' }}
            onChange={(e) => { onImportFont(e.target.files?.[0]); e.target.value = ''; }}
          />
        <span className="rtb-sep" />
          <span className="rtb-cat">颜色</span>
          <div className="rtb-color-wrap" ref={colorRef}>
            <button
              type="button"
              className={`rtb ${colorPop ? 'on' : ''}`}
              title="文字颜色：给选中的文字上色"
              aria-label="文字颜色"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setColorPop((v) => !v); setHighlightPop(false); }}
            >A</button>
            {colorPop && (
              <div className="rtb-color-pop">
                <div className="rtb-color-pop-title">文字颜色</div>
                {['#333333', '#e17055', '#d63031', '#e84393', '#a29bfe', '#6a5cf5', '#0984e3', '#00b894', '#fdcb6e', '#ffffff'].map((c) => (
                  <button
                    key={c}
                    className={`rtb-swatch ${st.color === c ? 'on' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { editor.chain().focus().setColor(c).run(); }}
                  />
                ))}
                <button className="rtb-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().unsetColor().run(); setColorPop(false); }}>清除颜色</button>
              </div>
            )}
          </div>
          <div className="rtb-color-wrap" ref={highlightRef}>
            <button
              type="button"
              className={`rtb ${highlightPop ? 'on' : ''}`}
              title="荧光笔：给选中的文字加高亮"
              aria-label="荧光笔"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setHighlightPop((v) => !v); setColorPop(false); }}
            ><PaintbrushIcon size={15} /></button>
            {highlightPop && (
              <div className="rtb-color-pop">
                <div className="rtb-color-pop-title">荧光笔</div>
                {['#ffe58f', '#ffd6e7', '#d3f9d8', '#d0ebff', '#e5dbff', '#fff3bf'].map((c) => (
                  <button
                    key={c}
                    className={`rtb-swatch ${st.highlight === c ? 'on' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); }}
                  />
                ))}
                <button className="rtb-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor.chain().focus().unsetHighlight().run(); setHighlightPop(false); }}>清除高亮</button>
              </div>
            )}
          </div>
          {btn('清除文字颜色', false, () => editor.chain().focus().unsetColor().run(), '清除颜色')}
          {btn('清除高亮', false, () => editor.chain().focus().unsetHighlight().run(), '清除高亮')}
          <span className="rtb-cat">段落</span>
        {btn('标题 1', st.h1, () => applyHeading(1), 'H1')}
        {btn('标题 2', st.h2, () => applyHeading(2), 'H2')}
        {btn('标题 3', st.h3, () => applyHeading(3), 'H3')}
        <span className="rtb-sep" />
        {btn('无序列表', st.bullet, () => editor.chain().focus().toggleBulletList().run(), '•≡')}
        {btn('有序列表', st.ordered, () => editor.chain().focus().toggleOrderedList().run(), '1≡')}
        {btn('引用', st.quote, () => editor.chain().focus().toggleBlockquote().run(), '❝')}
        {btn('代码块', st.code, () => editor.chain().focus().toggleCodeBlock().run(), '</>')}
        <span className="rtb-sep rtb-break" />
        {btn('左对齐', st.alignL, () => editor.chain().focus().setTextAlign('left').run(), '⇤')}
        {btn('居中', st.alignC, () => editor.chain().focus().setTextAlign('center').run(), '⇹')}
        {btn('右对齐', st.alignR, () => editor.chain().focus().setTextAlign('right').run(), '⇥')}
        <span className="rtb-sep" />
          {/*
        <label className="rtb-color" title="文字颜色">
          <input
            type="color"
            value={st.color}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
          A
        </label>
        <label className="rtb-color" title="荧光笔">
          <input
            type="color"
            value={st.highlight}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
          （荧光笔图标）
        </label>
          */}
        <span className="rtb-sep" />
          <span className="rtb-cat">插入</span>
        {btn('链接', editor.isActive('link'), setLink, <LinkColorIcon size={15} />)}
        {btn('插入图片', st.imageSel, pickImage, <ImageIcon size={15} />)}
        {btn('插入表格', st.table, () =>
          st.table
            ? editor.chain().focus().deleteTable().run()
            : editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), '▦')}
          <div className="rtb-more" ref={moreRef}>
            <button
              type="button"
              className={`rtb rtb-more-btn ${moreOpen ? 'on' : ''}`}
              title="更多工具"
              aria-haspopup="true"
              aria-expanded={moreOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMoreOpen((v) => !v)}
            >
              ⋯
            </button>
            {moreOpen && (
              <div className="rtb-more-pop">
                <div className="rtb-more-title">工具</div>
        {btn('清除选中文字的格式', false, () => editor.chain().focus().unsetAllMarks().clearNodes().run(), '清格式')}
        <span className="rtb-sep" />
        {btn('清理选中范围内的空行', false, applyClean, '清空行')}
        {btn('对选中段落首行缩进（再点取消）', false, toggleIndent, '首行缩进')}
        {btn('清理选中文字的连续/首尾空格', false, trimSpaces, '去空格')}
        {btn('将选中的标题转为正文', false, headingsToParagraphs, '转正文')}
        {btn('插入场景分隔线', false, () => editor.chain().focus().setHorizontalRule().run(), '分隔线')}
        {st.imageSel && (
          <span className="rtb-imgw">
            宽
            <input
              type="number"
              min={10}
              max={2000}
              value={parseInt(st.imageWidth, 10) || 100}
              onChange={(e) => setImageWidth(`${e.target.value}px`)}
            />
            px
          </span>
        )}
                </div>
              )}
      </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            onFileChosen(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="rich-scroll">
        <EditorContent editor={editor} />
        {overlay}
      </div>
    </div>
  );
}
