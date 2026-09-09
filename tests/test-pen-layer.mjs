import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
const wb = await page.locator('.canvas-wrap').boundingBox();
// 新建一张卡片
await page.mouse.dblclick(wb.x + 300, wb.y + 200);
await page.waitForTimeout(600);
// 选画笔，画一条穿过卡片的线
await page.click('.zc-fab'); await page.waitForTimeout(300);
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 200, wb.y + 350); await page.mouse.down();
await page.mouse.move(wb.x + 500, wb.y + 350, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(400);
// 层级检查：annotations z-index > 卡片
const layers = await page.evaluate(() => {
  const ann = document.querySelector('.annotations-layer');
  const card = document.querySelector('.card');
  if (!ann || !card) return null;
  const az = parseInt(getComputedStyle(ann).zIndex);
  const cz = parseInt(getComputedStyle(card).zIndex);
  return { az, cz, annOnTop: az > cz };
});
console.log('层级: annotations z=', layers?.az, 'card z=', layers?.cz, layers?.annOnTop ? '✅ 笔画在最上层' : '❌ 笔画未在最上层');
// 缩放跟随
const line1 = await page.locator('.annotation-g path.annotation-line').boundingBox();
await page.keyboard.down('Control'); await page.mouse.move(720, 450); await page.mouse.wheel(0, -600); await page.keyboard.up('Control');
await page.waitForTimeout(500);
const line2 = await page.locator('.annotation-g path.annotation-line').boundingBox();
console.log('缩放跟随:', Math.round(line1.width), '→', Math.round(line2.width), 'px', line2.width > line1.width * 1.3 ? '✅ 跟随缩放' : '❌ 未跟随');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);