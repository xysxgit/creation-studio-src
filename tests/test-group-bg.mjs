import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
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
// 建两张卡（不重叠）
await page.mouse.dblclick(box.x + 400, box.y + 300);
await page.waitForTimeout(700);
// 复制卡2并拖到空白
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
const n0 = await page.locator('.card').count();
console.log('卡片数:', n0);
// 点选卡1 + shift点选卡2（多选）
await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.card')];
  const tap = (c, shift) => {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 60, clientX: r.x + r.width / 2, clientY: r.y + 60, shiftKey: shift, pointerType: 'mouse' }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 60, clientX: r.x + r.width / 2, clientY: r.y + 60, shiftKey: shift, pointerType: 'mouse' }));
  };
  tap(cs[0], false);
  tap(cs[1], true);
});
await page.waitForTimeout(400);
const selN = await page.evaluate(() => {
  const c = document.querySelectorAll('.card.selected');
  return c.length;
});
console.log('多选选中卡数:', selN);
// 右键卡2 → 编组所选卡片
const b1 = await page.locator('.card >> nth=1').boundingBox();
await page.mouse.click(b1.x + b1.width / 2, b1.y + 60, { button: 'right' });
await page.waitForTimeout(300);
const menuTxt = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('菜单含编组:', menuTxt.includes('编组所选卡片') ? '✅' : '❌ ' + menuTxt.slice(0, 60));
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('编组所选卡片'))?.click(); });
await page.waitForTimeout(600);
const gname = await page.locator('.group-name').count();
console.log('分组头出现:', gname > 0 ? '✅' : '❌');
// 右键 group-name → 组颜色 → 点紫色
await page.evaluate(() => {
  const g = document.querySelector('.group-name');
  if (g) { const r = g.getBoundingClientRect();
    g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 30, clientX: r.x + 20, clientY: r.y + 8 }));
    g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 30, clientX: r.x + 20, clientY: r.y + 8 }));
    g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 20, clientY: r.y + 8 })); }
});
await page.waitForTimeout(400);
const gMenu = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('分组菜单:', gMenu.slice(0, 40));
// 点紫色块（rgb(108,92,231)）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.ctx-menu .palette-row button')];
  const purple = btns.find((b) => (b.getAttribute('style') || '').includes('108, 92, 231'));
  if (purple) purple.click();
});
await page.waitForTimeout(400);
const gnameBg = await page.evaluate(() => {
  const g = document.querySelector('.group-name');
  if (!g) return null;
  return getComputedStyle(g).backgroundColor;
});
console.log('分组头背景(设紫后):', gnameBg);
// 点「选中组内全部」
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.ctx-menu button')];
  const b = btns.find((x) => x.textContent.includes('选中组内全部'));
  if (b) b.click();
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const g = document.querySelector('.group-name');
  const f = document.querySelector('.group-frame');
  return {
    nameBg: g ? getComputedStyle(g).backgroundColor : null,
    frameBg: f ? getComputedStyle(f).backgroundColor : null,
    frameActive: f ? f.className : null,
  };
});
console.log('选中组内全部后:', JSON.stringify(after, null, 1));
console.log('分组头保持紫色:', after.nameBg === 'rgb(108, 92, 231)' ? '✅' : '❌ 变白=' + after.nameBg);
console.log('JS错误:', errs.length);
await browser.close();
process.exit(0);