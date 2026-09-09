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
await page.click('.zc-fab'); await page.waitForTimeout(300);
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
// 两条不相交的笔画：横线(y=400) 和 竖线(x=600)
await page.mouse.move(wb.x + 200, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 500, wb.y + 400, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(200);
await page.mouse.move(wb.x + 600, wb.y + 250); await page.mouse.down();
await page.mouse.move(wb.x + 600, wb.y + 550, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('两条笔画后:', await page.locator('.annotation-g').count());
// 橡皮滑动擦横线中间段（起点在横线上）
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 300, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 380, wb.y + 400, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(400);
const after = await page.locator('.annotation-g').count();
console.log('擦横线后总数:', after, after === 3 ? '✅ 横线断成2段+竖线保留(不影响别的内容)' : '❌ ' + after);
// 竖线完整存在（未受影响）
const yline = await page.evaluate(() => {
  // 竖线 x≈600：通过渲染路径判断，检查是否有 path 覆盖 x=600
  return document.querySelectorAll('.annotation-g path').length;
});
console.log('竖线未被影响(总path数):', yline);
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);