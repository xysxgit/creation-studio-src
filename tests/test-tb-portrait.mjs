import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
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
const info = await page.evaluate(() => {
  const el = document.querySelector('.sidebar-left');
  const cs = getComputedStyle(el);
  return { pos: cs.position, w: Math.round(el.getBoundingClientRect().width), mask: getComputedStyle(document.querySelector('.drawer-mask') || el).display };
});
console.log('平板竖屏(768x1024)侧栏: pos=' + info.pos, info.pos === 'relative' ? '✅ 双栏常显' : '❌', '宽', info.w, 'px');
// 竖屏平板 ☰ 应隐藏（双栏无需）
const menuVisible = await page.locator('.tb-menu-icon').isVisible().catch(() => false);
console.log('平板竖屏☰按钮:', menuVisible ? '❌ 应隐藏' : '✅ 隐藏');
await browser.close();
process.exit(0);