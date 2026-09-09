// 截图：查看画布卡片圆角渲染效果
import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.setItem('cs.helpSeen', '1'); });
await page.click('text=＋ 新建项目');
await page.waitForSelector('.type-card');
await page.click('.type-card:has-text("小说")');
await page.fill('.modal input[placeholder*="未命名"]', '圆角验证');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page.waitForTimeout(800);
await page.keyboard.press('f');
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  return cards.map((c) => {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundImage.slice(0, 90), radius: cs.borderRadius };
  }).filter((c) => c.w > 100).slice(0, 8);
});
console.log(JSON.stringify(info, null, 2));

const first = info[0];
if (first) {
  await page.screenshot({ path: '/root/创作助手/tests/radius-top-left.png', clip: { x: first.x - 8, y: first.y - 8, width: 90, height: 90 } });
  await page.screenshot({ path: '/root/创作助手/tests/radius-card.png', clip: { x: first.x - 20, y: first.y - 20, width: Math.min(first.w + 40, 800), height: Math.min(first.h + 40, 500) } });
}
await browser.close();
