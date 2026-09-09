import fs from 'fs';
let ok = (msg) => console.log('✅', msg), bad = (msg) => console.log('⚠️', msg);

// ============ 1) tiptap.ts: FontSize / FontFamily 扩展 ============
let t = fs.readFileSync('/root/创作助手/src/tiptap.ts', 'utf8');
const marks = `/** 字号标记：给选中文字设置字号（如 18px） */
const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: \`font-size:\${attrs.fontSize}\` } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: 'span', getAttrs: (el) => ((el as HTMLElement).style.fontSize ? {} : false) }]; },
  renderHTML() { return ['span', 0]; },
});

/** 字体标记：给选中文字设置字体 */
const FontFamily = Mark.create({
  name: 'fontFamily',
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
        renderHTML: (attrs) => (attrs.fontFamily ? { style: \`font-family:\${attrs.fontFamily}\` } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: 'span', getAttrs: (el) => ((el as HTMLElement).style.fontFamily ? {} : false) }]; },
  renderHTML() { return ['span', 0]; },
});
`;
if (!t.includes('const FontSize')) {
  const anchor = 'export const extensions = [';
  t = t.replace(anchor, marks + '\n' + anchor, 1);
  t = t.replace('  InlineHeading,\n', '  InlineHeading,\n  FontSize,\n  FontFamily,\n', 1);
  fs.writeFileSync('/root/创作助手/src/tiptap.ts', t);
  ok('tiptap.ts 扩展');
} else bad('tiptap 已有扩展');

// ============ 2) RichEditor.tsx: st 状态 + 工具栏下拉 ============
let r = fs.readFileSync('/root/创作助手/src/components/RichEditor.tsx', 'utf8');
// st 加 fontSize/fontFamily
const oldSt = `        color: (e.getAttributes('textStyle') as { color?: string }).color || '#333333',
        highlight: (e.getAttributes('highlight') as { color?: string }).color || '#ffe58f',`;
const newSt = `        color: (e.getAttributes('textStyle') as { color?: string }).color || '#333333',
        highlight: (e.getAttributes('highlight') as { color?: string }).color || '#ffe58f',
        fontSize: (e.getAttributes('fontSize') as { fontSize?: string }).fontSize || '',
        fontFamily: (e.getAttributes('fontFamily') as { fontFamily?: string }).fontFamily || '',`;
if (r.includes(oldSt)) { r = r.replace(oldSt, newSt, 1); ok('RichEditor st'); } else bad('RichEditor st');

// 工具栏：文字区后加 字号/字体
const oldBar = `        {btn('删除线', st.strike, () => editor.chain().focus().toggleStrike().run(), 'S')}
        <span className="rtb-sep" />
          <span className="rtb-cat">颜色</span>`;
const newBar = `        {btn('删除线', st.strike, () => editor.chain().focus().toggleStrike().run(), 'S')}
        <span className="rtb-sep" />
          <span className="rtb-cat">格式</span>
          <select
            className="rtb-select"
            title="字号：给选中的文字设置字号"
            aria-label="字号"
            value={st.fontSize ? (parseInt(st.fontSize, 10) || 16) : 0}
            onChange={(e) => {
              const v = e.target.value;
              if (!editor) return;
              if (v === '0') editor.chain().focus().unsetMark('fontSize').run();
              else editor.chain().focus().setMark('fontSize', { fontSize: v + 'px' }).run();
            }}
          >
            <option value="0">字号</option>
            {[12, 14, 16, 18, 20, 24, 28, 32, 36].map((s) => <option key={s} value={s}>{s}px</option>)}
          </select>
          <select
            className="rtb-select rtb-font"
            title="字体：给选中的文字设置字体"
            aria-label="字体"
            value={st.fontFamily || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!editor) return;
              if (!v) editor.chain().focus().unsetMark('fontFamily').run();
              else editor.chain().focus().setMark('fontFamily', { fontFamily: v }).run();
            }}
          >
            <option value="">字体</option>
            <option value="宋体, SimSun, serif">宋体</option>
            <option value="黑体, SimHei, sans-serif">黑体</option>
            <option value="楷体, KaiTi, serif">楷体</option>
            <option value="仿宋, FangSong, serif">仿宋</option>
            <option value="微软雅黑, 'Microsoft YaHei', sans-serif">微软雅黑</option>
            <option value="Georgia, 'Times New Roman', serif">衬线</option>
            <option value="Arial, Helvetica, sans-serif">无衬线</option>
          </select>
        <span className="rtb-sep" />
          <span className="rtb-cat">颜色</span>`;
if (r.includes(oldBar)) { r = r.replace(oldBar, newBar, 1); fs.writeFileSync('/root/创作助手/src/components/RichEditor.tsx', r); ok('RichEditor 工具栏'); } else bad('RichEditor 工具栏');

