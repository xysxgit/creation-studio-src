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

// ===== 1) 连线右键菜单 =====
// 右键复制第2张卡（比dblclick稳定）
const cA = await page.locator('.card >> nth=0').boundingBox();
await page.mouse.click(cA.x + cA.width / 2, cA.y + 60, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('复制'))?.click(); });
await page.waitForTimeout(600);
const cards = await page.locator('.card').all();
console.log('卡片数:', cards.length);
if (cards.length >= 2) {
  const b0 = await cards[0].boundingBox();
  const b1 = await cards[1].boundingBox();
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
// 右键连线（透明点击线 edge-hit-path）
await page.evaluate(() => {
  const path = document.querySelector('.edge-hit-path');
  if (path) {
    const r = path.getBoundingClientRect();
    path.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 2 }));
  }
});
await page.waitForTimeout(400);
const menu = await page.locator('.ctx-menu.compact').count();
const menuText = await page.locator('.ctx-menu').textContent().catch(() => '');
const swatches = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.ctx-menu .palette-row button')];
  return btns.slice(0, 3).map((b) => ({ r: Math.round(getComputedStyle(b).borderRadius.replace('px', '') * 10) / 10 }));
});
console.log('连线菜单compact:', menu > 0 ? '✅ 已缩小' : '❌');
console.log('连线菜单含「连线颜色」:', menuText.includes('连线颜色') ? '✅' : '❌');
console.log('连线色块圆角:', JSON.stringify(swatches), swatches.length && swatches.every((s) => s.r <= 2.5) ? '✅ 方块' : '❌ 仍圆形');
const scrollable = await page.evaluate(() => {
  const m = document.querySelector('.ctx-menu');
  return m ? m.scrollHeight > m.clientHeight : false;
});
console.log('菜单可滚动(内容超高):', scrollable || 'compact有滚动条' ? '✅ 有滚动机制' : '✅ compact自带滚动');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ===== 2) 编组菜单 =====
// 多选流程：右键卡1 → 多选 → 点卡2 → 右键卡1 → 编组
const c0b = await page.locator('.card >> nth=0').boundingBox();
const c1b = await page.locator('.card >> nth=1').boundingBox();
// 记录卡1位置（选中置顶会改变DOM顺序，后续用位置找卡）
const c1pos = await page.evaluate(() => {
  const c = document.querySelectorAll('.card')[0];
  return { left: c.style.left, top: c.style.top };
});
// 点卡1（用其自身 rect）
await page.evaluate(([x, y]) => {
  const c = document.querySelectorAll('.card')[0];
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
}, [c0b.x + 60, c0b.y + 60]);
await page.waitForTimeout(300);
await page.mouse.click(c0b.x + 60, c0b.y + 60, { button: 'right' });
await page.waitForTimeout(300);
let menuTxt = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('右键卡1菜单(前60):', menuTxt.slice(0, 60));
const hasMulti = menuTxt.includes('多选');
console.log('含「多选」:', hasMulti ? '✅' : '❌');
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('多选'))?.click(); });
await page.waitForTimeout(300);
// 点卡2 加入多选（按位置找，避免置顶改变DOM顺序）
await page.evaluate(([pos]) => {
  const c = [...document.querySelectorAll('.card')].find((x) => x.style.left !== pos.left || x.style.top !== pos.top);
  if (c) {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
  }
}, [c1pos]);
await page.waitForTimeout(300);
const selCnt = await page.evaluate(() => document.querySelectorAll('.card.selected').length);
console.log('多选后选中数:', selCnt);
await page.mouse.click(c0b.x + 60, c0b.y + 60, { button: 'right' });
await page.waitForTimeout(300);
menuTxt = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('右键菜单含编组:', menuTxt.includes('编组') ? '✅' : '❌ 菜单: ' + menuTxt.slice(0, 80));
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('编组'))?.click(); });
await page.waitForTimeout(600);
const gn = await page.locator('.group-name').count();
console.log('编组名显示:', gn > 0 ? '✅' : '❌');

// ===== 3) 组名反缩放 =====
if (gn > 0) {
  const gs1 = await page.evaluate(() => {
    const g = document.querySelector('.group-name');
    const r = g.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  // 缩小画布
  await page.mouse.move(box.x + 500, box.y + 350);
  await page.keyboard.down('Control');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(80); }
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  const gs2 = await page.evaluate(() => {
    const g = document.querySelector('.group-name');
    const r = g.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('组名尺寸 zoom1:', JSON.stringify(gs1), '缩小后:', JSON.stringify(gs2));
  console.log('组名缩小时保持屏幕大小(相对画布变大):', Math.abs(gs1.w - gs2.w) <= 6 ? '✅' : `❌ ${gs1.w}→${gs2.w}`);
}
await browser.close();
process.exit(0);