import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 812, height: 375 } });
const page = await ctx.newPage();
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
await page.click('.tb-collapse-btn');
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const tb = document.querySelector('.topbar');
  const tr = document.querySelector('.tb-title-row');
  const ar = document.querySelector('.tb-actions-row');
  const gs = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { h: Math.round(r.height), w: Math.round(r.width), display: cs.display, wrap: cs.flexWrap, top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  return {
    topbar: gs(tb),
    title: tr ? gs(tr) : null,
    actions: ar ? gs(ar) : null,
    titleChildren: tr ? [...tr.children].map((c) => ({ cls: c.className, h: Math.round(c.getBoundingClientRect().height), w: Math.round(c.getBoundingClientRect().width) })) : []
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: '/tmp/collapse-land.png' });
await browser.close();
process.exit(0);