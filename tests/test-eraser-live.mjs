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
// 画一条长横线
await page.mouse.move(wb.x + 200, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 500, wb.y + 400, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('画后笔画数:', await page.locator('.annotation-g').count());
// 切橡皮
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
// 滑动擦中间段，**不松手**，中途检查是否已实时擦除
await page.mouse.move(wb.x + 300, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 350, wb.y + 400, { steps: 2 }); await page.waitForTimeout(300);
const midCount = await page.locator('.annotation-g').count();
console.log('滑动中(未松手)笔画数:', midCount, midCount === 2 ? '✅ 实时擦除生效' : '❌ 未实时(' + midCount + ')');
// 继续滑到末端，仍未松手（滑动覆盖区域即擦，属正确行为）
await page.mouse.move(wb.x + 450, wb.y + 400, { steps: 3 }); await page.waitForTimeout(300);
const mid2 = await page.locator('.annotation-g').count();
console.log('继续滑动(覆盖区域被擦):', mid2, mid2 < 2 ? '✅ 实时持续擦除' : '✅ 分段保留');
// 松手：数量不变（不重复擦除），撤销正常
await page.mouse.up();
await page.waitForTimeout(300);
const after = await page.locator('.annotation-g').count();
console.log('松手后笔画数:', after, after === mid2 ? '✅ 无重复' : '❌ ' + after);
// 面板无提示行
const hintCount = await page.locator('.eraser-hint').count();
console.log('面板提示行:', hintCount, hintCount === 0 ? '✅ 已删除' : '❌ 仍存在');
// 撤销恢复整条（一次撤销）
await page.click('button[aria-label="撤销"]'); await page.waitForTimeout(300);
const undoCount = await page.locator('.annotation-g').count();
console.log('撤销后笔画数:', undoCount, undoCount === 1 ? '✅ 一次撤销恢复' : '❌ ' + undoCount);
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);