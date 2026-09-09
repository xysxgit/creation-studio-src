import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];

async function openProject(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
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
}

// ===== 桌面宽屏（1440）=====
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await openProject(page, 1440, 900);
  const sw = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sidebar-left')).width));
  console.log('桌面侧栏:', sw, 'px', sw === 168 ? '✅ 保持168px' : '❌ ' + sw);
  // 折叠后标题仍在
  await page.click('.tb-collapse-btn');
  await page.waitForTimeout(300);
  const titleVis = await page.locator('.tb-title-row').isVisible();
  const actionsVis = await page.locator('.tb-actions-row').isVisible().catch(() => false);
  const collapseBtnText = await page.locator('.tb-collapse-btn').textContent();
  console.log('折叠后标题行:', titleVis ? '✅ 保留' : '❌', 'actions隐藏:', actionsVis === false ? '✅' : '❌', '按钮:', collapseBtnText.trim());
  const h = await page.locator('.topbar').boundingBox();
  console.log('折叠顶栏高度:', Math.round(h.height), h.height < 60 ? '✅' : '❌');
  await page.click('.tb-collapse-btn');
  await page.waitForTimeout(200);
  await ctx.close();
}

// ===== 手机横屏（812x375）=====
{
  const ctx = await browser.newContext({ viewport: { width: 812, height: 375 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await openProject(page, 812, 375);
  // 横屏侧栏宽度（抽屉打开后）
  await page.click('.tb-menu-icon').catch(() => {});
  await page.waitForTimeout(400);
  const sw2 = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-left');
    const r = el.getBoundingClientRect();
    return r.width;
  });
  console.log('横屏侧栏:', Math.round(sw2), 'px', sw2 >= 195 && sw2 <= 205 ? '✅ 折中200px' : '❌ ' + Math.round(sw2));
  // 折叠后：标题+☰+💡保留，侧栏顶部预留减小
  await page.click('.tb-collapse-btn');
  await page.waitForTimeout(300);
  const titleVis2 = await page.locator('.tb-title-row').isVisible();
  const menuIcon = await page.locator('.tb-menu-icon').isVisible();
  const inspireIcon = await page.locator('.tb-inspire-icon').isVisible();
  console.log('横屏折叠后标题行:', titleVis2 ? '✅' : '❌', '☰按钮:', menuIcon ? '✅' : '❌', '💡按钮:', inspireIcon ? '✅' : '❌');
  const padTop = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-left');
    return parseFloat(getComputedStyle(el).paddingTop);
  });
  console.log('折叠后侧栏padding-top:', Math.round(padTop), 'px', padTop < 100 ? '✅ 预留减小(无遮挡)' : '❌ 仍112px遮挡');
  const h2 = await page.locator('.topbar').boundingBox();
  console.log('横屏折叠顶栏高度:', Math.round(h2.height), h2.height < 60 ? '✅' : '❌');
  await ctx.close();
}

// ===== 手机竖屏（375x812）=====
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await openProject(page, 375, 812);
  await page.click('.tb-menu-icon').catch(() => {});
  await page.waitForTimeout(400);
  await page.click('.tb-collapse-btn');
  await page.waitForTimeout(300);
  const padTop3 = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-left');
    return parseFloat(getComputedStyle(el).paddingTop);
  });
  console.log('竖屏折叠后侧栏padding-top:', Math.round(padTop3), 'px', padTop3 < 100 ? '✅' : '❌');
  const menuV = await page.locator('.tb-menu-icon').isVisible();
  console.log('竖屏折叠后☰按钮:', menuV ? '✅' : '❌');
  await ctx.close();
}

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);