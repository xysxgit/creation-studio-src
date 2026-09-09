import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
await page.click('.zc-fab'); await page.waitForTimeout(400);
console.log('工具列表:', await page.locator('.zc-tool em').allTextContents());
const eraserBtn = page.locator('.zc-tool:has-text("橡皮")');
console.log('橡皮按钮可见:', await eraserBtn.isVisible());
await eraserBtn.click();
await page.waitForTimeout(500);
// 检查橡皮按钮 active
console.log('橡皮按钮class:', await page.locator('.zc-tool.eraser').getAttribute('class'));
console.log('画笔按钮class:', await page.locator('.zc-tool:has-text("画笔")').getAttribute('class'));
// 面板内容
console.log('面板文本:', (await page.locator('.pen-tools').textContent()).replace(/\s+/g, ' ').slice(0, 120));
// store 状态（通过window？不可直接访问，检查UI）
console.log('颜色label:', await page.locator('.pen-label:has-text("颜色")').count());
console.log('橡皮大小label:', await page.locator('.pen-label:has-text("橡皮大小")').count());
await browser.close();
process.exit(0);