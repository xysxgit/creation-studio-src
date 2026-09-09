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
const wb0 = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(wb0.x + 150, wb0.y + 150);
await page.waitForTimeout(600);

// 画笔同层：画线 → Ctrl+缩放 → 笔迹随卡片缩放（bbox 变大）
await page.click('.zc-fab'); await page.waitForTimeout(300);
console.log('A zc-fab clicked');
await page.click('.zc-tool:has-text("画笔")'); console.log('A2 pen tool');
await page.waitForTimeout(300);
const wb = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.move(wb.x + 300, wb.y + 400);
console.log('B1 down'); await page.mouse.down();
await page.mouse.move(wb.x + 500, wb.y + 400, { steps: 5 });
await page.mouse.move(wb.x + 500, wb.y + 550, { steps: 5 });
console.log('B2 up'); await page.mouse.up(); await page.waitForTimeout(400);
console.log('B3 line1'); const line1 = await page.locator('.annotation-g path.annotation-line').boundingBox(); console.log('line1', JSON.stringify(line1));
// Ctrl+滚轮放大
await page.keyboard.down('Control');
await page.mouse.move(720, 450);
await page.mouse.wheel(0, -600);
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const line2 = await page.locator('.annotation-g path.annotation-line').boundingBox();
console.log('画笔同层缩放: 缩放前', Math.round(line1.width), 'px → 缩放后', Math.round(line2.width), 'px', line2.width > line1.width * 1.3 ? '✅ 随画布缩放(同层)' : '❌ 未跟随');

// 标题自适应：长标题字号变小
console.log('C fitview'); await page.keyboard.press('f'); await page.waitForTimeout(600);
const st = await page.evaluate(() => ({ cards: document.querySelectorAll('.card').length, anns: document.querySelectorAll('.annotation-g').length, zoom: document.querySelector('.zoom-val')?.textContent }));
console.log('C state:', JSON.stringify(st));
console.log('C dblclick'); await page.locator('.card').dblclick();
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.locator('.fe-title-input input').fill('这是一个非常非常长的章节标题用来测试自适应显示效果');
await page.click('.fe-actions .btn.primary');
await page.waitForTimeout(400);
const fs = await page.locator('.card-title-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
console.log('长标题字号:', fs, 'px', fs < 13 ? '✅ 自适应缩小' : '❌ 未缩小');
console.log('JS错误:', errors.length);
await browser.close();
