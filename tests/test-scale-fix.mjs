import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
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
    const cardW = Math.round(cr.width * 10) / 10;
    return {
      cardW,
      btnW: btns.length ? Math.round(btns[0].width * 10) / 10 : 0,
      gapToRight: Math.round((cr.right - ar.right) * 10) / 10,
      btnInCard: btns.every((b) => b.left >= cr.left - 1 && b.right <= cr.right + 1),
    };
  });
}

// zoom=1
const m1 = await measure();
console.log('zoom=1:', JSON.stringify(m1));

// 放大（zoom 2~3）
await page.mouse.move(box.x + 500, box.y + 350);
await page.keyboard.down('Control');
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(100); }
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const m2 = await measure();
console.log('放大后:', JSON.stringify(m2));
console.log('按钮随卡片放大(固定比例):', m2.btnW > m1.btnW * 1.5 ? `✅ ${m1.btnW}→${m2.btnW}px(卡片${m1.cardW}→${m2.cardW})` : '❌ 未随卡片放大');
console.log('按钮在卡片内:', m2.btnInCard ? '✅' : '❌ 飞出');

// 缩小（zoom <1）
await page.keyboard.down('Control');
for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(80); }
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const m3 = await measure();
console.log('缩小后:', JSON.stringify(m3));
console.log('按钮随卡片缩小(固定比例):', m3.btnW < m1.btnW * 0.8 ? `✅ ${m1.btnW}→${m3.btnW}px(卡片${m1.cardW}→${m3.cardW})` : '❌');
console.log('缩小后按钮在卡片内:', m3.btnInCard ? '✅' : '❌ 飞出');

// 长按空白 → 弹空白菜单（便签卡/图片卡）
await page.mouse.move(box.x + 200, box.y + 200);
await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-wrap');
  const r = wrap.getBoundingClientRect();
  const x = r.left + 200, y = r.top + 200;
  wrap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, isPrimary: true }));
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-wrap');
  const r = wrap.getBoundingClientRect();
  wrap.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 1, clientX: r.left + 200, clientY: r.top + 200, isPrimary: true }));
});
await page.waitForTimeout(500);
const menuText = await page.locator('.ctx-menu').textContent().catch(() => '');
console.log('长按弹出菜单含「便签卡」:', menuText.includes('便签卡') ? '✅' : '❌ 菜单: ' + menuText.slice(0, 60));
console.log('长按弹出菜单含「图片卡」:', menuText.includes('图片卡') ? '✅' : '❌');
const cardCnt = await page.locator('.card').count();
console.log('长按未直接新建卡片:', cardCnt === 1 ? '✅' : '❌ 直接新建了');

await browser.close();
process.exit(0);