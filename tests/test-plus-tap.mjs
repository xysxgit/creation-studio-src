import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
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
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300);
await page.waitForTimeout(700);

// 复制第2张卡
const cA = await page.locator('.card >> nth=0').boundingBox();
await page.mouse.click(cA.x + cA.width / 2, cA.y + 60, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('复制'))?.click(); });
await page.waitForTimeout(600);
const cards = await page.locator('.card').all();
console.log('卡片数:', cards.length);

// 先把卡2拖到空白（复制卡与卡1重叠，会挡住拖线起点）
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')];
  const c = cs.find((x) => x.style.left !== '400px');
  if (c) {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: r.x + r.width / 2, clientY: r.y + 60 }));
  }
});
const c2Top = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')];
  const c = cs.find((x) => x.style.left !== '400px');
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + 60 };
});
await page.mouse.move(c2Top.x, c2Top.y);
await page.mouse.down();
await page.mouse.move(box.x + 950, box.y + 420, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);

// 连线（拖线）
if (cards.length >= 2) {
  const b0 = await page.locator('.card >> nth=0').boundingBox();
  const b1 = await page.locator('.card >> nth=1').boundingBox();
  await page.evaluate(() => {
    const c = document.querySelectorAll('.card')[0];
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
  });
  await page.waitForTimeout(300);
  await page.mouse.move(b0.x + b0.width, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + 20, b1.y + b1.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const midBtn = await page.locator('.edge-mid').count();
console.log('连线中段+按钮:', midBtn > 0 ? '✅' : '❌');

// ===== 修复1验证：点+按钮 → 立即点空白（触屏tap）→ 不新建卡片 =====
const before = await page.locator('.card').count();
// 触屏点+按钮（pointerdown+up，模拟tap）
await page.evaluate(() => {
  const btn = document.querySelector('.edge-mid');
  if (btn) {
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: x, clientY: y, isPrimary: true }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: x, clientY: y, isPrimary: true }));
  }
});
await page.waitForTimeout(150);
// 紧接点空白（触屏tap）——修复前会被误判为双击新建
await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-wrap');
  const r = wrap.getBoundingClientRect();
  const x = r.left + 250, y = r.top + 400;
  wrap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 10, clientX: x, clientY: y, isPrimary: true }));
  wrap.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 10, clientX: x, clientY: y, isPrimary: true }));
});
await page.waitForTimeout(600);
const after = await page.locator('.card').count();
console.log('点+后点空白 卡片数:', before, '→', after, after === before ? '✅ 未误新建' : '❌ 误新建了!');

// ===== 修复2验证：连线色块选中态有放大效果 =====
await page.evaluate(() => {
  const btn = document.querySelector('.edge-mid');
  if (btn) {
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, clientX: x, clientY: y }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, clientX: x, clientY: y }));
  }
});
await page.waitForTimeout(300);
const menuTxt = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('+点击弹连线设置:', menuTxt.includes('连线颜色') ? '✅' : '❌');
// 点一个色块 → 检查 .on 的 transform
await page.evaluate(() => {
  const b = document.querySelector('.ctx-menu .palette-row button:not(.on)');
  if (b) b.click();
});
await page.waitForTimeout(300);
const onStyle = await page.evaluate(() => {
  const on = document.querySelector('.ctx-menu .palette-row button.on');
  if (!on) return null;
  const cs = getComputedStyle(on);
  return { transform: cs.transform, shadow: cs.boxShadow.slice(0, 100) };
});
console.log('选中色块样式:', JSON.stringify(onStyle));
const scaled = onStyle && onStyle.shadow && onStyle.shadow.includes('rgb(108, 92, 231)');
console.log('选中态accent外框:', scaled ? '✅' : '❌');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);