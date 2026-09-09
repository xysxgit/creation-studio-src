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

// 建2张重叠卡片（第二张叠在第一张上面位置）
await page.mouse.dblclick(box.x + 400, box.y + 300);
await page.waitForTimeout(700);
await page.mouse.click(box.x + 400, box.y + 300);
await page.waitForTimeout(400);
// 右键复制第2张
const c0 = await page.locator('.card >> nth=0').boundingBox();
await page.mouse.click(c0.x + c0.width / 2, c0.y + 60, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find((b) => b.textContent.includes('复制')).click(); });
await page.waitForTimeout(600);
const n = await page.locator('.card').count();
console.log('卡片数:', n);

const zOrder = () => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  return cards.map((c) => ({ left: c.style.left, sel: c.className.includes('selected') }));
});
const fmt = (arr) => arr.map((x) => (x.sel ? '[' + x.left + ']' : x.left)).join(' | ');

// 初始：最后渲染的卡2在 DOM 最上层（选中）
let order = await zOrder();
console.log('初始 DOM(选中标记):', fmt(order));

// 用 evaluate 直接触发卡1 pointerdown（绕过上层卡片遮挡）
await page.evaluate(() => {
  const c = document.querySelectorAll('.card')[0];
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
  c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
});
await page.waitForTimeout(500);
order = await zOrder();
console.log('点卡1后 DOM:', fmt(order));
// 卡1(210px)应出现在 DOM 最后且选中 = 已置顶
const last = order[order.length - 1];
const ok1 = order.length >= 2 && last.left === '210px' && last.sel;
console.log('卡1(210px)已置顶:', ok1 ? '✅' : '❌');

// 再点卡2(240px) → 卡2置顶
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const c = cards.find((x) => x.style.left === '240px');
  if (c) {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.x + 60, clientY: r.y + 60 }));
  }
});
await page.waitForTimeout(500);
order = await zOrder();
console.log('点卡2后 DOM:', fmt(order));
const last2 = order[order.length - 1];
const ok2 = order.length >= 2 && last2.left === '240px' && last2.sel;
console.log('卡2(240px)已置顶:', ok2 ? '✅' : '❌');
await browser.close();
process.exit(0);