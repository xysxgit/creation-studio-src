import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
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

// 双击创建两张卡
const canvas = await page.locator('.canvas-wrap');
const box = await canvas.boundingBox();
await page.mouse.dblclick(box.x + 200, box.y + 150);
await page.waitForTimeout(600);
await page.mouse.dblclick(box.x + 900, box.y + 400);
await page.waitForTimeout(600);
console.log('卡片数:', await page.locator('.card').count());

// 切到编组tab，点击两张卡（多选模式默认multi）
await page.evaluate(() => { [...document.querySelectorAll('.sb-tabs button')].find((b) => b.textContent.includes('编组')).click(); });
await page.waitForTimeout(400);
await page.evaluate(() => {
  const items = document.querySelectorAll('.outline-item');
  items[0]?.click();
  items[1]?.click();
});
await page.waitForTimeout(300);
const hasBtn = await page.locator('.layer-toolbar:has-text("编组所选")').count();
console.log('多选两张卡出现「编组所选」:', hasBtn > 0 ? '✅' : '❌');
if (hasBtn > 0) {
  await page.evaluate(() => {
    [...document.querySelectorAll('.layer-toolbar button')].find((b) => b.textContent.includes('编组所选')).click();
  });
  await page.waitForTimeout(400);
  const gName = await page.evaluate(() => {
    const t = document.querySelector('.outline-sec-title .g-name');
    return t ? t.textContent.trim() : null;
  });
  const groupCardCount = await page.evaluate(() => {
    const sec = document.querySelector('.outline-sec');
    return sec ? sec.querySelectorAll('.outline-item').length : 0;
  });
  console.log('新建文件夹出现:', gName ? `✅ 📦${gName}` : '❌');
  console.log('文件夹内卡片数:', groupCardCount, groupCardCount === 2 ? '✅' : '❌');
}
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);