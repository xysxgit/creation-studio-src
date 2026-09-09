import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 200)); });
page.on('download', (d) => console.log('DOWNLOAD EVENT:', d.suggestedFilename()));
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(600);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);

await page.click('button[aria-label="导出"]');
await page.waitForTimeout(500);
await page.click('button:has-text("保存项目 JSON")');
await page.waitForTimeout(800);
// 检查当前模态状态与主按钮
console.log('模态数:', await page.locator('.modal').count());
const btns = await page.locator('.modal .btn').allTextContents();
console.log('按钮:', JSON.stringify(btns));
// 点击主按钮
await page.click('.modal .btn.primary:has-text("选择位置并下载")').catch((e) => console.log('点主按钮失败:', String(e).slice(0, 100)));
await page.waitForTimeout(2000);
// 检查 toast
const toasts = await page.locator('.toast, .toasts *').allTextContents();
console.log('toasts:', JSON.stringify(toasts));
await browser.close();