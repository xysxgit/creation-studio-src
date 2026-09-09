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
await page.mouse.move(wb.x + 500, wb.y + 400, { steps: 10 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('笔画数:', await page.locator('.annotation-g').count());

// 1) 切到橡皮：fab 图标应变 🧽
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
// 直接检查面板状态：橡皮模式下颜色行应隐藏
const colorVisible = await page.locator('.pen-tools .pen-label:has-text("颜色")').count();
const eraserLabel = await page.locator('.pen-tools .pen-label:has-text("橡皮大小")').count();
console.log('橡皮模式颜色行:', colorVisible, colorVisible === 0 ? '✅ 已隐藏' : '❌ 仍显示');
console.log('橡皮大小滑条:', eraserLabel, eraserLabel === 1 ? '✅ 显示' : '❌ 缺失');
const toolsClass = await page.locator('.pen-tools').getAttribute('class');
console.log('面板类:', toolsClass, toolsClass.includes('eraser-tools') ? '✅ 红系标识' : '❌ 无标识');
// fab 图标：收面板后检查
await page.mouse.click(720, 80); // 点空白收面板（非pen工具？当前是pen，不会收）——直接读内部状态：fab 未开时显示什么
// 通过收起面板检查：点击画布右上角外部
await page.mouse.click(wb.x - 100, wb.y - 100);
await page.waitForTimeout(300);
const fabText = await page.locator('.zc-fab').textContent();
console.log('fab图标(橡皮模式):', fabText, fabText.includes('🧽') ? '✅ 橡皮图标' : '❌ 仍是画笔');

// 2) 滑动擦除：在横线中间段滑动一小段，应只擦中间，左右两端保留
await page.click('.zc-fab'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 300, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 380, wb.y + 400, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(400);
const annCount = await page.locator('.annotation-g').count();
console.log('滑动擦除后笔画数:', annCount, annCount >= 2 ? '✅ 局部擦除(分段保留)' : '❌ 整条没了');

// 3) 画笔模式恢复颜色行
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
const colorBack = await page.locator('.pen-tools .pen-label:has-text("颜色")').count();
console.log('画笔模式颜色行:', colorBack, colorBack === 1 ? '✅ 恢复' : '❌ 缺失');

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);