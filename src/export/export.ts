/**
 * ============ 导出模块 ============
 * 卡片/项目 → 多种格式：
 *  · Markdown（含小说排版 projectToNovelMarkdown）、HTML（可打印/网页）
 *  · Word(.doc)、TXT、JSON（项目备份）、画布图片 exportCanvasImage
 *  · docToMarkdown / cardToMarkdown：富文本 → Markdown 基础转换
 * 纯函数为主；下载动作在调用方（Modals 导出弹窗）处理。
 */
import type { Annotation, Card, CardGroup, Edge, JSONDoc, ProjectState, Section } from '../types';
import { countWords, download, toast } from '../util';
import { docToHtml } from '../tiptap';
import { edgeGeometry } from '../utils/geometry';

// ---------- TipTap JSON → Markdown ----------
function nodeText(node: JSONDoc): string {
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(nodeText).join('');
}

function marksOf(node: JSONDoc): string {
  let s = nodeText(node);
  const marks = (node.marks || []) as { type: string; attrs?: Record<string, unknown> }[];
  for (const m of marks) {
    if (m.type === 'bold') s = `**${s}**`;
    if (m.type === 'italic') s = `*${s}*`;
    if (m.type === 'code') s = `\`${s}\``;
    if (m.type === 'strike') s = `~~${s}~~`;
    if (m.type === 'underline') s = `<u>${s}</u>`;
    if (m.type === 'link') s = `[${s}](${m.attrs?.href || ''})`;
  }
  return s;
}

function nodeToMd(node: JSONDoc, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return node.content?.map(marksOf).join('') || '';
    case 'heading': {
      const level = (node.attrs?.level as number) || 2;
      return `${'#'.repeat(level)} ${node.content?.map(marksOf).join('') || ''}`;
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (node.content || []).map((li) => nodeToMd(li, depth + 1)).filter(Boolean);
      const prefix = node.type === 'bulletList' ? '- ' : '1. ';
      return items.map((it) => '  '.repeat(depth) + prefix + it).join('\n');
    }
    case 'listItem':
      return (node.content || []).map((c) => nodeToMd(c, depth)).filter(Boolean).join('\n');
    case 'blockquote':
      return (node.content || []).map((c) => nodeToMd(c, depth)).filter(Boolean).map((l) => `> ${l}`).join('\n');
    case 'codeBlock':
      return '```\n' + nodeText(node) + '\n```';
    case 'horizontalRule':
      return '---';
    case 'image':
      return `![图片](${node.attrs?.src || ''})`;
    case 'table': {
      const rows = (node.content || []).map((r) => (r.content || []).map((cell) => nodeText(cell).replace(/\n/g, ' ')));
      if (!rows.length) return '';
      const head = rows[0];
      const out = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
      for (const r of rows.slice(1)) out.push(`| ${r.join(' | ')} |`);
      return out.join('\n');
    }
    case 'hardBreak':
      return '  \n';
    default:
      return (node.content || []).map((c) => nodeToMd(c, depth)).filter(Boolean).join('\n');
  }
}

export function docToMarkdown(doc: JSONDoc | null): string {
  if (!doc) return '';
  return (doc.content || []).map((n) => nodeToMd(n)).filter((l) => l.trim() !== '').join('\n\n');
}

// ---------- 卡片 / 项目 ----------
function cardTitle(c: Card): string {
  return c.title || '未命名卡片';
}

export function cardToMarkdown(c: Card, sectionName?: string): string {
  const parts: string[] = [];
  if (sectionName) parts.push(`【${sectionName}】`);
  parts.push(`## ${cardTitle(c)}`);
  const body = docToMarkdown(c.content);
  if (body) parts.push(body);
  parts.push('');
  return parts.join('\n');
}

