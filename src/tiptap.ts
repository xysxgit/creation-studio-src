/**
 * ============ TipTap 富文本统一封装 ============
 * 所有编辑器的共用层：
 *  · extensions：全局扩展集合（斜体/下划线/表格/高亮/图片/占位符…）
 *  · docToHtml / textToDoc / fieldsToDoc：JSON ↔ HTML/文本/字段文档互转
 *  · docWordCount / docWordCountCached：字数统计（带按 id 缓存，供列表高频调用）
 *  · cleanDoc / setDocIndent：文档清洗与段落缩进
 * 供卡片编辑器、全屏编辑器、写作模式、导出模块共同使用。
 */
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { getSchema, Mark } from '@tiptap/core';
import { DOMSerializer, Node } from '@tiptap/pm/model';
import type { JSONDoc } from './types';

// 可调整宽度的图片扩展
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('width') || (el as HTMLElement).style.width || null,
        renderHTML: (attrs) => {
          const style = attrs.width ? `width:${attrs.width}` : '';
          return { style, loading: 'lazy', decoding: 'async' };
        },
      },
    };
  },
});

/** 支持首行缩进的段落扩展 */
const IndentParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      indent: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).style.textIndent || null,
        renderHTML: (attrs) => attrs.indent ? { style: `text-indent:${attrs.indent}` } : {},
      },
    };
  },
});


/** 行内标题标记：只改变选中文字的大小/粗细，不把整个段落变成标题 */
const InlineHeading = Mark.create({
  name: 'inlineHeading',
  addAttributes() {
    return { level: { default: 1 } };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-heading]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const level = Number(HTMLAttributes.level) || 1;
    const size = level === 1 ? '1.7em' : level === 2 ? '1.4em' : '1.2em';
    return ['span', { ...HTMLAttributes, 'data-inline-heading': String(level), style: `font-size:${size};font-weight:700;` }, 0];
  },
});

const RichTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
        renderHTML: (attrs) => (attrs.fontFamily ? { style: `font-family:${attrs.fontFamily}` } : {}),
      },
    };
  },
});

/** AI 应用标记：AI 生成内容写入正文后带此标记，可区分、可恢复/清除 */
const AiTag = Mark.create({
  name: 'aiTag',
  addAttributes() {
    return { id: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-ai]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const id = HTMLAttributes.id || '';
    return [
      'span',
      {
        'data-ai': id,
        style: 'background:rgba(106,92,245,.14);border-bottom:1px dashed #6a5cf5;border-radius:2px;padding:0 1px;',
      },
      0,
    ];
  },
});

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    paragraph: false,
  }),
  IndentParagraph,
  InlineHeading,
  AiTag,
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  RichTextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: '在这里开始书写……支持 加粗 / 标题 / 列表 / 表格 / 图片 / 高亮',
  }),
  ResizableImage.configure({ allowBase64: true }),
];

/** JSON 文档 → HTML 字符串（使用真实 DOM 序列化，保证 textAlign 等样式完整渲染） */
export function docToHtml(doc: JSONDoc | null | undefined): string {
  if (!doc) return '';
  try {
    const schema = getSchema(extensions);
    const node = Node.fromJSON(schema, doc);
    const dom = document.createElement('div');
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document });
    dom.appendChild(fragment);
    return dom.innerHTML;
  } catch {
    return '';
  }
}

/** 统计文档字数 */
export function docWordCount(doc: JSONDoc | null | undefined): number {
  const html = docToHtml(doc);
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  return text.replace(/\s/g, '').length;
}

// 按卡片缓存字数：内容对象引用不变则直接返回缓存值。
// 打字时只有被编辑的卡片内容引用变化，其余卡片命中缓存，避免每次按键
// 对全部卡片重复 HTML 序列化（120 张卡 = 120 次 docToHtml）。
const wcCache = new Map<string, { content: unknown; count: number }>();
export function docWordCountCached(doc: JSONDoc | null | undefined, id: string): number {
  const hit = wcCache.get(id);
  if (hit && hit.content === doc) return hit.count;
  const count = docWordCount(doc);
  wcCache.set(id, { content: doc ?? null, count });
  if (wcCache.size > 3000) wcCache.clear();
  return count;
}

