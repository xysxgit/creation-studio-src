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

async function measure() {
  return await page.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const cr = card.getBoundingClientRect();
    const actions = card.querySelector('.card-topbar-actions');
    if (!actions) return null;
    const ar = actions.getBoundingClientRect();
    const btns = [...actions.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      cardW: Math.round(cr.width * 10) / 10,
      gapToRight: Math.round((cr.right - ar.right) * 10) / 10,
      btnInCard: btns.every((b) => b.left >= cr.left - 1 && b.right <= cr.right + 1),
      btnLeftOfCard: btns.map((b) => Math.round((b.left - cr.left) * 10) / 10),
    };
  });
}

// 1) 窄卡片：把卡片宽度改小（通过 resize 手柄或 store？用 UI 右侧 inspector 序号无宽度。改用拖拽 resize）
const m0 = await measure();
console.log('初始:', JSON.stringify(m0));

// 选中卡片，从左侧 resize 手柄拉窄
await page.locator('.card').click();
await page.waitForTimeout(300);
const c = await page.locator('.card').boundingBox();
// 左侧中间手柄（w）
await page.mouse.move(c.x + 2, c.y + c.height / 2);
await page.mouse.down();
await page.mouse.move(c.x + 90, c.y + c.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
const m1 = await measure();
console.log('拉窄后:', JSON.stringify(m1));
console.log('窄卡按钮在卡片内:', m1.btnInCard ? '✅' : '❌ 飞出', '按钮距左缘:', JSON.stringify(m1.btnLeftOfCard));

// 2) 折叠状态：点折叠按钮
await page.evaluate(() => { document.querySelector('.card-topbar-actions button:last-child')?.click(); });
await page.waitForTimeout(400);
const m2 = await measure();
console.log('折叠后:', JSON.stringify(m2));
console.log('折叠后按钮在卡片内:', m2.btnInCard ? '✅' : '❌');

// 3) 放大zoom后窄卡+折叠
await page.mouse.move(box.x + 500, box.y + 350);
await page.keyboard.down('Control');
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(100); }
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const m3 = await measure();
console.log('窄卡+折叠+放大后:', JSON.stringify(m3));
console.log('按钮距右缘:', m3.gapToRight, '在卡片内:', m3.btnInCard ? '✅' : '❌');
await browser.close();
process.exit(0);