export function projectToMarkdown(state: ProjectState): string {
  const { meta, sections, cards } = state;
  const out: string[] = [`# ${meta.name}`, ''];
  let total = 0;
  for (const sec of sections) {
    const list = Object.values(cards)
      .filter((c) => !c.writingOnly && c.sectionId === sec.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    if (!list.length) continue;
    out.push(`\n## ${sec.emoji} ${sec.name}\n`);
    for (const c of list) {
      out.push(cardToMarkdown(c));
      total += countWords(docToHtml(c.content));
    }
  }
  out.push(`\n---\n*共 ${total.toLocaleString()} 字（不含便签标题），由 创作助手 · 剧本工坊 导出*`);
  return out.join('\n');
}

export function projectToTxt(state: ProjectState): string {
  const md = projectToMarkdown(state);
  return md
    .replace(/!\[图片\]\(([^)]*)\)/g, '[图片: $1]')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1($2)')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\|/g, ' ');
}

const WORD_HEAD = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${''}</title>
<style>
  body { font-family: "Noto Serif SC", "SimSun", "宋体", serif; font-size: 12pt; line-height: 1.9; color: #222; max-width: 900px; margin: 0 auto; padding: 2em; }
  h1 { font-size: 22pt; text-align: center; border-bottom: 2px solid #6a5cf5; padding-bottom: .4em; }
  h2 { font-size: 16pt; color: #6a5cf5; border-left: 6px solid #6a5cf5; padding-left: .5em; margin-top: 1.6em; }
  h3 { font-size: 14pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #999; padding: 4px 8px; }
  img { max-width: 100%; }
  blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
  code { background: #f4f4f4; padding: 1px 4px; }
  .word-count { color: #999; font-size: 10pt; text-align: center; margin-top: 2em; }
</style>
</head>
<body>`;

export function projectToHtml(state: ProjectState): string {
  const { meta, sections, cards } = state;
  const body: string[] = [`<h1>${meta.name}</h1>`];
  let total = 0;
  for (const sec of sections) {
    const list = Object.values(cards)
      .filter((c) => !c.writingOnly && c.sectionId === sec.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    if (!list.length) continue;
    body.push(`<h2>${sec.emoji} ${sec.name}</h2>`);
    for (const c of list) {
      body.push(`<h3>${cardTitle(c)}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
      total += countWords(docToHtml(c.content));
    }
  }
  body.push(`<p class="word-count">本文由 创作助手 · 剧本工坊 导出 · 共 ${total.toLocaleString()} 字</p>`);
  return WORD_HEAD.replace('<title></title>', `<title>${meta.name}</title>`) + body.join('') + '</body></html>';
}

export function cardToHtml(c: Card, sectionName?: string): string {
  const body = [`<h1>${cardTitle(c)}</h1>`];
  if (sectionName) body.push(`<h2>${sectionName}</h2>`);
  body.push(docToHtml(c.content) || '<p></p>');
  return WORD_HEAD.replace('<title></title>', `<title>${cardTitle(c)}</title>`) + body.join('') + '</body></html>';
}


// ---------- 整本小说导出（分卷 / 分章） ----------
function sortCardsByOrder(list: Card[]): Card[] {
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
}

export function projectToNovelMarkdown(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>): string {
  const out: string[] = [`# ${meta.name}`, ''];
  let total = 0;
  const groupList = Object.values(groups).filter((g) => g.writingOnly);
  const ungrouped = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && (!c.groupId || !groups[c.groupId]?.writingOnly)));

  groupList.forEach((g, gi) => {
    const list = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && c.groupId === g.id));
    if (!list.length) return;
    out.push(`
# 第 ${gi + 1} 卷　${g.name}
`);
    list.forEach((c, ci) => {
      out.push(`
## 第 ${ci + 1} 章　${c.title || '未命名'}
`);
      const body = docToMarkdown(c.content);
      if (body) out.push(body);
      total += countWords(docToHtml(c.content));
    });
  });

  if (ungrouped.length) {
    out.push(`
# 未分卷
`);
    ungrouped.forEach((c, ci) => {
      out.push(`
## 第 ${ci + 1} 章　${c.title || '未命名'}
`);
      const body = docToMarkdown(c.content);
      if (body) out.push(body);
      total += countWords(docToHtml(c.content));
    });
  }

  out.push(`
---
*全文共 ${total.toLocaleString()} 字，由 创作助手 · 剧本工坊 导出*`);
  return out.join('\n');
}