/** 清理排版：删除空段落，并把连续多个空段落合并为一个（保留图片/表格等非空节点） */
export function cleanDoc(doc: JSONDoc | null | undefined): JSONDoc | null {
  if (!doc) return null;
  const content: JSONDoc[] = [];
  let pendingBlank = false;
  for (const node of doc.content || []) {
    if (node.type === 'paragraph') {
      const text = (node.content || []).map((n) => n.text || '').join('').trim();
      const hasMedia = (node.content || []).some((n) => n.type === 'image' || n.type === 'hardBreak');
      if (!text && !hasMedia) {
        if (pendingBlank && content.length) continue;
        pendingBlank = true;
        content.push({ type: 'paragraph' });
        continue;
      }
    }
    pendingBlank = false;
    content.push(node);
  }
  // 结尾不留多余空段
  while (content.length > 1 && content[content.length - 1]?.type === 'paragraph' && !(content[content.length - 1].content || []).length) {
    content.pop();
  }
  if (!content.length) content.push({ type: 'paragraph' });
  return { ...doc, content };
}

/** 给文档中所有段落设置/取消首行缩进 */
export function setDocIndent(doc: JSONDoc | null | undefined, indent: string | null): JSONDoc | null {
  if (!doc) return null;
  const walk = (nodes: JSONDoc[] | undefined): JSONDoc[] | undefined => {
    if (!nodes) return nodes;
    return nodes.map((node) => {
      const next = { ...node };
      if (next.content) next.content = walk(next.content);
      if (next.type === 'paragraph') {
        next.attrs = { ...(next.attrs || {}) };
        if (indent) next.attrs.indent = indent;
        else delete next.attrs.indent;
      }
      return next;
    });
  };
  return { ...doc, content: walk(doc.content) };
}

/** 纯文本数组 → TipTap JSON 文档；'#' 开头视为小标题 */
export function textToDoc(lines: string[]): JSONDoc {
  const content: JSONDoc[] = [];
  for (const raw of lines) {
    if (raw.startsWith('#')) {
      content.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: raw.slice(1).trim() }] });
    } else {
      content.push({ type: 'paragraph', content: [{ type: 'text', text: raw }] });
    }
  }
  if (!content.length) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

/** 模板字段数组 → TipTap JSON 文档（字段名加粗作为标签行，sample 填充样板内容） */
export function fieldsToDoc(fields: { label: string; hint?: string; sample?: string }[]): JSONDoc {
  const content: JSONDoc[] = [];
  for (const f of fields) {
    const parts: JSONDoc[] = [{ type: 'text', marks: [{ type: 'bold' }], text: `${f.label}：` }];
    const val = f.sample || (f.hint ? `（${f.hint}）` : '');
    // 空文本节点会导致 ProseMirror 序列化失败，无内容时省略
    if (val) parts.push({ type: 'text', text: val });
    content.push({ type: 'paragraph', content: parts });
  }
  return { type: 'doc', content };
}

/** 行内标记统一扫描：**bold** ~~删除~~ `code` [text](url) *italic* _italic_ */
const INLINE_RE = /\*\*([^*]+?)\*\*|~~([^~]+?)~~|`([^`]+?)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/g;

/** 把行内文本解析为带 mark 的 tiptap 节点数组 */
function inlineNodes(text: string): JSONDoc[] {
  const nodes: JSONDoc[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    const [full, bold, strike, code, lt, href, it1, it2] = m;
    if (bold !== undefined) nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: bold });
    else if (strike !== undefined) nodes.push({ type: 'text', marks: [{ type: 'strike' }], text: strike });
    else if (code !== undefined) nodes.push({ type: 'text', marks: [{ type: 'code' }], text: code });
    else if (lt !== undefined) {
      const u = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`;
      nodes.push({ type: 'text', marks: [{ type: 'link', attrs: { href: u, target: '_blank', rel: 'noopener' } }], text: lt });
    } else {
      nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: it1 ?? it2 });
    }
    last = m.index + full.length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  if (!nodes.length) nodes.push({ type: 'text', text });
  return nodes;
}

const isMdFence = (line: string) => /^\s*(```|~~~)/.test(line);
const isMdIndentCode = (line: string) => /^ {4,}(?![-*+]|\d+[.)])/.test(line);

