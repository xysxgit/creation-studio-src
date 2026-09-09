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
// 画线
await page.click('.zc-fab'); await page.waitForTimeout(300);
const tools = await page.locator('.zc-tool em').allTextContents();
console.log('工具列表:', tools.join(','));
console.log(!tools.some((t) => t.includes('橡皮')) ? '✅ 橡皮工具已删除' : '❌ 仍有橡皮');
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
// 画笔面板无橡皮按钮
const panelBtns = await page.locator('.pen-tools').textContent();
console.log(!panelBtns.includes('橡皮') ? '✅ 画笔面板无橡皮' : '❌ 面板有橡皮', panelBtns.replace(/s+/g, ' ').slice(0, 80));
await page.mouse.move(wb.x + 250, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 450, wb.y + 400, { steps: 6 }); await page.mouse.move(wb.x + 450, wb.y + 500, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(400);
// 平滑笔画：path 有 fill（实心手绘）
const fill = await page.locator('.annotation-line').first().getAttribute('fill');
const d = await page.locator('.annotation-line').first().getAttribute('d');
console.log('笔画 fill:', fill, '路径长度:', d.length, (fill && fill.startsWith('#') && d.length > 80) ? '✅ 压力感平滑笔画' : '❌ 非平滑');
// 点选删除
await page.click('.zc-tool:has-text("框选")'); await page.waitForTimeout(300);
await page.mouse.click(wb.x + 350, wb.y + 400);
await page.waitForTimeout(300);
const sel = await page.locator('.annotation-g.selected').count();
console.log(sel === 1 ? '✅ 笔画可点选' : '❌ 不可点选');
// 缩放跟随
const b1 = await page.locator('.annotation-g path.annotation-line').boundingBox();
await page.keyboard.down('Control'); await page.mouse.move(720, 450); await page.mouse.wheel(0, -600); await page.keyboard.up('Control');
await page.waitForTimeout(500);
const b2 = await page.locator('.annotation-g path.annotation-line').boundingBox();
console.log('缩放跟随:', Math.round(b1.width), '→', Math.round(b2.width), 'px', b2.width > b1.width * 1.3 ? '✅' : '❌');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);