export function projectToNovelHtml(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>): string {
  const body: string[] = [`<h1>${meta.name}</h1>`];
  let total = 0;
  const groupList = Object.values(groups).filter((g) => g.writingOnly);
  const ungrouped = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && (!c.groupId || !groups[c.groupId]?.writingOnly)));

  groupList.forEach((g, gi) => {
    const list = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && c.groupId === g.id));
    if (!list.length) return;
    body.push(`<h2>第 ${gi + 1} 卷　${g.name}</h2>`);
    list.forEach((c, ci) => {
      body.push(`<h3>第 ${ci + 1} 章　${c.title || '未命名'}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
      total += countWords(docToHtml(c.content));
    });
  });

  if (ungrouped.length) {
    body.push(`<h2>未分卷</h2>`);
    ungrouped.forEach((c, ci) => {
      body.push(`<h3>第 ${ci + 1} 章　${c.title || '未命名'}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
      total += countWords(docToHtml(c.content));
    });
  }

  body.push(`<p class="word-count">全文共 ${total.toLocaleString()} 字，由 创作助手 · 剧本工坊 导出</p>`);
  return WORD_HEAD.replace('<title></title>', `<title>${meta.name}</title>`) + body.join('') + '</body></html>';
}


// ---------- TXT / EPUB / PDF 导出 ----------
export function projectToNovelTxt(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>): string {
  const md = projectToNovelMarkdown(meta, cards, groups);
  return md
    .replace(/!\[图片\]\(([^)]*)\)/g, '[图片: $1]')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1($2)')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\|/g, ' ');
}

// ---------- 极简 EPUB 生成（ZIP Store，无压缩） ----------
function crc32(data: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function makeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // UTF-8
    dv.setUint16(8, 0, true); // stored
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, f.data.length, true);
    dv.setUint32(24, f.data.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, f.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint16(16, 0, true);
    cdv.setUint32(18, crc, true);
    cdv.setUint32(22, f.data.length, true);
    cdv.setUint32(26, f.data.length, true);
    cdv.setUint16(30, nameBytes.length, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint16(38, 0, true);
    cdv.setUint32(40, 0, true);
    cdv.setUint32(44, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
    offset += local.length + f.data.length;
  }

  const centralSize = central.reduce((s, u) => s + u.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const all = new Uint8Array(offset + centralSize + end.length);
  let pos = 0;
  for (const p of parts) { all.set(p, pos); pos += p.length; }
  for (const c of central) { all.set(c, pos); pos += c.length; }
  all.set(end, pos);
  return new Blob([all], { type: 'application/epub+zip' });
}

function novelToEpubXhtml(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>): string {
  const body: string[] = [`<h1>${meta.name}</h1>`];
  const groupList = Object.values(groups).filter((g) => g.writingOnly);
  const ungrouped = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && (!c.groupId || !groups[c.groupId]?.writingOnly)));
  groupList.forEach((g, gi) => {
    const list = sortCardsByOrder(Object.values(cards).filter((c) => c.kind !== 'image' && c.writingOnly && c.groupId === g.id));
    if (!list.length) return;
    body.push(`<h2>第 ${gi + 1} 卷　${g.name}</h2>`);
    list.forEach((c, ci) => {
      body.push(`<h3>第 ${ci + 1} 章　${c.title || '未命名'}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
    });
  });
  if (ungrouped.length) {
    body.push('<h2>未分卷</h2>');
    ungrouped.forEach((c, ci) => {
      body.push(`<h3>第 ${ci + 1} 章　${c.title || '未命名'}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
    });
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title>${meta.name}</title></head>\n<body>${body.join('')}</body>\n</html>`;
}

export function exportNovelEpub(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>) {
  const safe = (meta.name || '未命名小说').replace(/[\\/:*?"<>|]/g, '_');
  const xhtml = novelToEpubXhtml(meta, cards, groups);
  const files = [
    { name: 'mimetype', data: new TextEncoder().encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`) },
    { name: 'OEBPS/content.opf', data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${meta.name}</dc:title><dc:language>zh-CN</dc:language><dc:identifier id="BookId">${Date.now()}</dc:identifier></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="content"/></spine></package>`) },
    { name: 'OEBPS/toc.ncx', data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${Date.now()}"/></head><docTitle><text>${meta.name}</text></docTitle><navMap><navPoint id="nav1" playOrder="1"><navLabel><text>正文</text></navLabel><content src="content.xhtml"/></navPoint></navMap></ncx>`) },
    { name: 'OEBPS/content.xhtml', data: new TextEncoder().encode(xhtml) },
  ];
  const blob = makeZip(files);
  downloadBlob(blob, `${safe}.epub`);
}

