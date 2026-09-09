import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
const wb = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(wb.x + 200, wb.y + 200);
await page.waitForTimeout(600);
const card = page.locator('.card').last();
// 1) topbar 存在且在 header 之前
const topbar = await card.locator('.card-topbar').count();
const header = await card.locator('.card-header').count();
const topbarBtns = await card.locator('.card-topbar .card-collapse-btn').count();
const headerBtns = await card.locator('.card-header .card-collapse-btn').count();
console.log('topbar:', topbar, 'header:', header, '色条内按钮:', topbarBtns, '标题行按钮:', headerBtns);
console.log(topbar === 1 && header === 1 && topbarBtns >= 2 && headerBtns === 0 ? '✅ 功能按钮已移入顶部色条' : '❌ 结构不符');
// 2) topbar 在 DOM 中先于 header
const order = await page.evaluate(() => {
  const c = document.querySelector('.card');
  const t = c.querySelector('.card-topbar');
  const h = c.querySelector('.card-header');
  return !!(t && h && t.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING);
});
console.log(order ? '✅ 色条在标题行上方' : '❌ 顺序错误');
// 3) 色条有颜色背景（非透明）
const bg = await page.locator('.card-topbar').evaluate((el) => getComputedStyle(el).backgroundImage);
console.log(bg.includes('linear-gradient') ? '✅ 色条渐变背景' : '❌ 无色条', bg.slice(0, 60));
// 4) 标题行完整宽度（input 可用宽度 > 无 topbar 时）
const inputW = await card.locator('.card-title-input').evaluate((el) => el.getBoundingClientRect().width);
console.log('标题input宽度:', Math.round(inputW), 'px', inputW > 100 ? '✅ 标题空间充足' : '❌ 太窄');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);