/** 表格行 → tiptap 单元格节点（首行表头，其余数据行） */
function tableDoc(lines: string[], start: number): JSONDoc {
  const cell = (raw: string, header: boolean): JSONDoc => ({
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content: inlineNodes(raw.trim()) }],
  });
  const split = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  const head = split(lines[start]).map((c) => cell(c, true));
  const body: JSONDoc[] = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].includes('|')) {
    body.push({ type: 'tableRow', content: split(lines[i]).map((c) => cell(c, false)) });
    i++;
  }
  return {
    type: 'table',
    attrs: { colWidth: null, resizable: true },
    content: [
      { type: 'tableRow', content: head },
      ...body,
    ],
  };
}

/** Markdown（增强简版）→ TipTap JSON 文档（AI 内容写入正文，格式完整保留）。
 *  块：###标题 / -列表（含 - [x] 任务）/ 1.列表 / >引用 / 表格 / ```代码块 / 缩进代码 / ---分隔线
 *  行内：**bold** *italic* `code` ~~删除~~ [链接](url) */
export function mdToDoc(md: string): JSONDoc {
  const content: JSONDoc[] = [];
  let listType: 'bulletList' | 'orderedList' | null = null;
  let listItems: JSONDoc[] = [];
  const flushList = () => {
    if (!listType || !listItems.length) return;
    content.push({ type: listType, content: listItems });
    listType = null;
    listItems = [];
  };
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (isMdFence(line)) {
      flushList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isMdFence(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      content.push({ type: 'codeBlock', content: [{ type: 'text', text: buf.join('\n') }] });
      continue;
    }

    if (isMdIndentCode(line)) {
      flushList();
      const buf: string[] = [];
      while (i < lines.length && isMdIndentCode(lines[i])) { buf.push(lines[i].replace(/^ {4}/, '')); i++; }
      content.push({ type: 'codeBlock', content: [{ type: 'text', text: buf.join('\n') }] });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      flushList();
      const tDoc = tableDoc(lines, i);
      i += 2 + (tDoc.content?.length || 1) - 1;
      content.push(tDoc);
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      content.push({ type: 'heading', attrs: { level: Math.min(h[1].length, 3) as 1 | 2 | 3 }, content: inlineNodes(h[2]) });
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushList();
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushList();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '').trim()); i++; }
      content.push({ type: 'blockquote', content: buf.map((b) => ({ type: 'paragraph', content: inlineNodes(b) })) });
      continue;
    }

    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      if (listType !== 'bulletList') { flushList(); listType = 'bulletList'; }
      const task = ul[1].match(/^\[([ xX])\]\s+(.*)$/);
      const parts: JSONDoc[] = [];
      if (task) {
        parts.push({ type: 'text', text: task[1] === 'x' || task[1] === 'X' ? '☑ ' : '☐ ' });
        parts.push(...inlineNodes(task[2]));
      } else {
        parts.push(...inlineNodes(ul[1]));
      }
      listItems.push({ type: 'listItem', content: [{ type: 'paragraph', content: parts }] });
      i++;
      continue;
    }

    const ol = line.match(/^\d+[.、)]\s+(.*)$/);
    if (ol) {
      if (listType !== 'orderedList') { flushList(); listType = 'orderedList'; }
      listItems.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineNodes(ol[1]) }] });
      i++;
      continue;
    }

    flushList();
    if (line.trim() === '') { i++; continue; }
    content.push({ type: 'paragraph', content: inlineNodes(line) });
    i++;
  }
  flushList();
  if (!content.length) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}
