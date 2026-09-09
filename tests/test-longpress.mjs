import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
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

const c0 = await page.locator('.card').count();
console.log('初始卡片数:', c0);

// touch 长按空白（不松手 >450ms → 新建卡片）
await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-wrap');
  const r = wrap.getBoundingClientRect();
  const x = r.left + 400, y = r.top + 300;
  wrap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, isPrimary: true }));
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-wrap');
  const r = wrap.getBoundingClientRect();
  wrap.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 1, clientX: r.left + 400, clientY: r.top + 300, isPrimary: true }));
});
await page.waitForTimeout(600);
const c1 = await page.locator('.card').count();
console.log('长按后卡片数:', c1, c1 > c0 ? '✅ 长按新建卡片' : '❌ 未新建');
// 无「插入模板」菜单弹出
const tplMenu = await page.locator('.tpl-menu, .tpl-menu-group').count().catch(() => 0);
console.log('无插入模板菜单弹出:', tplMenu === 0 ? '✅' : '❌ 仍弹模板菜单');
// 关键：弹「空白新建菜单」（便签卡/图片卡），而非卡片菜单（复制/删除）
const menuText = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('弹出空白菜单含「便签卡」:', menuText.includes('便签卡') ? '✅' : '❌ 菜单: ' + menuText.slice(0, 50));
console.log('弹出空白菜单含「图片卡」:', menuText.includes('图片卡') ? '✅' : '❌');
console.log('非卡片菜单(无复制卡片):', !menuText.includes('复制卡片') ? '✅' : '❌ 弹了卡片菜单');
await browser.close();
process.exit(0);