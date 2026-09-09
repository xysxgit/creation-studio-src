import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function openProject(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
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
  return { ctx, page };
}

// ===== 桌面展开态标题位置 =====
{
  const { ctx, page } = await openProject(1440, 900);
  const info = await page.evaluate(() => {
    const tb = document.querySelector('.topbar').getBoundingClientRect();
    const title = document.querySelector('.tb-title-inner').getBoundingClientRect();
    const logo = document.querySelector('.tb-logo').getBoundingClientRect();
    return { tbC: tb.left + tb.width / 2, titleC: title.left + title.width / 2, logoL: logo.left, tbL: tb.left, tbW: tb.width, grid: getComputedStyle(document.querySelector('.tb-title-row')).gridTemplateColumns };
  });
  console.log('桌面展开: 顶栏中心', Math.round(info.tbC), '标题中心', Math.round(info.titleC), '差', Math.round(info.titleC - info.tbC), 'grid', info.grid);
  console.log('标题居中:', Math.abs(info.titleC - info.tbC) < 30 ? '✅' : '❌ 偏左');
  await ctx.close();
}

// ===== 手机横屏：左右栏可折叠 =====
{
  const { ctx, page } = await openProject(812, 375);
  const mode = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-left');
    const cs = getComputedStyle(el);
    return { pos: cs.position, transform: cs.transform };
  });
  console.log('横屏侧栏: position=' + mode.pos, mode.pos === 'fixed' ? '✅ 抽屉可折叠' : '❌ 常显');
  // 打开左栏
  await page.click('.tb-menu-icon');
  await page.waitForTimeout(400);
  const open1 = await page.evaluate(() => document.querySelector('.sidebar-left').classList.contains('open'));
  console.log('横屏☰打开左栏:', open1 ? '✅' : '❌');
  // 收起（点遮罩）
  await page.click('.drawer-mask').catch(() => {});
  await page.waitForTimeout(300);
  const open2 = await page.evaluate(() => document.querySelector('.sidebar-left').classList.contains('open'));
  console.log('横屏点遮罩收起左栏:', !open2 ? '✅' : '❌');
  await ctx.close();
}

// ===== 手机竖屏：侧栏宽度折中 =====
{
  const { ctx, page } = await openProject(375, 812);
  await page.click('.tb-menu-icon');
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => document.querySelector('.sidebar-left').getBoundingClientRect().width);
  console.log('竖屏侧栏宽:', Math.round(w), 'px', w <= 225 ? '✅ 不再很宽' : '❌ ' + Math.round(w));
  await ctx.close();
}

// ===== 竖屏折叠：顶栏高 vs 侧栏padding，确认不遮挡 =====
{
  const { ctx, page } = await openProject(375, 812);
  await page.click('.tb-collapse-btn');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const tb = document.querySelector('.topbar').getBoundingClientRect();
    const sb = document.querySelector('.sidebar-left');
    const pad = parseFloat(getComputedStyle(sb).paddingTop);
    return { tbH: Math.round(tb.height), pad };
  });
  console.log('竖屏折叠: 顶栏高', info.tbH, '侧栏padding', info.pad, info.pad >= info.tbH ? '✅ 无遮挡' : '❌ 遮挡');
  await ctx.close();
}

await browser.close();
process.exit(0);