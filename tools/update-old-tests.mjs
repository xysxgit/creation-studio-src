import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ test-export-flow: Markdown → 保存项目 JSON ============
let f = fs.readFileSync('/root/创作助手/tests/test-export-flow.mjs', 'utf8');
f = f.replace(`await page.click('.modal button:has-text("Markdown")');`, `await page.click('.modal button:has-text("保存项目 JSON")');`, 1);
if (f.includes('保存项目 JSON')) ok('export-flow 按钮'); else bad('export-flow 按钮');
fs.writeFileSync('/root/创作助手/tests/test-export-flow.mjs', f);

// ============ test-swatch-zc: MD 预览段 → JSON 预览段 ============
let s = fs.readFileSync('/root/创作助手/tests/test-swatch-zc.mjs', 'utf8');
const oldMd = `// ===== 2) MD 导出预览渲染（iframe 效果） =====
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('.modal button:has-text("Markdown")');
await page.waitForTimeout(1200);
const preview = await page.evaluate(() => {
  const frame = document.querySelector('.modal iframe');
  if (!frame) return '无iframe';
  const doc = frame.contentDocument;
  return { hasH1: !!doc.querySelector('h1'), h1text: doc.querySelector('h1')?.textContent, hasHR: !!doc.querySelector('hr'), bodyBg: doc.body ? getComputedStyle(doc.body).backgroundColor : '' };
});
console.log('=== MD 预览渲染 ===');
console.log(JSON.stringify(preview, null, 1));
console.log(preview.hasH1 && preview.h1text.includes('小说') ? '✅ iframe渲染Markdown效果' : '❌');
await page.screenshot({ path: '/root/创作助手/tools/shot-preview.png' });`;
const newMd = `// ===== 2) JSON 导出预览渲染（pre 显示项目内容） =====
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('.modal button:has-text("保存项目 JSON")');
await page.waitForTimeout(1200);
const preview = await page.evaluate(() => {
  const pre = document.querySelector('.modal pre');
  if (!pre) return '无pre';
  const t = pre.textContent || '';
  return { hasMeta: t.includes('"meta"'), hasCards: t.includes('"cards"'), hasSections: t.includes('"sections"'), len: t.length };
});
console.log('=== JSON 预览渲染 ===');
console.log(JSON.stringify(preview, null, 1));
console.log(preview.hasMeta && preview.hasCards && preview.hasSections ? '✅ JSON预览含完整项目结构' : '❌');
await page.screenshot({ path: '/root/创作助手/tools/shot-preview.png' });`;
if (s.includes(oldMd)) { s = s.replace(oldMd, newMd, 1); fs.writeFileSync('/root/创作助手/tests/test-swatch-zc.mjs', s); ok('swatch-zc 改 JSON 预览'); } else bad('swatch-zc MD段定位');
console.log('完成');