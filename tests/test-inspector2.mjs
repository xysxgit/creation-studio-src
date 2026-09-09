import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(500);

// 建卡：双击1张 → 选中 → 右键复制第2张
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 300, box.y + 200);
await page.waitForTimeout(700);
await page.mouse.click(box.x + 300, box.y + 200);
await page.waitForTimeout(400);
// 右键复制
const c0 = await page.locator('.card >> nth=0').boundingBox();
await page.mouse.click(c0.x + c0.width / 2, c0.y + 60, { button: 'right' });
await page.waitForTimeout(300);
const hasCopy = await page.locator('.ctx-menu button:has-text("复制")').count();
console.log('右键菜单有复制:', hasCopy > 0 ? '✅' : '❌');
if (hasCopy > 0) {
  await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('复制')).click(); });
  await page.waitForTimeout(500);
}
const cardCount = await page.locator('.card').count();
console.log('卡片数:', cardCount, cardCount >= 2 ? '✅' : '❌');
// 若重叠，拖开第二张
if (cardCount >= 2) {
  const cc = await page.locator('.card').all();
  const b0 = await cc[0].boundingBox();
  const b1 = await cc[1].boundingBox();
  if (Math.abs(b0.x - b1.x) < 40 && Math.abs(b0.y - b1.y) < 40) {
    await page.mouse.move(b1.x + 80, b1.y + 120);
    await page.mouse.down();
    await page.mouse.move(b1.x + 500, b1.y + 180, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
}

// ===== 1) 检查器无样式功能 =====
await page.click('.card >> nth=0');
await page.waitForTimeout(400);
// 打开检查器tab（右侧）
const inspText = await page.locator('.inspector').textContent().catch(() => '');
console.log('卡片检查器无「样式」:', inspText.includes('样式') ? '❌ 还在' : '✅');
console.log('卡片检查器无「圆角」:', inspText.includes('圆角') ? '❌ 还在' : '✅');

// ===== 2) palette 色块方块 + 3) 选中态 accent =====
const paletteCss = await page.evaluate(() => {
  const btn = document.querySelector('.palette button');
  if (!btn) return null;
  const cs = getComputedStyle(btn);
  return { radius: cs.borderRadius };
});
console.log('palette色块圆角:', paletteCss ? paletteCss.radius : '无palette', paletteCss && paletteCss.radius === '2px' ? '✅ 方块' : '❌');

// ===== 连线：拖拽锚点 =====
await page.evaluate(() => {
  // 找到卡片锚点（.handle），从卡1拖到卡2
});
await page.locator('.card >> nth=0').click();
await page.waitForTimeout(300);
const handles = await page.locator('.card >> nth=0').locator('.anchor').count();
console.log('卡1锚点数:', handles, handles >= 4 ? '✅' : '❌');
// 拖动卡1右侧锚点到卡2
const c1 = await page.locator('.card >> nth=0').boundingBox();
const c2 = await page.locator('.card >> nth=1').boundingBox();
if (c1 && c2) {
  await page.mouse.move(c1.x + c1.width, c1.y + c1.height / 2);
  await page.mouse.down();
  await page.mouse.move(c2.x + 20, c2.y + c2.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const edgeCount = await page.locator('.edge-path').count();
console.log('连线数:', edgeCount, edgeCount > 0 ? '✅' : '❌');

// 选中连线 → 目标卡高亮（交互层用 pointerdown 选中）
if (edgeCount > 0) {
  await page.evaluate(() => {
    const hit = document.querySelector('.edge-hit-path');
    if (hit) hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
  });
  await page.waitForTimeout(400);
  const targetHl = await page.evaluate(() => document.querySelectorAll('.card.edge-target-selected').length);
  console.log('链接目标选中高亮:', targetHl > 0 ? '✅ ' + targetHl + ' 张' : '❌');
  // 连线检查器保留颜色 + palette 方块 + 选中态非白
  const edgeInsp = await page.locator('.inspector').textContent().catch(() => '');
  console.log('连线检查器保留设置:', edgeInsp.includes('连线设置') ? '✅' : '❌');
  const pCss = await page.evaluate(() => {
    const btn = document.querySelector('.palette button');
    if (!btn) return null;
    return { radius: getComputedStyle(btn).borderRadius };
  });
  console.log('连线palette圆角:', pCss ? pCss.radius : '无', pCss && pCss.radius === '2px' ? '✅ 方块' : '❌');
  // 选中态边框 accent（非白）
  const onCss = await page.evaluate(() => {
    const on = document.querySelector('.palette button.on');
    if (!on) return null;
    return getComputedStyle(on).borderColor;
  });
  console.log('palette选中态边框:', onCss || '无选中', onCss && onCss !== 'rgb(255, 255, 255)' ? '✅ 非白' : '❌');
}

// ===== 多选无批量样式 =====
await page.evaluate(() => {
  document.querySelectorAll('.card')[0]?.click();
});
await page.waitForTimeout(200);
await page.keyboard.down('Shift');
await page.evaluate(() => {
  document.querySelectorAll('.card')[1]?.click();
});
await page.keyboard.up('Shift');
await page.waitForTimeout(400);
const multiText = await page.locator('.inspector').textContent().catch(() => '');
console.log('多选检查器无「批量样式」:', multiText.includes('批量样式') ? '❌ 还在' : '✅');

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);