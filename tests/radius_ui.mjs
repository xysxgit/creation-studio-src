// 验证检查器圆角控件：sm/lg 下卡片与白色正文底部圆角一致
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.setItem('cs.helpSeen', '1'); });
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(600);
const card = page.locator('.card').first();
const box = await card.boundingBox();
await card.click({ position: { x: box.width / 2, y: box.height / 2 } });
await page.waitForTimeout(300);
const check = async (label) => {
  const r = await page.evaluate(() => {
    const c = document.querySelector('.card.selected');
    const cs = getComputedStyle(c);
    const body = c.querySelector('.card-body');
    return { card: cs.borderRadius, body: body ? getComputedStyle(body).borderRadius : '(无正文)' };
  });
  console.log(`${label}: 卡片=${r.card} 正文底部=${r.body} ${r.card === '6px' && r.body === '0px 0px 5px 5px' ? '✓' : r.card === '20px' && r.body === '0px 0px 19px 19px' ? '✓' : r.card === '10px' && r.body === '0px 0px 9px 9px' ? '✓' : '✗'}`);
};
await check('默认(md)');
await page.locator('.inspector .btn:has-text("小圆角")').click();
await page.waitForTimeout(250);
await check('小圆角(sm)');
await page.locator('.inspector .btn:has-text("大圆角")').click();
await page.waitForTimeout(250);
await check('大圆角(lg)');
await page.locator('.inspector .btn:has-text("默认")').click();
await page.waitForTimeout(250);
await check('恢复默认(md)');
await browser.close();
