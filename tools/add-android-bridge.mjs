import fs from 'fs';
// 1) util.ts download 加 Android 桥
let u = fs.readFileSync('/root/创作助手/src/util.ts', 'utf8');
const oldU = `export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });`;
const newU = `export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  // Android 原生壳：走系统保存位置对话框（ACTION_CREATE_DOCUMENT）
  const ab = (window as unknown as { OperitAndroid?: { saveBase64: (n: string, b: string, m: string) => void } }).OperitAndroid;
  if (ab?.saveBase64) {
    const blob = new Blob([content], { type: mime });
    const reader = new FileReader();
    reader.onload = () => ab.saveBase64(filename, String(reader.result).split(',')[1] || '', mime);
    reader.readAsDataURL(blob);
    return;
  }
  const blob = new Blob([content], { type: mime });`;
if (u.includes(oldU)) { u = u.replace(oldU, newU, 1); fs.writeFileSync('/root/创作助手/src/util.ts', u); console.log('OK util.ts'); } else { console.log('WARN util.ts'); }

// 2) export.ts downloadBlob 加 Android 桥
let e = fs.readFileSync('/root/创作助手/src/export/export.ts', 'utf8');
const oldE = `export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);`;
const newE = `export function downloadBlob(blob: Blob, filename: string) {
  // Android 原生壳：走系统保存位置对话框
  const ab = (window as unknown as { OperitAndroid?: { saveBase64: (n: string, b: string, m: string) => void } }).OperitAndroid;
  if (ab?.saveBase64) {
    const reader = new FileReader();
    reader.onload = () => ab.saveBase64(filename, String(reader.result).split(',')[1] || '', blob.type || 'application/octet-stream');
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);`;
if (e.includes(oldE)) { e = e.replace(oldE, newE, 1); fs.writeFileSync('/root/创作助手/src/export/export.ts', e); console.log('OK export.ts'); } else { console.log('WARN export.ts'); }
console.log('完成');