import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ 1) tiptap.ts: 扩展 TextStyle（加 fontSize/fontFamily），删除独立 FontSize/FontFamily ============
let t = fs.readFileSync('/root/创作助手/src/tiptap.ts', 'utf8');
// 删除之前添加的 FontSize / FontFamily 定义
const oldMarks = t.match(/\/\*\* 字号标记：[\s\S]*?fontFamily: \{\s*default: null,[\s\S]*?\}\);\n\}\);\n\n/);
if (oldMarks) { t = t.replace(oldMarks[0], '', 1); ok('移除旧独立 Mark'); } else bad('旧Mark定位');

// 定义 RichTextStyle（TextStyle + fontSize + fontFamily）
const richStyle = `/** 富文本样式标记：在 TextStyle 基础上扩展 字号(fontSize) / 字体(fontFamily)，与颜色统一存储 */
const RichTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: \`font-size:\${attrs.fontSize}\` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
        renderHTML: (attrs) => (attrs.fontFamily ? { style: \`font-family:\${attrs.fontFamily}\` } : {}),
      },
    };
  },
});
`;
const anchor = 'export const extensions = [';
if (!t.includes('const RichTextStyle')) t = t.replace(anchor, richStyle + '\n' + anchor, 1);

// extensions 数组：去掉 FontSize, FontFamily，替换 TextStyle → RichTextStyle
t = t.replace('  InlineHeading,\n  FontSize,\n  FontFamily,\n', '  InlineHeading,\n', 1);
t = t.replace('  TextStyle,\n', '  RichTextStyle,\n', 1);
fs.writeFileSync('/root/创作助手/src/tiptap.ts', t);
ok('tiptap.ts RichTextStyle');

// ============ 2) RichEditor.tsx: st 改 textStyle；onChange 改 setMark textStyle ============
let r = fs.readFileSync('/root/创作助手/src/components/RichEditor.tsx', 'utf8');
const oldSt = `        fontSize: (e.getAttributes('fontSize') as { fontSize?: string }).fontSize || '',
        fontFamily: (e.getAttributes('fontFamily') as { fontFamily?: string }).fontFamily || '',`;
const newSt = `        fontSize: (e.getAttributes('textStyle') as { fontSize?: string }).fontSize || '',
        fontFamily: (e.getAttributes('textStyle') as { fontFamily?: string }).fontFamily || '',`;
if (r.includes(oldSt)) { r = r.replace(oldSt, newSt, 1); ok('st 改 textStyle'); } else bad('st');

const oldSize = `              if (v === '0') editor.chain().focus().unsetMark('fontSize').run();
              else editor.chain().focus().setMark('fontSize', { fontSize: v + 'px' }).run();`;
const newSize = `              if (v === '0') editor.chain().focus().updateAttributes('textStyle', { fontSize: null }).run();
              else editor.chain().focus().setMark('textStyle', { fontSize: v + 'px' }).run();`;
if (r.includes(oldSize)) { r = r.replace(oldSize, newSize, 1); ok('字号改 textStyle'); } else bad('字号');

const oldFont = `              if (!v) editor.chain().focus().unsetMark('fontFamily').run();
              else editor.chain().focus().setMark('fontFamily', { fontFamily: v }).run();`;
const newFont = `              if (!v) editor.chain().focus().updateAttributes('textStyle', { fontFamily: null }).run();
              else editor.chain().focus().setMark('textStyle', { fontFamily: v }).run();`;
if (r.includes(oldFont)) { r = r.replace(oldFont, newFont, 1); ok('字体改 textStyle'); } else bad('字体');

fs.writeFileSync('/root/创作助手/src/components/RichEditor.tsx', r);
console.log('完成');