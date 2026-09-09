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

// 获取世界坐标（用卡片视觉宽/170 推算 zoom）
async function worldAt(sx, sy) {
  return await page.evaluate(([x, y]) => {
    const cc = document.querySelector('.canvas-cards');
    const card = document.querySelector('.card');
    if (!cc || !card) return null;
    const r = cc.getBoundingClientRect();
    const zoom = card.getBoundingClientRect().width / 170;
    return { wx: (x - r.left) / zoom, wy: (y - r.top) / zoom, zoom: Math.round(zoom * 100) / 100 };
  }, [sx, sy]);
}

// 鼠标在 (box.x+700, box.y+400)（卡片右侧远处空白），记录该点世界坐标
const sx = box.x + 700;
const sy = box.y + 400;
const before = await worldAt(sx, sy);
console.log('缩放前: 世界', before ? Math.round(before.wx) + ',' + Math.round(before.wy) + ' zoom=' + before.zoom : 'null');

// 滚轮放大（鼠标保持在此处）
await page.mouse.move(sx, sy);
await page.keyboard.down('Control');
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const after = await worldAt(sx, sy);
console.log('缩放后: 世界', after ? Math.round(after.wx) + ',' + Math.round(after.wy) + ' zoom=' + after.zoom : 'null');

if (before && after) {
  const dx = Math.abs(before.wx - after.wx);
  const dy = Math.abs(before.wy - after.wy);
  console.log('鼠标下世界点漂移:', Math.round(dx) + ',' + Math.round(dy), 'px', dx < 8 && dy < 8 ? '✅ 跟手' : '❌ 不跟手(漂移)');
} else {
  console.log('❌ 无法测量');
}

// 对照：选中卡片时滚轮也应跟手（不锚定卡片中心）
await page.locator('.card').click();
await page.waitForTimeout(300);
const b2 = await worldAt(sx, sy);
await page.mouse.move(sx, sy);
await page.keyboard.down('Control');
for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const a2 = await worldAt(sx, sy);
if (b2 && a2) {
  const dx = Math.abs(b2.wx - a2.wx);
  console.log('有选中卡片时漂移:', Math.round(dx) + 'px', dx < 8 ? '✅ 仍跟手' : '❌ 锚定到卡片');
}
await browser.close();
process.exit(0);