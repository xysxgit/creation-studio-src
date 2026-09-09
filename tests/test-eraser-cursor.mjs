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
// 画笔模式滑动：显示画笔预览线
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 300, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 400, wb.y + 400, { steps: 3 }); // 不松手，检查预览
await page.waitForTimeout(200);
const penPreviewPath = await page.locator('.annotation-g .annotation-line').count();
console.log('画笔滑动中预览(路径):', penPreviewPath);
await page.mouse.up();
await page.waitForTimeout(300);

// 橡皮模式滑动：应显示 🧽 光标，不画线
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 350, wb.y + 450); await page.mouse.down();
await page.mouse.move(wb.x + 450, wb.y + 450, { steps: 3 }); // 不松手
await page.waitForTimeout(200);
const cursorCount = await page.locator('.eraser-cursor').count();
const cursorText = await page.locator('.eraser-cursor text').textContent().catch(() => null);
const eraserPreviewLine = await page.locator('.eraser-cursor circle').count();
const noPenPathDuringErase = await page.evaluate(() => {
  // 橡皮滑动中不应出现画笔实心path预览（annotation-line 是已画笔画，检查是否有额外预览path）
  const previews = document.querySelectorAll('.eraser-cursor');
  const penStrokes = document.querySelectorAll('path[fill]');
  return { previews: previews.length };
});
console.log('橡皮滑动中光标数:', cursorCount, cursorCount === 1 ? '✅ 显示橡皮光标' : '❌');
console.log('光标内图标:', cursorText, cursorText === '🧽' ? '✅ 🧽图标' : '❌');
console.log('光标圆环:', eraserPreviewLine, eraserPreviewLine === 1 ? '✅ 红色圆环' : '❌');
// 松手后橡皮擦除生效
await page.mouse.up();
await page.waitForTimeout(300);
const cursorGone = await page.locator('.eraser-cursor').count();
console.log('松手后光标消失:', cursorGone, cursorGone === 0 ? '✅' : '❌');
// 画笔模式仍有画笔预览
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 300, wb.y + 550); await page.mouse.down();
await page.mouse.move(wb.x + 400, wb.y + 550, { steps: 3 });
await page.waitForTimeout(200);
const penCursor = await page.locator('.eraser-cursor').count();
const penPathPreview = await page.locator('.pen-preview path, path.annotation-line').count();
console.log('画笔模式无橡皮光标:', penCursor, penCursor === 0 ? '✅' : '❌');
await page.mouse.up();
await page.waitForTimeout(200);
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);