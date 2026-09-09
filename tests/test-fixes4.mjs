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

// 1) 画两条笔画
await page.click('.zc-fab'); await page.waitForTimeout(300);
await page.click('.zc-tool:has-text("画笔")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 250, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 450, wb.y + 400, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
await page.mouse.move(wb.x + 250, wb.y + 500); await page.mouse.down();
await page.mouse.move(wb.x + 450, wb.y + 500, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
console.log('笔画数:', await page.locator('.annotation-g').count());

// 2) 画笔模式下点击笔画 → 不应选中（保持连续作画）
await page.mouse.click(wb.x + 350, wb.y + 400);
await page.waitForTimeout(300);
const selPen = await page.locator('.annotation-g.selected').count();
console.log('画笔模式点笔画选中数:', selPen, selPen === 0 ? '✅ 不选中' : '❌ 仍选中');

// 3) 橡皮：涂抹擦除一条笔画
await page.click('.zc-tool:has-text("橡皮")'); await page.waitForTimeout(300);
await page.mouse.move(wb.x + 350, wb.y + 400); await page.mouse.down();
await page.mouse.move(wb.x + 350, wb.y + 400, { steps: 2 }); await page.mouse.up();
await page.waitForTimeout(300);
const annAfter = await page.locator('.annotation-g').count();
console.log('橡皮点击擦除后笔画数:', annAfter, annAfter === 1 ? '✅ 橡皮可用' : '❌ 橡皮无效');

// 4) 工具名可见性：active 工具 em 颜色非白
const emColor = await page.evaluate(() => {
  const t = document.querySelector('.zc-tool.active');
  const em = t?.querySelector('em');
  return em ? getComputedStyle(em).color : null;
});
console.log('active 工具名颜色:', emColor, emColor !== 'rgb(255, 255, 255)' ? '✅ 可见' : '❌ 白色不可见');

// 5) 横竖屏切换：侧栏宽度变化
const wBefore = await page.locator('.sidebar-left').evaluate((el) => el.getBoundingClientRect().width);
await page.click('button[aria-label="切换横竖屏"]');
await page.waitForTimeout(500);
const wAfter = await page.locator('.sidebar-left').evaluate((el) => el.getBoundingClientRect().width);
console.log('侧栏宽度:', Math.round(wBefore), '→', Math.round(wAfter), Math.abs(wAfter - wBefore) > 20 ? '✅ 切换生效' : '❌ 无变化');

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);