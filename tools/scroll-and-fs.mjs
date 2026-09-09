import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ 1) styles.css: 悬浮栏向上移3cm + 富文本滚动修复 ============
let s = fs.readFileSync('/root/创作助手/src/styles.css', 'utf8');

// 1a 悬浮栏：向上移 3cm（right 恢复 12px）
const oldZc = `  right: calc(12px + 3cm);
  bottom: 12px;`;
const newZc = `  right: 12px;
  bottom: calc(12px + 3cm);`;
if (s.includes(oldZc)) { s = s.replace(oldZc, newZc, 1); ok('悬浮栏向上移3cm'); } else bad('悬浮栏上移');

// 1b paper-sheet：高度填满编辑区（内部滚动），min-height 60vh
const oldSheet = `.paper-sheet {
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
const newSheet = `.paper-sheet {
  /* 纸张高度固定为编辑区可视高度：正文在 .rich-scroll 内部滚动，
     工具栏固定在顶部不被顶走；min-height 保证小屏下初始高度 */
  width: min(96%, 860px);
  height: 100%;
  min-height: 60vh;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
  overflow: visible;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}`;
if (s.includes(oldSheet)) { s = s.replace(oldSheet, newSheet, 1); ok('paper-sheet 内部滚动'); } else bad('paper-sheet');

// 1c rich-editor 高度 100%
const oldRe = `.paper-sheet .rich-editor {
  width: 100%;
  height: auto;
  min-height: 100%;
  border: none;
  box-shadow: none;
  border-radius: 0;
}`;
const newRe = `.paper-sheet .rich-editor {
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: none;
  box-shadow: none;
  border-radius: 0;
}`;
if (s.includes(oldRe)) { s = s.replace(oldRe, newRe, 1); ok('rich-editor 100%'); } else bad('rich-editor');

// 1d rich-scroll 补齐 min-height:0 让 flex 滚动生效
const oldRs = `.rich-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }`;
const newRs = `.rich-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }`;
if (s.includes(oldRs)) { s = s.replace(oldRs, newRs, 1); ok('rich-scroll min-height'); } else bad('rich-scroll');

fs.writeFileSync('/root/创作助手/src/styles.css', s);

// ============ 2) RightPanel.tsx: 字号 slider → 常用字号按钮组 ============
let rp = fs.readFileSync('/root/创作助手/src/components/RightPanel.tsx', 'utf8');
const oldFs = `            <div className="fld">
              <span>正文字号</span>
              <input type="range" min={11} max={26} step={1} value={card.fontSize ?? 14}
                onChange={(e) => s().updateCard(card.id, { fontSize: Number(e.target.value) })} />
              <em className="edge-w-val">{(card.fontSize ?? 14)}px</em>
            </div>`;
const newFs = `            <div className="fld">
              <span>正文字号</span>
              <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                {[12, 13, 14, 16, 18, 20, 24].map((fs) => (
                  <button
                    key={fs}
                    className={'btn small ' + ((card.fontSize ?? 14) === fs ? 'active' : '')}
                    style={{ fontSize: fs === 24 ? 13 : 12, minWidth: 34 }}
                    onClick={() => s().updateCard(card.id, { fontSize: fs })}
                  >
                    {fs}
                  </button>
                ))}
              </div>
              <em className="edge-w-val">当前 {(card.fontSize ?? 14)}px</em>
            </div>`;
if (rp.includes(oldFs)) { rp = rp.replace(oldFs, newFs, 1); fs.writeFileSync('/root/创作助手/src/components/RightPanel.tsx', rp); ok('字号改常用按钮组'); } else bad('字号按钮组');

console.log('完成');