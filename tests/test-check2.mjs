import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
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
const cA = await page.locator('.card >> nth=0').boundingBox();
await page.mouse.click(cA.x + cA.width / 2, cA.y + 60, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('复制'))?.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')];
  const c = cs.find((x) => x.style.left !== '400px');
  if (c) { const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: r.x + r.width / 2, clientY: r.y + 60 })); }
});
const c2Top = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')];
  const c = cs.find((x) => x.style.left !== '400px');
  const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 60 };
});
await page.mouse.move(c2Top.x, c2Top.y);
await page.mouse.down();
await page.mouse.move(box.x + 950, box.y + 420, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
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
// 打开连线菜单
await page.evaluate(() => {
  const btn = document.querySelector('.edge-mid');
  if (btn) { const r = btn.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, clientX: x, clientY: y }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11, clientX: x, clientY: y })); }
});
await page.waitForTimeout(300);
// 选择中部的色块（非第一/非默认），验证颜色可见+√
await page.evaluate(() => {
  const b = document.querySelectorAll('.ctx-menu .palette-row button')[5]; // 紫 rgb(108,92,231)
  if (b) b.click();
});
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const on = document.querySelector('.ctx-menu .palette-row button.on');
  if (!on) return null;
  const cs = getComputedStyle(on);
  const p = getComputedStyle(on, '::after');
  const r = on.getBoundingClientRect();
  return {
    bg: cs.backgroundColor,
    border: cs.borderColor,
    shadow: cs.boxShadow.slice(0, 60),
    afterBg: p.backgroundColor, afterPos: p.position, afterH: p.height,
    w: Math.round(r.width), h: Math.round(r.height),
  };
});
console.log('选中块:', JSON.stringify(info, null, 1));
const ok = info && info.bg === 'rgb(108, 92, 231)' && info.afterPos === 'absolute' && info.afterBg === 'rgb(108, 92, 231)' && parseFloat(info.afterH) > 0;
console.log('颜色完整可见(背景=所选紫):', info && info.bg === 'rgb(108, 92, 231)' ? '✅' : '❌');
console.log('紫色底部指示条(参考zc-tool):', ok ? '✅' : '❌');
await browser.close();
process.exit(0);