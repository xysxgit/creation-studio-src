import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ A) styles.css: Q弹动效取消 + 选中色 + 手柄 + zoom-ctrl + 图片横屏 ============
let s = fs.readFileSync('/root/创作助手/src/styles.css', 'utf8');

// A1 弹性曲线 → 标准缓动
let c = 0;
for (const [a, b] of [
  ['--spring: cubic-bezier(0.34, 1.56, 0.64, 1);', '--spring: cubic-bezier(0.25, 0.1, 0.25, 1);'],
  ['--spring-soft: cubic-bezier(0.22, 0.8, 0.36, 1);', '--spring-soft: cubic-bezier(0.25, 0.1, 0.25, 1);'],
  ['--spring-pop: cubic-bezier(0.34, 1.56, 0.64, 1);', '--spring-pop: cubic-bezier(0.25, 0.1, 0.25, 1);'],
  ['--spring-slide: cubic-bezier(0.22, 1, 0.36, 1);', '--spring-slide: cubic-bezier(0.25, 0.1, 0.25, 1);'],
]) { if (s.includes(a)) { s = s.replace(a, b); c++; } }
ok(`弹性曲线改标准缓动 ${c}/4`);

// A2 卡片生成/弹窗/toast 动画改淡入（无回弹）
const oldCardNew = `.card-new {
  animation: qq-card-pop 0.28s var(--spring-pop);
  transform-origin: 50% 50%;
}`;
const newCardNew = `.card-new {
  animation: popIn 0.22s ease-out;
  transform-origin: 50% 50%;
}`;
if (s.includes(oldCardNew)) { s = s.replace(oldCardNew, newCardNew, 1); ok('card-new 淡入'); } else bad('card-new');

const oldPopAnim = `  animation-name: qq-pop;
  animation-duration: 0.24s;
  animation-timing-function: var(--spring-pop);`;
const newPopAnim = `  animation: popIn 0.18s ease-out;`;
if (s.includes(oldPopAnim)) { s = s.replace(oldPopAnim, newPopAnim, 1); ok('弹窗淡入'); } else bad('弹窗');

const oldToast = `.toast {
  animation: qq-toast 0.3s var(--spring-pop);
}`;
const newToast = `.toast {
  animation: toastIn 0.24s ease-out;
}
@keyframes toastIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}`;
if (s.includes(oldToast)) { s = s.replace(oldToast, newToast, 1); ok('toast 淡入'); } else bad('toast');

// A3 按钮 transform 过渡用 ease
const oldBtnTr = `    transform 0.22s var(--spring-pop),
    box-shadow 0.22s var(--spring-pop),`;
const newBtnTr = `    transform 0.18s ease,
    box-shadow 0.18s ease,`;
if (s.includes(oldBtnTr)) { s = s.replace(oldBtnTr, newBtnTr, 1); ok('按钮过渡 ease'); } else bad('按钮过渡');

// A4 选中框显示目标颜色
const oldSel = `.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 10px 24px rgba(20, 24, 40, 0.22), 0 4px 12px rgba(20, 24, 40, 0.14);
}`;
const newSel = `.card.selected {
  border-color: var(--sel-color, var(--accent));
  box-shadow: 0 0 0 2px var(--sel-color, var(--accent)), 0 0 0 5px color-mix(in srgb, var(--sel-color, var(--accent)) 22%, transparent), 0 10px 24px rgba(20, 24, 40, 0.22), 0 4px 12px rgba(20, 24, 40, 0.14);
}`;
if (s.includes(oldSel)) { s = s.replace(oldSel, newSel, 1); ok('选中框颜色'); } else bad('选中框颜色');

// A5 连线选中：保持原色 + 光晕（JS侧改色，这里补光晕）
s = s.replace('.edge-path.selected', '.edge-path.selected').replace('.edge-path {\n  transition', '.edge-path {\n  transition'); // 占位
const edgeGlow = `.edges-svg .edge-path.selected {
  filter: drop-shadow(0 0 3px color-mix(in srgb, currentColor 80%, transparent));
}
`;
if (!s.includes('.edge-path.selected { filter')) { s = s.replace('.edge-path {', edgeGlow + '.edge-path {', 1); ok('连线选中光晕'); } else bad('连线光晕');

// A6 手柄/锚点加大（JS侧改尺寸，CSS加 hover 光标提示）
const rhCss = `.rh { position: absolute; background: #fff; border: 2px solid var(--sel-color, var(--accent)); border-radius: 4px; z-index: 6; cursor: nwse-resize; box-sizing: border-box; }
.rh-r { cursor: ew-resize; } .rh-l { cursor: ew-resize; } .rh-t { cursor: ns-resize; } .rh-b { cursor: ns-resize; }
.rh-nw { cursor: nwse-resize; } .rh-se { cursor: nwse-resize; } .rh-ne { cursor: nesw-resize; } .rh-sw { cursor: nesw-resize; }
`;
if (!s.includes('.rh {')) { s = s.replace('.card.selected', rhCss + '.card.selected', 1); ok('手柄 CSS'); } else bad('手柄CSS');

// A7 zoom-ctrl 往左移 3cm
const oldZc = `.zoom-ctrl {
  position: absolute;
  right: 12px;
  bottom: 12px;`;
const newZc = `.zoom-ctrl {
  position: absolute;
  right: calc(12px + 3cm);
  bottom: 12px;`;
if (s.includes(oldZc)) { s = s.replace(oldZc, newZc, 1); ok('zoom-ctrl 左移3cm'); } else bad('zoom-ctrl');

