import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ 1) types.ts: Card 增加 fontSize ============
let ty = fs.readFileSync('/root/创作助手/src/types.ts', 'utf8');
const oldCard = `  /** 卡片圆角：sm=小圆角 / md=默认 / lg=大圆角 */`;
const newCard = `  /** 卡片正文字号（px，默认 14；仅便签/正文卡显示用，不受画布缩放影响） */\n  fontSize?: number;\n  /** 卡片圆角：sm=小圆角 / md=默认 / lg=大圆角 */`;
if (ty.includes(oldCard)) { ty = ty.replace(oldCard, newCard, 1); fs.writeFileSync('/root/创作助手/src/types.ts', ty); ok('Card.fontSize'); } else bad('Card.fontSize');

// ============ 2) RightPanel.tsx: 外观组（字号设置） ============
let rp = fs.readFileSync('/root/创作助手/src/components/RightPanel.tsx', 'utf8');
// openGroups 初始加 appearance
const oldOpen = `  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    basic: true,
    appearance: true,
    behavior: true,
    actions: true,
  });`;
if (rp.includes(oldOpen)) ok('appearance 已在初始'); else {
  const o = `  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({\n    basic: true,\n    behavior: true,\n    actions: true,\n  });`;
  const n = `  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({\n    basic: true,\n    appearance: true,\n    behavior: true,\n    actions: true,\n  });`;
  if (rp.includes(o)) { rp = rp.replace(o, n, 1); ok('appearance 组开关'); } else bad('openGroups');
}
// behavior 组后加 appearance 组
const oldBehavior = `          <Group k="behavior" icon="⚙️" title="行为">
            <label className="fld row">
              <span>折叠内容</span>
              <input type="checkbox" checked={!!card.collapsed} onChange={(e) => s().updateCard(card.id, { collapsed: e.target.checked })} />
            </label>
            <label className="fld row">
              <span>锁定卡片</span>
              <input type="checkbox" checked={!!card.locked} onChange={(e) => s().updateCard(card.id, { locked: e.target.checked })} />
            </label>
          </Group>`;
const newBehavior = `          <Group k="appearance" icon="🎨" title="外观">
            <div className="fld">
              <span>正文字号</span>
              <input type="range" min={11} max={26} step={1} value={card.fontSize ?? 14}
                onChange={(e) => s().updateCard(card.id, { fontSize: Number(e.target.value) })} />
              <em className="edge-w-val">{(card.fontSize ?? 14)}px</em>
            </div>
            <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>卡片上的正文按此字号显示，画布缩放时保持屏幕大小不变；富文本里单独设置的文字字号/字体会原样同步显示。</p>
          </Group>

          <Group k="behavior" icon="⚙️" title="行为">
            <label className="fld row">
              <span>折叠内容</span>
              <input type="checkbox" checked={!!card.collapsed} onChange={(e) => s().updateCard(card.id, { collapsed: e.target.checked })} />
            </label>
            <label className="fld row">
              <span>锁定卡片</span>
              <input type="checkbox" checked={!!card.locked} onChange={(e) => s().updateCard(card.id, { locked: e.target.checked })} />
            </label>
          </Group>`;
if (rp.includes(oldBehavior)) { rp = rp.replace(oldBehavior, newBehavior, 1); fs.writeFileSync('/root/创作助手/src/components/RightPanel.tsx', rp); ok('检查器字号设置'); } else bad('检查器字号设置');

// ============ 3) CardView.tsx: 卡片正文反缩放字号 ============
let cv = fs.readFileSync('/root/创作助手/src/components/CardView.tsx', 'utf8');
// 加计算：在 titleFontSize 后
const oldTfs = `  const titleFontSize = Math.max(10, Math.min(13.5, (card.w - 56) / Math.max((card.title || '').length, 4)));`;
const newTfs = `  const titleFontSize = Math.max(10, Math.min(13.5, (card.w - 56) / Math.max((card.title || '').length, 4)));
  // 卡片正文字号：用户设置值反缩放（÷zoom），画布缩放时屏幕大小恒定
  const bodyFontSize = (card.fontSize ?? 14) / zoom;`;
if (cv.includes(oldTfs)) { cv = cv.replace(oldTfs, newTfs, 1); ok('CardView bodyFontSize'); } else bad('CardView bodyFontSize');

// 预览模式 rich-static
const oldPrev = `              <div className="rich-static" dangerouslySetInnerHTML={{ __html: html }} />`;
const newPrev = `              <div className="rich-static" style={{ fontSize: \`\${bodyFontSize}px\` }} dangerouslySetInnerHTML={{ __html: html }} />`;
if (cv.includes(oldPrev)) { cv = cv.replace(oldPrev, newPrev, 1); ok('preview 字号'); } else bad('preview 字号');

// 普通正文 rich-static
const oldBody = `            <div className="rich-static" dangerouslySetInnerHTML={{ __html: html }} />`;
const newBody = `            <div className="rich-static" style={{ fontSize: \`\${bodyFontSize}px\` }} dangerouslySetInnerHTML={{ __html: html }} />`;
if (cv.includes(oldBody)) { cv = cv.replace(oldBody, newBody, 1); ok('正文 字号'); } else bad('正文 字号');

// 空卡片提示
const oldEmpty = `            <div className="rich-static rich-empty" title="双击写正文">`;
const newEmpty = `            <div className="rich-static rich-empty" style={{ fontSize: \`\${bodyFontSize}px\` }} title="双击写正文">`;
if (cv.includes(oldEmpty)) { cv = cv.replace(oldEmpty, newEmpty, 1); ok('空卡提示 字号'); } else bad('空卡提示 字号');

fs.writeFileSync('/root/创作助手/src/components/CardView.tsx', cv);

// ============ 4) styles.css: wm-editor 滚动修复 ============
let s = fs.readFileSync('/root/创作助手/src/styles.css', 'utf8');
const oldWm = `.fe-body.paper-body,
.wm-editor.paper-body {
  display: flex;
  padding: 10px 14px 20px;
}`;
const newWm = `.fe-body.paper-body,
.wm-editor.paper-body {
  display: flex;
  padding: 10px 14px 20px;
}
/* 正文创作纸张区域：撑满剩余高度，内容超出时由 .paper-stage 滚动 */
.wm-editor.paper-body {
  flex: 1;
  min-height: 0;
}`;
if (s.includes(oldWm)) { s = s.replace(oldWm, newWm, 1); ok('wm-editor 滚动修复'); } else bad('wm-editor');
fs.writeFileSync('/root/创作助手/src/styles.css', s);
console.log('完成');