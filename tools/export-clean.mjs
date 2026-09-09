import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ 1) export.ts: EPUB 改用 downloadBlob（App 内走原生保存对话框） ============
let e = fs.readFileSync('/root/创作助手/src/export/export.ts', 'utf8');
const oldEpub = `  const blob = makeZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = \`\${safe}.epub\`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}`;
const newEpub = `  const blob = makeZip(files);
  downloadBlob(blob, \`\${safe}.epub\`);
}`;
if (e.includes(oldEpub)) { e = e.replace(oldEpub, newEpub, 1); ok('EPUB 走 downloadBlob'); } else bad('EPUB 尾部定位');

// 处理网页版 EPUB 下载：downloadBlob 已有 a.click() 逻辑，无需额外处理
fs.writeFileSync('/root/创作助手/src/export/export.ts', e);

// ============ 2) Modals.tsx: 导出/导入界面精简（删 MD/HTML/Word/TXT，保留图片 + 项目 JSON） ============
let m = fs.readFileSync('/root/创作助手/src/components/Modals.tsx', 'utf8');
const oldGrid = `        <h4>📤 导出当前项目</h4>
        <p className="hint">导出前会先展示内容预览，并支持选择保存位置；确认后开始下载。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => setPending('md')}>📝 Markdown</button>
          <button className="btn" onClick={() => setPending('html')}>🌐 HTML</button>
          <button className="btn" onClick={() => setPending('doc')}>📄 Word (.doc)</button>
          <button className="btn" onClick={() => setPending('txt')}>📃 纯文本</button>
          <button className="btn" onClick={() => setPending('image')}>🖼 画布 8K 图片</button>
        </div>
      </div>`;
const newGrid = `        <h4>📤 导出</h4>
        <p className="hint">导出前会先展示内容预览，并弹出系统「选择保存位置」对话框；确认后保存。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => setPending('image')}>🖼 画布 8K 图片</button>
          <button className="btn" onClick={() => setPending('json')}>💾 保存项目 JSON</button>
        </div>
      </div>`;
if (m.includes(oldGrid)) { m = m.replace(oldGrid, newGrid, 1); ok('导出界面精简'); } else bad('导出界面定位');

// 项目备份区：去掉重复的"保存项目JSON"按钮（已合并到导出区），保留"读取"
const oldBackup = `      <div className="modal-sec">
        <h4>💾 项目备份 / 读取</h4>
        <p className="hint">项目级 JSON 备份可完整保留分区、卡片、连线与页面结构，用于迁移或恢复。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => setPending('json')}>💾 保存项目 JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>📂 读取项目 JSON</button>
        </div>
      </div>`;
const newBackup = `      <div className="modal-sec">
        <h4>📂 项目读取</h4>
        <p className="hint">读取项目 JSON 备份，完整恢复分区、卡片、连线与页面结构（迁移 / 恢复用）。</p>
        <div className="btn-grid">
          <button className="btn" onClick={() => fileRef.current?.click()}>📂 读取项目 JSON</button>
        </div>
      </div>`;
if (m.includes(oldBackup)) { m = m.replace(oldBackup, newBackup, 1); ok('项目备份区精简'); } else bad('项目备份区定位');

fs.writeFileSync('/root/创作助手/src/components/Modals.tsx', m);
console.log('完成');