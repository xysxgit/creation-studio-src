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

// 双击创建卡片
const canvas = await page.locator('.canvas-wrap');
const box = await canvas.boundingBox();
await page.mouse.dblclick(box.x + 300, box.y + 200);
await page.waitForTimeout(500);
const cardCount = await page.locator('.card').count();
console.log('卡片数:', cardCount, cardCount > 0 ? '✅' : '❌');

async function measureButtons() {
  return await page.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const cr = card.getBoundingClientRect();
    const topbar = card.querySelector('.card-topbar');
    const actions = card.querySelector('.card-topbar-actions');
    if (!topbar || !actions) return null;
    const ar = actions.getBoundingClientRect();
    const btns = [...actions.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      cardRight: cr.right,
      actionsRight: ar.right,
      gapToRight: Math.round((cr.right - ar.right) * 10) / 10,
      btnW: btns.length ? Math.round(btns[0].width * 10) / 10 : 0,
      btnH: btns.length ? Math.round(btns[0].height * 10) / 10 : 0,
      btnCount: btns.length,
      btnInCard: btns.every((b) => b.left >= cr.left - 1 && b.right <= cr.right + 1),
    };
  });
}

// zoom=1 测量
const m1 = await measureButtons();
console.log('zoom=1:', JSON.stringify(m1));
if (!m1) { console.log('❌ 无按钮'); process.exit(0); }

// 放大 zoom（Ctrl+滚轮）
const canvasBox = await canvas.boundingBox();
await page.mouse.move(canvasBox.x + 400, canvasBox.y + 250);
await page.keyboard.down('Control');
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(120);
}
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const m2 = await measureButtons();
console.log('放大后:', JSON.stringify(m2));

// 验证：按钮与卡片固定比例（随卡片一起缩放，且始终在卡片内）
const cardW1 = m1.cardRight - (m1.cardRight - m1.btnW - m1.gapToRight) - (m1.cardRight - m1.cardRight);
const ratioOk = m2.btnW > m1.btnW * 1.3;
const inCardOk = m2.btnInCard;
console.log('按钮随卡片放大(固定比例):', ratioOk ? `✅ ${m1.btnW}→${m2.btnW}px` : `❌ ${m1.btnW}→${m2.btnW}`);
console.log('按钮在卡片内(不飞出):', inCardOk ? '✅' : '❌ 飞出');

// 再缩小
await page.keyboard.down('Control');
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
}
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const m3 = await measureButtons();
console.log('缩小后:', JSON.stringify(m3));
const shrinkOk = m3.btnW < m1.btnW * 0.8;
const inCardOk3 = m3.btnInCard;
console.log('缩小后按钮随卡片缩小:', shrinkOk ? '✅' : `❌ ${m1.btnW}→${m3.btnW}`);
console.log('缩小后按钮在卡片内:', inCardOk3 ? '✅' : '❌ 飞出');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);