export function exportNovelPdf(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>) {
  const html = projectToNovelHtml(meta, cards, groups);
  // App（原生桥）：手机端不支持 window.print，改为导出 HTML（可用浏览器打开后打印）
  const ab = (window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid;
  if (ab?.saveBase64) {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${meta.name || '小说'}.html`);
    return;
  }
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ---------- 下载入口 ----------
export function exportProject(state: ProjectState, format: 'md' | 'html' | 'doc' | 'txt' | 'json') {
  const safe = state.meta.name.replace(/[\\/:*?"<>|]/g, '_');
  if (format === 'md') download(`${safe}.md`, projectToMarkdown(state), 'text/markdown;charset=utf-8');
  else if (format === 'html') download(`${safe}.html`, projectToHtml(state), 'text/html;charset=utf-8');
  else if (format === 'doc') download(`${safe}.doc`, projectToHtml(state), 'application/msword');
  else if (format === 'txt') download(`${safe}.txt`, projectToTxt(state), 'text/plain;charset=utf-8');
  else if (format === 'json') download(`${safe}.json`, JSON.stringify(state, null, 2), 'application/json');
}

export function exportCard(c: Card, sectionName: string | undefined, format: 'md' | 'html' | 'doc') {
  const safe = (c.title || '卡片').replace(/[\\/:*?"<>|]/g, '_');
  if (format === 'md') download(`${safe}.md`, cardToMarkdown(c, sectionName), 'text/markdown;charset=utf-8');
  else if (format === 'html') download(`${safe}.html`, cardToHtml(c, sectionName), 'text/html;charset=utf-8');
  else download(`${safe}.doc`, cardToHtml(c, sectionName), 'application/msword');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 把画布（或选中卡片）导出为 PNG 图片 */
/** 在 SVG path 的起点/终点绘制箭头（与画布 SVG marker 一致，9 用户单位） */
function drawArrowHead(ctx: CanvasRenderingContext2D, path: string, atStart: boolean, color: string) {
  const nums = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (nums.length < 4) return;
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const idx = atStart ? 0 : pts.length - 1;
  const x = pts[idx][0], y = pts[idx][1];
  const o = atStart ? pts[1] : pts[pts.length - 2];
  if (!o) return;
  let dx = atStart ? pts[1][0] - pts[0][0] : pts[idx][0] - o[0];
  let dy = atStart ? pts[1][1] - pts[0][1] : pts[idx][1] - o[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const size = 9;
  const px = -dy, py = dx;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dx * size * 0.75 + px * size * 0.5, y - dy * size * 0.75 + py * size * 0.5);
  ctx.lineTo(x - dx * size * 0.75 - px * size * 0.5, y - dy * size * 0.75 - py * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

export function exportCanvasImage(
  cards: Record<string, Card>,
  sections: Section[],
  selectedIds?: string[],
  opts?: { maxSize?: number; edges?: Record<string, Edge>; annotations?: Record<string, Annotation>; onBlob?: (blob: Blob) => void }
) {
  const list = Object.values(cards)
    .filter((c) => !c.writingOnly && (!selectedIds || selectedIds.includes(c.id)))
    .sort((a, b) => a.z - b.z);
  if (!list.length) {
    toast('没有可导出的卡片', 'warn');
    return;
  }
  const pad = 40;
  const minX = Math.min(...list.map((c) => c.x)) - pad;
  const minY = Math.min(...list.map((c) => c.y)) - pad;
  const maxX = Math.max(...list.map((c) => c.x + c.w)) + pad;
  const maxY = Math.max(...list.map((c) => c.y + c.h)) + pad;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const maxDim = Math.max(contentW, contentH);
  let scale = 2;
  if (opts?.maxSize && maxDim > 0) {
    // 8K：以长边为目标，内容较小则放大到 8K，内容较大则等比缩放到 8K 内
    scale = Math.min(8, Math.max(0.05, opts.maxSize / maxDim));
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, (maxX - minX) * scale);
  canvas.height = Math.max(1, (maxY - minY) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#f8f9fc';
  ctx.fillRect(0, 0, maxX - minX, maxY - minY);
  // 连线（画在卡片下方，与画布 SVG 渲染一致：edgeGeometry 路径 + 箭头 + 统一颜色/宽度）
  if (opts?.edges) {
    for (const e of Object.values(opts.edges)) {
      const from = list.find((c) => c.id === e.from);
      const to = list.find((c) => c.id === e.to);
      if (!from || !to) continue;
      const geo = edgeGeometry(e, from, to);
      const color = e.color || '#8e8ea0';
      const lw = e.width ?? 2.2;
      const arrow = e.arrow ?? 'end';
      ctx.save();
      ctx.translate(-minX, -minY); // edgeGeometry 返回画布绝对坐标，平移到导出坐标系
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(e.dashed ? [6, 4] : []);
      ctx.stroke(new Path2D(geo.path));
      ctx.setLineDash([]);
      if (arrow === 'end' || arrow === 'both') drawArrowHead(ctx, geo.path, false, color);
      if (arrow === 'start' || arrow === 'both') drawArrowHead(ctx, geo.path, true, color);
      ctx.restore();
    }
  }
  for (const c of list) {
    const sec = sections.find((s) => s.id === c.sectionId);
    const x = c.x - minX;
    const y = c.y - minY;
    ctx.fillStyle = c.color || sec?.color || '#ffffff';
    ctx.strokeStyle = '#c8ced8';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, c.w, c.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2d3436';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText((c.title || '未命名卡片').slice(0, 30), x + 12, y + 24, c.w - 24);
    const firstLine = docToMarkdown(c.content).split('\n').map((l) => l.trim()).find(Boolean) || '';
    if (firstLine) {
      ctx.fillStyle = '#636e72';
      ctx.font = '12px sans-serif';
      ctx.fillText(firstLine.slice(0, 80), x + 12, y + 46, c.w - 24);
    }
  }
  // 画笔标注（画在卡片上方）
  if (opts?.annotations) {
    for (const a of Object.values(opts.annotations)) {
      if (!a.points || a.points.length < 1) continue;
      ctx.strokeStyle = a.color || '#e17055';
      ctx.lineWidth = a.width || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      a.points.forEach(([px, py], i) => {
        const x = px - minX;
        const y = py - minY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    if (opts?.onBlob) { opts.onBlob(blob); return; }
    downloadBlob(blob, `画布_${Date.now()}.png`);
  }, 'image/png');
}

/** 将某个分区的卡片内容导出为 PDF（通过浏览器打印） */
export function exportSectionPdf(meta: { name: string }, sections: Section[], cards: Record<string, Card>, sectionId: string) {
  const sec = sections.find((s) => s.id === sectionId);
  if (!sec) return;
  const list = Object.values(cards)
    .filter((c) => !c.writingOnly && c.sectionId === sectionId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
  if (!list.length) {
    toast('该分区没有可导出的卡片', 'warn');
    return;
  }
  const body = [`<h1>${meta.name}</h1>`, `<h2>${sec.emoji} ${sec.name}</h2>`];
  for (const c of list) {
    body.push(`<h3>${cardTitle(c)}</h3>`);
    body.push(docToHtml(c.content) || '<p></p>');
  }
  const html = WORD_HEAD.replace('<title></title>', `<title>${meta.name} - ${sec.name}</title>`) + body.join('') + '</body></html>';
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function openPdfWindow(title: string, bodyHtml: string) {
  const html = WORD_HEAD.replace('<title></title>', `<title>${title}</title>`) + bodyHtml + '</body></html>';
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/** 将选中的卡片内容导出为 PDF，按分区归类 */
export function exportSelectionPdf(meta: { name: string }, sections: Section[], cards: Record<string, Card>, selectedIds: string[]) {
  const list = Object.values(cards).filter((c) => !c.writingOnly && selectedIds.includes(c.id));
  if (!list.length) {
    toast('没有可导出的选中卡片', 'warn');
    return;
  }
  const body = [`<h1>${meta.name}</h1>`, '<h2>选中内容</h2>'];
  for (const sec of sections) {
    const secList = list.filter((c) => c.sectionId === sec.id).sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    if (!secList.length) continue;
    body.push(`<h3>${sec.emoji} ${sec.name}</h3>`);
    for (const c of secList) {
      body.push(`<h4>${cardTitle(c)}</h4>`);
      body.push(docToHtml(c.content) || '<p></p>');
    }
  }
  const ungrouped = list.filter((c) => !c.sectionId);
  if (ungrouped.length) {
    body.push('<h3>未分区</h3>');
    for (const c of ungrouped) {
      body.push(`<h4>${cardTitle(c)}</h4>`);
      body.push(docToHtml(c.content) || '<p></p>');
    }
  }
  openPdfWindow(`${meta.name} - 选中内容`, body.join(''));
}

/** 将全部分区内容导出为 PDF，按分区归类完整保存 */
export function exportSectionsPdf(meta: { name: string }, sections: Section[], cards: Record<string, Card>) {
  const body = [`<h1>${meta.name}</h1>`];
  let hasAny = false;
  for (const sec of sections) {
    const list = Object.values(cards)
      .filter((c) => !c.writingOnly && c.sectionId === sec.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    if (!list.length) continue;
    hasAny = true;
    body.push(`<h2>${sec.emoji} ${sec.name}</h2>`);
    for (const c of list) {
      body.push(`<h3>${cardTitle(c)}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
    }
  }
  const ungrouped = Object.values(cards).filter((c) => !c.writingOnly && !c.sectionId);
  if (ungrouped.length) {
    hasAny = true;
    body.push('<h2>未分区</h2>');
    for (const c of ungrouped) {
      body.push(`<h3>${cardTitle(c)}</h3>`);
      body.push(docToHtml(c.content) || '<p></p>');
    }
  }
  if (!hasAny) {
    toast('没有可导出的分区内容', 'warn');
    return;
  }
  openPdfWindow(meta.name, body.join(''));
}