// ============ 3) FullscreenEditor.tsx: 收起更明显 ============
let f = fs.readFileSync('/root/创作助手/src/components/FullscreenEditor.tsx', 'utf8');
const oldBtn = `          <button className="btn primary" aria-label="完成并关闭" onClick={() => setFullscreenCard(null)}>
            ✔ 完成（自动保存）
          </button>`;
const newBtn = `          <button className="btn primary" title="收起编辑器，回到画布（内容已自动保存）" aria-label="收起并保存" onClick={() => setFullscreenCard(null)}>
            ⬇ 收起（已自动保存）
          </button>`;
if (f.includes(oldBtn)) { f = f.replace(oldBtn, newBtn, 1); fs.writeFileSync('/root/创作助手/src/components/FullscreenEditor.tsx', f); ok('FullscreenEditor 按钮'); } else bad('FullscreenEditor 按钮');

// ============ 4) styles.css ============
let s = fs.readFileSync('/root/创作助手/src/styles.css', 'utf8');

// 4.1 纸张长度不固定
const oldSheet = `.paper-sheet {
  /* 固定纸张尺寸：宽 min(96%, 860px)，高由 A4 比例决定——不依赖视口高度，
     软键盘弹出/视口变化时纸张大小不再改变（超出部分由 .paper-stage 滚动） */
  width: min(96%, 860px);
  aspect-ratio: var(--paper-ratio) / 1;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-shrink: 0;
}`;
const newSheet = `.paper-sheet {
  /* 纸张长度不固定：高度随内容自适应增长（min-height 保证初始高度），
     内容变多时纸张自然变长，超出部分由 .paper-stage 滚动 */
  width: min(96%, 860px);
  min-height: 72vh;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  overflow: visible;
  display: flex;
  flex-shrink: 0;
}`;
if (s.includes(oldSheet)) { s = s.replace(oldSheet, newSheet, 1); ok('paper-sheet 自适应'); } else bad('paper-sheet');

const oldRich = `.paper-sheet .rich-editor {
  width: 100%;
  height: 100%;
  border: none;
  box-shadow: none;
  border-radius: 0;
}`;
const newRich = `.paper-sheet .rich-editor {
  width: 100%;
  height: auto;
  min-height: 100%;
  border: none;
  box-shadow: none;
  border-radius: 0;
}`;
if (s.includes(oldRich)) { s = s.replace(oldRich, newRich, 1); ok('paper-sheet rich-editor'); } else bad('paper-sheet rich-editor');

// 4.2 放大编辑字体 16 → 18
let c1 = 0;
for (const [a, b] of [
  ['.fe-body .rich-editor-body { min-height: 100%; font-size: 16px; line-height: 2; }', '.fe-body .rich-editor-body { min-height: 100%; font-size: 18px; line-height: 2; }'],
  ['.paper-sheet .rich-editor-body {\n  min-height: 100%;\n  padding: 24px 32px 40px;\n  font-size: 16px;\n  line-height: 2;\n}', '.paper-sheet .rich-editor-body {\n  min-height: 100%;\n  padding: 24px 32px 40px;\n  font-size: 18px;\n  line-height: 2;\n}'],
  ['.fe-body.card-body .rich-editor-body {\n  min-height: 60vh;\n  padding: 16px 20px 60px;\n  font-size: 16px;\n  line-height: 2;\n  max-width: 1000px;\n  margin: 0 auto;\n}', '.fe-body.card-body .rich-editor-body {\n  min-height: 60vh;\n  padding: 16px 20px 60px;\n  font-size: 18px;\n  line-height: 2;\n  max-width: 1000px;\n  margin: 0 auto;\n}'],
  ['.wm-editor .rich-editor-body { min-height: 100%; font-size: 16px; line-height: 2; }', '.wm-editor .rich-editor-body { min-height: 100%; font-size: 18px; line-height: 2; }'],
]) {
  if (s.includes(a)) { s = s.replace(a, b, 1); c1++; }
}
ok(`字号 16→18 应用 ${c1}/4 处`);

// 4.3 rtb-select 样式
const rtbSel = `.rtb-select {
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel);
  color: var(--text);
  font-size: 12px;
  padding: 0 4px;
  max-width: 74px;
  cursor: pointer;
}
.rtb-select.rtb-font { max-width: 88px; }
`;
if (!s.includes('.rtb-select {')) {
  s = s.replace('.rich-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }', rtbSel + '.rich-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }', 1);
  ok('rtb-select 样式');
} else bad('rtb-select 已有');

fs.writeFileSync('/root/创作助手/src/styles.css', s);
console.log('全部完成');