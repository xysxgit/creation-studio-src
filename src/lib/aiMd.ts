/**
 * 轻量 Markdown → HTML（用于展示 AI 面板消息正文与卡片化预览）。
 * 安全策略：先整体 HTML 转义再做结构化解析，杜绝 XSS；不支持的标记原样展示。
 * 支持：# 标题 / 表格 / ```代码块 / 缩进代码 / 引用 / 无序·有序·任务列表 /
 *       分隔线 / 段落；行内：`code` **bold** ~~删除~~ [链接](url) 裸URL
 *       *斜体* _斜体_ #标签（标签卡 chip）。
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 标签卡：仅当 # 后跟“非纯数字”的词且前有边界时渲染；其余保留原文 */
function tagify(s: string): string {
  return s.replace(
    /(^|[\s>（(：:,，、;；|!?！？])#([\p{L}\p{N}_·-]+)/gu,
    (_m, pre: string, word: string) => {
      if (/^\d+$/.test(word)) return pre + '#' + word;
      return `${pre}<span class="ai-tag">#${word}</span>`;
    }
  );
}

/** 行内格式化：行内代码 → 粗体 → 删除线 → 链接 → 斜体 → 裸 URL → 标签 */
function inline(s: string): string {
  let out = s
    .replace(/`([^`\n]+)`/g, (_, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => {
      const href = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
      return `<a href="${href.replace(/["']/g, '')}" rel="noopener" target="_blank">${t}</a>`;
    })
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // 裸链接自动识别（跳过已被 <a href="..."> 包裹的地址）
  out = out.replace(/(?<!["=])https?:\/\/[^\s<"']+/g, (url) => {
    const clean = url.replace(/[),.;:!?，。；：]+$/, '').replace(/["']/g, '');
    return `<a href="${clean}" rel="noopener" target="_blank">${clean}</a>`;
  });
  return tagify(out);
}

const isFence = (line: string) => /^\s*(```|~~~)/.test(line);

/** 解析表格行 → 单元格数组（容忍首尾空 cell） */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** 判断某行是否缩进代码行（4+ 空格开头，且不是列表内容） */
const isIndentCode = (line: string) => /^ {4,}(?![-*+]|\d+[.)])/.test(line);

/** 解析任务列表项；返回 { checked, text } 或 null */
function taskOf(body: string): { checked: boolean; text: string } | null {
  const m = body.match(/^\[([ xX])\]\s+(.*)$/);
  return m ? { checked: m[1] !== ' ' && m[1] !== '', text: m[2] } : null;
}

/** 把 Markdown 源文本“纯文本化”：去掉排版符号，保留可读结构与内容。
 *  用于：消息纯文本模式、折叠行摘要、复制为纯文本等场景。不产生 HTML，可直接以文本渲染。 */
export function stripAiMd(md: string): string {
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const inl = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
      .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1（$2）')
      .replace(/^#+\s*/, '')
      .trim();
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (/^\s*(```|~~~)/.test(line)) { i++; continue; } // 代码围栏
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(t) && /-/.test(t)) { i++; continue; } // 表格分隔行
    if (/^\s*>\s?/.test(line)) { out.push(inl(line.replace(/^\s*>\s?/, ''))); i++; continue; }
    const li = line.match(/^\s*[-*+]\s+(.*)$/);
    if (li) { out.push(`• ${inl(li[1])}`); i++; continue; }
    const oi = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (oi) { out.push(inl(line)); i++; continue; }
    out.push(inl(t));
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** AI 面板正文：Markdown 子集 → 安全 HTML 片段 */
export function renderAiMd(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trimEnd();

    // 1) 围栏代码块 ``` / ~~~
    if (isFence(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre class="ai-code"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // 2) 缩进 4+ 空格的代码块
    if (isIndentCode(line)) {
      const buf: string[] = [];
      while (i < lines.length && isIndentCode(lines[i])) {
        buf.push(lines[i].replace(/^ {4}/, ''));
        i++;
      }
      out.push(`<pre class="ai-code"><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // 3) 表格：表头 + 分隔行 |---|---|
    if (t.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      const head = splitRow(t).map((c) => `<th>${inline(esc(c))}</th>`).join('');
      const rows: string[] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].includes('|')) {
        rows.push(`<tr>${splitRow(lines[i]).map((c) => `<td>${inline(esc(c))}</td>`).join('')}</tr>`);
        i++;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`);
      continue;
    }

    // 4) 标题 # ~ ######
    const h = t.match(/^#{1,6}\s+/);
    if (h) {
      const lvl = h[0].trim().length;
      out.push(`<h${lvl}>${inline(esc(t.slice(h[0].length)))}</h${lvl}>`);
      i++;
      continue;
    }

    // 5) 分隔线 --- / *** / ___
    if (/^\s*([-*_])\1{2,}\s*$/.test(t)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // 6) 引用块 >（连续行合并）
    if (/^\s*>\s?/.test(t)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${buf.map((b) => `<p>${inline(esc(b.trim()))}</p>`).join('')}</blockquote>`);
      continue;
    }

    // 7) 无序列表 - / * / +（两级缩进；- [x] 任务项 → 待办卡）
    if (/^\s*[-*+]\s+/.test(t)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const lt = lines[i];
        const m = lt.match(/^(\s*)([-*+])\s+(.*)$/);
        if (!m) break;
        const d = Math.min(1, Math.floor(m[1].length / 2));
        const task = taskOf(m[3]);
        const liCls = task ? (task.checked ? 'ai-task on' : 'ai-task') : `ai-li-${d}`;
        const inner = task
          ? `<span class="ai-task-box">${task.checked ? '☑' : '☐'}</span>${task.checked ? `<s>${inline(esc(task.text))}</s>` : inline(esc(task.text))}`
          : inline(esc(m[3]));
        buf.push(`<li class="${liCls}">${inner}</li>`);
        i++;
      }
      out.push(`<ul>${buf.join('')}</ul>`);
      continue;
    }

    // 8) 有序列表 1. 2. …
    if (/^\s*\d+[.)]\s+/.test(t)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        buf.push(`<li>${inline(esc(lines[i].replace(/^\s*\d+[.)]\s+/, '')))}</li>`);
        i++;
      }
      out.push(`<ol>${buf.join('')}</ol>`);
      continue;
    }

    // 9) 空行
    if (!t.trim()) {
      i++;
      continue;
    }

    // 10) 普通段落：连续非块行合并，内部 <br> 保留换行
    const buf: string[] = [];
    while (i < lines.length) {
      const lt = lines[i];
      const tt = lt.trimEnd();
      if (!tt.trim() || /^\s*(#{1,6}\s|>|[-*+]\s+|\d+[.)]\s+|```|~~~)/.test(lt) || isIndentCode(lt)
        || (tt.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1]))) break;
      buf.push(inline(esc(tt)));
      i++;
    }
    out.push(`<p>${buf.join('<br>')}</p>`);
  }

  return out.join('\n');
}