export function projectStats(state: ProjectState): { cards: number; words: number; sections: number } {
  const visibleCards = Object.values(state.cards).filter((c) => !c.writingOnly);
  let words = 0;
  for (const c of visibleCards) words += countWords(docToHtml(c.content));
  return { cards: visibleCards.length, words, sections: state.sections.length };
}


// ---------- 保存位置选择 / 下载 ----------
/** 通过 File System Access API 让用户选择保存位置并写入；不支持或取消时返回对应状态 */
export async function saveBlobViaPicker(suggestedName: string, blob: Blob): Promise<'saved' | 'cancel' | 'unsupported'> {
  const w = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const ext = '.' + (suggestedName.split('.').pop() || 'txt');
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: suggestedName, accept: { [blob.type || 'application/octet-stream']: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancel';
      return 'unsupported';
    }
  }
  return 'unsupported';
}

/** 触发浏览器下载（无位置选择时的回退方案，浏览器自带下载位置/确认/完成提示） */
export function downloadBlob(blob: Blob, filename: string) {
  // Android 原生壳：走系统保存位置对话框
  const ab = (window as unknown as { OperitAndroid?: { saveBase64: (n: string, b: string, m: string) => void } }).OperitAndroid;
  if (ab?.saveBase64) {
    const reader = new FileReader();
    reader.onload = () => ab.saveBase64(filename, String(reader.result).split(',')[1] || '', blob.type || 'application/octet-stream');
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
