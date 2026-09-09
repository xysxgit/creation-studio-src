import fs from 'fs';

// ---------- 1) Modals.tsx ----------
let m = fs.readFileSync('/root/创作助手/src/components/Modals.tsx', 'utf8');

// hasPicker: native 时不显示"浏览器默认下载"
const oldPicker = `  useEffect(() => {
    setHasPicker(typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function');`;
const newPicker = `  useEffect(() => {
    const native = !!(window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid?.saveBase64;
    setHasPicker(!native && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function');`;
if (m.includes(oldPicker)) { m = m.replace(oldPicker, newPicker, 1); console.log('OK hasPicker'); } else console.log('WARN hasPicker');

// doExport unsupported 分支：native 时文案
const oldDo = `        else { downloadBlob(blob, fname); toast(\`已开始下载 \${fname}（浏览器默认位置）\`, 'ok'); onClose(); }`;
const newDo = `        else {
          downloadBlob(blob, fname);
          if ((window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid?.saveBase64) {
            toast(\`正在打开系统「选择保存位置」对话框…\`, 'info');
          } else {
            toast(\`已开始下载 \${fname}（浏览器默认位置）\`, 'ok');
          }
          onClose();
        }`;
if (m.includes(oldDo)) { m = m.replace(oldDo, newDo, 1); console.log('OK doExport'); } else console.log('WARN doExport');

// 提示文案
const oldHint = `        确认内容无误后再导出；点击下方主按钮会弹出「选择保存位置」对话框（不支持的环境将自动使用浏览器下载）。`;
const newHint = `        确认内容无误后再导出；点击下方主按钮会弹出「选择保存位置」对话框（App 内为系统文件管理器；浏览器内为系统保存对话框或浏览器下载）。`;
if (m.includes(oldHint)) { m = m.replace(oldHint, newHint, 1); console.log('OK hint'); } else console.log('WARN hint');

fs.writeFileSync('/root/创作助手/src/components/Modals.tsx', m);

// ---------- 2) export.ts exportNovelPdf ----------
let e = fs.readFileSync('/root/创作助手/src/export/export.ts', 'utf8');
const oldPdf = `export function exportNovelPdf(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>) {
  const html = projectToNovelHtml(meta, cards, groups);
  const win = window.open('', '_blank');`;
const newPdf = `export function exportNovelPdf(meta: { name: string }, cards: Record<string, Card>, groups: Record<string, CardGroup>) {
  const html = projectToNovelHtml(meta, cards, groups);
  // App（原生桥）：手机端不支持 window.print，改为导出 HTML（可用浏览器打开后打印）
  const ab = (window as unknown as { OperitAndroid?: { saveBase64?: unknown } }).OperitAndroid;
  if (ab?.saveBase64) {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), \`\${meta.name || '小说'}.html\`);
    return;
  }
  const win = window.open('', '_blank');`;
if (e.includes(oldPdf)) { e = e.replace(oldPdf, newPdf, 1); fs.writeFileSync('/root/创作助手/src/export/export.ts', e); console.log('OK exportNovelPdf'); } else console.log('WARN exportNovelPdf');
console.log('前端适配完成');