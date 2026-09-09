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

// 1) 第一笔：横线
await page.mouse.move(wb.x + 250, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 450, wb.y + 400, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('第一笔后笔画数:', await page.locator('.annotation-g').count());

// 2) 第二笔：起点落在这条笔画正中间（350,400），向右上画
await page.mouse.move(wb.x + 350, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 350, wb.y + 300, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(400);
const count2 = await page.locator('.annotation-g').count();
console.log('第二笔(起点在笔画上)后笔画数:', count2, count2 === 2 ? '✅ 可在笔画上继续画' : '❌ 无效');

// 3) 再来一笔：完全穿过第一笔（起点/终点都在笔画外，路径穿过）
await page.mouse.move(wb.x + 300, wb.y + 350); await page.mouse.down();
await page.mouse.move(wb.x + 400, wb.y + 450, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(400);
const count3 = await page.locator('.annotation-g').count();
console.log('第三笔(穿过笔画)后笔画数:', count3, count3 === 3 ? '✅ 穿笔可画' : '❌ 无效');

// 4) 橡皮模式点击擦除仍正常
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 350, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 350, wb.y + 400, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(300);
const count4 = await page.locator('.annotation-g').count();
console.log('橡皮擦除后:', count4, count4 === 2 ? '✅ 橡皮正常' : '❌ 橡皮异常');

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);