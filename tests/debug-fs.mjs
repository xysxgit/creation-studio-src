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
await page.waitForTimeout(600);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
console.log('卡片数:', await page.locator('.card').count());
// 检查是否有模板卡
console.log('卡片标题:', JSON.stringify(await page.locator('.card-title-input').allTextContents()));
const cards = page.locator('.card');
await cards.first().click();
await page.waitForTimeout(500);
console.log('检查器slider初始:', await page.locator('.inspector input[type="range"]').evaluate(el => el.value));
// 全部卡片 rich-static 初始 fontSize
console.log('全部卡片fs:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.card .rich-static')].map(el => getComputedStyle(el).fontSize))));
await page.evaluate(() => {
  const inp = document.querySelector('.inspector input[type="range"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '26');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(1500);
console.log('slider改后值:', await page.locator('.inspector input[type="range"]').evaluate(el => el.value));
console.log('全部卡片fs后:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.card .rich-static')].map(el => getComputedStyle(el).fontSize))));
// 检查器里显示的文字（确认是哪张卡）
console.log('inspector h4:', await page.locator('.inspector h4').textContent());
await browser.close();