import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300);
await page.waitForTimeout(700);

async function measure(w) {
  return await page.evaluate((w) => {
    const card = document.querySelector('.card');
    if (!card) return null;
    card.style.width = w + 'px';
    const cr = card.getBoundingClientRect();
    const actions = card.querySelector('.card-topbar-actions');
    const ar = actions.getBoundingClientRect();
    const btns = [...actions.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      cardW: Math.round(cr.width * 10) / 10,
      gapToRight: Math.round((cr.right - ar.right) * 10) / 10,
      btnInCard: btns.every((b) => b.left >= cr.left - 1 && b.right <= cr.right + 1),
      btnLefts: btns.map((b) => Math.round((b.left - cr.left) * 10) / 10),
      btnRights: btns.map((b) => Math.round((b.right - cr.left) * 10) / 10),
      actionsLeft: Math.round((ar.left - cr.left) * 10) / 10,
    };
  }, w);
}
for (const w of [170, 140, 110, 90, 70, 50]) {
  const m = await measure(w);
  console.log('宽' + w + 'px:', JSON.stringify(m), m.btnInCard ? '✅' : '❌');
}
await browser.close();
process.exit(0);