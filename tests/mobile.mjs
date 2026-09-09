// 移动端触屏端到端测试（Playwright 移动视口 + CDP 触摸事件）
import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
let failures = 0;
function ok(name, cond, extra = '') {
  results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));

async function tap(x, y) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 40));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 120));
}
async function touchDrag(from, to, steps = 8, stepMs = 16) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 250));
}
async function pinch(c1a, c2a, c1b, c2b, steps = 8) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c1a, c2a] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p1 = { x: c1a.x + (c1b.x - c1a.x) * t, y: c1a.y + (c1b.y - c1a.y) * t };
    const p2 = { x: c2a.x + (c2b.x - c2a.x) * t, y: c2a.y + (c2b.y - c2a.y) * t };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p1, p2] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 300));
}
async function longPress(x, y, ms = 620) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 250));
}
const zoomText = async () => {
  const t = await page.locator('.statusbar').innerText();
  const m = t.match(/缩放 (\d+)%/);
  return m ? m[1] + '%' : '?';
};

// ===== 1. 移动端加载 + 新建项目 =====
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 10000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.locator('.welcome-actions .btn:has-text("新建项目")').tap();
await page.waitForSelector('.type-card', { timeout: 8000 });
await page.locator('.type-card:has-text("小说")').tap();
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.locator('.modal-actions .btn.primary').tap();
await page.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page.waitForTimeout(800);
ok('1. 手机视口新建项目', (await page.locator('.card').count()) >= 12, String(await page.locator('.card').count()));

// ===== 2. 移动顶栏按钮 =====
const burgerVisible = await page.locator('button[title="分区与大纲"]').isVisible();
ok('2. 移动端 ☰ 抽屉按钮可见', burgerVisible);

// ===== 3. 左侧抽屉 =====
await page.locator('button[title="分区与大纲"]').tap();
await page.waitForTimeout(400);
const drawerOpen = await page.locator('.sidebar-left.open').count();
ok('3. 左侧抽屉打开', drawerOpen === 1);
await page.locator('button[title="分区与大纲"]').tap();
await page.waitForTimeout(350);
const drawerClosed = await page.locator('.sidebar-left.open').count();
ok('4. 再次点击按钮关闭抽屉', drawerClosed === 0);

// ===== 5. 触摸拖动卡片 =====
const cardH = await page.locator('.card').nth(1).elementHandle();
const b1 = await cardH.boundingBox();
await touchDrag({ x: b1.x + b1.width / 2, y: b1.y + b1.height / 2 }, { x: b1.x + b1.width / 2 + 130, y: b1.y + b1.height / 2 + 110 });
const b2 = await cardH.boundingBox();
ok('5. 触摸拖动卡片', Math.abs(b2.x - b1.x) > 60 && Math.abs(b2.y - b1.y) > 50, `(${Math.round(b1.x)},${Math.round(b1.y)})→(${Math.round(b2.x)},${Math.round(b2.y)})`);

// ===== 6. 空白处单指平移画布 =====
const z0 = await zoomText();
const wrapBox = await page.locator('.canvas-wrap').boundingBox();
// 找空白处：画布左侧中部（卡片上方区域，避开缩放控件）
const emptyX = wrapBox.x + wrapBox.width - 60;
const emptyY = wrapBox.y + 80;
await touchDrag({ x: emptyX, y: emptyY }, { x: emptyX + 30, y: emptyY + 40 });
const z1 = await zoomText();
ok('6. 单指平移不改变缩放', z0 === z1, `${z0} vs ${z1}`);

// ===== 7. 双指捏合缩放 =====
const cx = wrapBox.x + wrapBox.width / 2;
const cy = wrapBox.y + wrapBox.height / 2;
await pinch({ x: cx - 40, y: cy }, { x: cx + 40, y: cy }, { x: cx - 100, y: cy }, { x: cx + 100, y: cy });
const z2 = await zoomText();
ok('7. 双指外扩放大', z2 !== z0, `${z0} → ${z2}`);

// ===== 8. 长按卡片 → 菜单（先适配视图保证目标在屏内）=====
await page.locator('.zc-fab').tap();
await page.waitForTimeout(200);
await page.locator('.zc-zoom button[title="适配视图"]').tap();
await page.waitForTimeout(600);
await page.locator('.zc-close').tap();
await page.waitForTimeout(250);
const cardA = await page.locator('.card').nth(2).elementHandle();
const ca = await cardA.boundingBox();
await longPress(ca.x + ca.width / 2, Math.min(ca.y + 30, ca.y + ca.height - 5));
const menuVisible = await page.locator('.ctx-menu').count();
ok('8. 长按弹出菜单', menuVisible === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ===== 9. 双击卡片 → 编辑器 =====
const cardB = await page.locator('.card').nth(0).elementHandle();
const cb = await cardB.boundingBox();
const cx0 = cb.x + cb.width / 2;
const cy0 = cb.y + cb.height / 2;
await tap(cx0, cy0);
await tap(cx0, cy0);
await page.waitForSelector('.rich-editor', { timeout: 6000 });
ok('9. 双击打开富文本编辑器', true);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ===== 10. 右侧抽屉（灵感）=====
const ideaBtn = page.locator('button[title="灵感与检查器"]');
if (await ideaBtn.isVisible()) {
  await ideaBtn.click();
  await page.waitForTimeout(400);
  ok('10. 右侧灵感抽屉打开', (await page.locator('.sidebar-right.open').count()) === 1);
  await ideaBtn.click();
  await page.waitForTimeout(300);
} else {
  ok('10. 右侧灵感抽屉打开', false, '按钮不可见');
}

// ===== 11. 无 JS 错误 =====
ok('11. 无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

console.log('\n========== 移动端触屏测试 ==========');
results.forEach((r) => console.log(r));
console.log(failures === 0 ? '\n🎉 全部通过' : `\n❌ ${failures} 项失败`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