// A8 图片编辑横屏适配
const imgLs = `/* 图片编辑横屏适配 */
@media (orientation: landscape) {
  .fe-image-body .image-edit-preview { max-width: 70vw; max-height: calc(100vh - 190px); }
  .image-edit-preview img { max-height: calc(100vh - 210px); width: auto; }
}
`;
if (!s.includes('图片编辑横屏适配')) { s = s.replace('.image-edit-preview', imgLs + '.image-edit-preview', 1); ok('图片横屏适配'); } else bad('图片横屏');

fs.writeFileSync('/root/创作助手/src/styles.css', s);

// ============ B) CardView.tsx: accent含编组色 + --sel-color + 手柄锚点加大 + 拖连线悬浮 ============
let cv = fs.readFileSync('/root/创作助手/src/components/CardView.tsx', 'utf8');
const oldAccent = `  const accent = card.color || sectionColor || section?.color || '#b2bec3';`;
const newAccent = `  const groupColor = card.groupId ? useStudio.getState().groups[card.groupId]?.color : undefined;
  const accent = card.color || groupColor || sectionColor || section?.color || '#b2bec3';`;
if (cv.includes(oldAccent)) { cv = cv.replace(oldAccent, newAccent, 1); ok('accent 含编组色'); } else bad('accent');

// --sel-color 注入 style
const oldStyle = `        ['--inv-zoom' as string]: String(1 / zoom),`;
const newStyle = `        ['--inv-zoom' as string]: String(1 / zoom),
        ['--sel-color' as string]: accent,`;
if (cv.includes(oldStyle)) { cv = cv.replace(oldStyle, newStyle, 1); ok('--sel-color'); } else bad('--sel-color');

// 手柄/锚点加大
cv = cv.replace(`  const hs = 14 / zoom; // 手柄屏幕尺寸恒定`, `  const hs = 20 / zoom; // 手柄屏幕尺寸恒定`);
cv = cv.replace(`  const as = 16 / zoom; // 锚点屏幕尺寸恒定`, `  const as = 23 / zoom; // 锚点屏幕尺寸恒定`);
ok('手柄/锚点加大');

// Props 加 connectFrom
cv = cv.replace(`  edgeTarget?: boolean;
  zoom: number;`, `  edgeTarget?: boolean;
  connectFrom?: string | null;
  zoom: number;`, 1);
cv = cv.replace(`onEnsureVisible, edgeTarget = false }: Props) {`, `onEnsureVisible, edgeTarget = false, connectFrom = null }: Props) {`, 1);
// className 加 connect-dragging
cv = cv.replace(`\${card.preview ? 'preview-mode' : ''}\`}`, `\${card.preview ? 'preview-mode' : ''} \${connectFrom === card.id ? 'connect-dragging' : ''}\`}`, 1);
// memo 比较加 connectFrom 和 groupId
cv = cv.replace(`    a.zoom === b.zoom
  );`, `    a.zoom === b.zoom &&
    a.connectFrom === b.connectFrom &&
    ac.groupId === bc.groupId
  );`, 1);
fs.writeFileSync('/root/创作助手/src/components/CardView.tsx', cv);
ok('CardView 拖连线悬浮 + memo');

// ============ C) CanvasBoard.tsx: 传 connectFrom ============
let cb = fs.readFileSync('/root/创作助手/src/components/CanvasBoard.tsx', 'utf8');
const oldProps = `              edgeTarget={isEdgeTarget}
            />`;
const newProps = `              edgeTarget={isEdgeTarget}
              connectFrom={tempEdge && !tempEdge.branch ? tempEdge.from : null}
            />`;
if (cb.includes(oldProps)) { cb = cb.replace(oldProps, newProps, 1); fs.writeFileSync('/root/创作助手/src/components/CanvasBoard.tsx', cb); ok('CanvasBoard connectFrom'); } else bad('CanvasBoard connectFrom');

// ============ D) EdgesLayer.tsx: 连线选中保持原色 + 加粗 ============
let el = fs.readFileSync('/root/创作助手/src/components/EdgesLayer.tsx', 'utf8');
const oldColor = `              const color = sel ? '#6c5ce7' : e.color || '#8e8ea0';`;
const newColor = `              const color = e.color || '#8e8ea0';`;
if (el.includes(oldColor)) { el = el.replace(oldColor, newColor, 1); ok('连线选中保持原色'); } else bad('连线原色');
const oldW = `                  strokeWidth={strokeW(e)}`;
const newW = `                  strokeWidth={strokeW(e) * (sel ? 1.7 : 1)}`;
if (el.includes(oldW)) { el = el.replace(oldW, newW, 1); fs.writeFileSync('/root/创作助手/src/components/EdgesLayer.tsx', el); ok('连线选中加粗'); } else bad('连线加粗');

// ============ E) Modals.tsx: 图片预览横屏更大 ============
let m = fs.readFileSync('/root/创作助手/src/components/Modals.tsx', 'utf8');
const oldImgPrev = `          <img src={imgSrc} alt="画布预览" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, border: '1px solid var(--border)' }} />`;
const newImgPrev = `          <img src={imgSrc} alt="画布预览" style={{ maxWidth: '100%', maxHeight: 'min(48vh, 520px)', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />`;
if (m.includes(oldImgPrev)) { m = m.replace(oldImgPrev, newImgPrev, 1); fs.writeFileSync('/root/创作助手/src/components/Modals.tsx', m); ok('图片预览横屏适配'); } else bad('图片预览');

console.log('前端完成');