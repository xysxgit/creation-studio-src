import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];

// ===== 桌面（横屏）场景 =====
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
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
await page.waitForTimeout(600);

// 侧栏宽度
const sw = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar-left')).width);
console.log('桌面侧栏宽度:', sw, parseFloat(sw) >= 200 ? '✅ 已恢复(≥200px)' : '❌ 太窄');
// 折叠按钮存在
const btn = page.locator('.tb-collapse-btn');
console.log('折叠按钮可见:', await btn.isVisible() ? '✅' : '❌');
// 折叠
await btn.click();
await page.waitForTimeout(300);
const titleRowHidden = await page.locator('.tb-title-row').isVisible().catch(() => false);
const actionsHidden = await page.locator('.tb-actions-row').isVisible().catch(() => false);
const collapsedClass = await page.locator('.topbar').getAttribute('class');
console.log('折叠后title行隐藏:', titleRowHidden === false ? '✅' : '❌', 'actions行隐藏:', actionsHidden === false ? '✅' : '❌');
const topbarH = await page.locator('.topbar').boundingBox();
console.log('折叠后顶栏高度:', Math.round(topbarH.height), topbarH.height < 60 ? '✅ 紧凑' : '❌');
// 展开
await page.click('.tb-collapse-btn');
await page.waitForTimeout(300);
const titleBack = await page.locator('.tb-title-row').isVisible();
console.log('展开后title行恢复:', titleBack ? '✅' : '❌');
// 折叠状态持久化
await btn.click(); await page.waitForTimeout(200);
await page.reload(); await page.waitForTimeout(800);
await page.waitForSelector('.topbar');
const persist = await page.locator('.topbar').getAttribute('class');
console.log('刷新后折叠保持:', persist.includes('collapsed') ? '✅' : '❌');
await page.click('.tb-collapse-btn'); // 恢复展开
await page.waitForTimeout(200);
await ctx.close();

// ===== 横屏（手机横屏，窄屏）场景 =====
const ctx2 = await browser.newContext({ viewport: { width: 812, height: 375 } });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push(String(e)));
await page2.goto('http://localhost:8787/');
await page2.waitForSelector('.welcome', { timeout: 8000 });
await page2.evaluate(() => { localStorage.setItem('cs.helpSeen', '1'); });
await page2.reload();
await page2.waitForSelector('.welcome');
await page2.click('text=＋ 新建项目');
await page2.click('.type-card:has-text("小说")');
await page2.click('.modal-actions .btn.primary');
await page2.waitForSelector('.canvas-wrap');
await page2.waitForTimeout(600);
// 打开侧栏（抽屉）
await page2.click('.tb-menu-icon').catch(() => {});
await page2.waitForTimeout(400);
const sw2 = await page2.evaluate(() => {
  const el = document.querySelector('.sidebar-left');
  const r = el.getBoundingClientRect();
  return { w: r.width, display: getComputedStyle(el).display, transform: getComputedStyle(el).transform };
});
console.log('横屏侧栏实际宽度:', Math.round(sw2.w), sw2.w >= 200 ? '✅ 已恢复(≥200px)' : '❌ 太窄(' + Math.round(sw2.w) + ')');
// 横屏折叠按钮
const btn2 = page2.locator('.tb-collapse-btn');
console.log('横屏折叠按钮可见:', await btn2.isVisible() ? '✅' : '❌');
await btn2.click();
await page2.waitForTimeout(300);
const tb2 = await page2.locator('.topbar').boundingBox();
console.log('横屏折叠后顶栏高度:', Math.round(tb2.height), tb2.height < 50 ? '✅ 折叠生效' : '❌');
await page2.click('.tb-collapse-btn');
console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);