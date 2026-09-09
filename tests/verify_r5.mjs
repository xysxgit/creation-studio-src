import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); };

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));
await page.goto(URL);
await page.waitForSelector('.welcome');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');

// ===== 1. 新建项目默认空白画布 =====
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(600);
const blankCards = await page.locator('.card').count();
ok('新建项目默认空白画布', blankCards === 0, String(blankCards));
// 回到欢迎页重新建带样例
await page.evaluate(() => { localStorage.removeItem('cs.current'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(800);
ok('勾选样例后有卡片', (await page.locator('.card').count()) >= 12);

// ===== 2. 工具「编辑」改名「选择」=====
await page.click('.zc-fab');
await page.waitForTimeout(200);
const toolText = await page.locator('.zc-tools').innerText();
ok('工具改名为选择', toolText.includes('选择') && !toolText.includes('编辑'), toolText.replace(/\n/g, '/'));
await page.click('.zc-close');

// ===== 3. 检查器模式：预览/浏览 + 浏览滚动 =====
const card = page.locator('.card').nth(2);
await card.click({ position: { x: 150, y: 100 } });
await page.waitForTimeout(200);
const modeBtns = await page.locator('.inspector .btn:has-text("浏览")').count();
ok('检查器预览/浏览模式按钮', modeBtns === 1);
await page.locator('.inspector .btn:has-text("浏览")').click();
await page.waitForTimeout(300);
const locked = await card.evaluate((el) => el.classList.contains('locked'));
ok('浏览模式=固定', locked);
const bodyScroll = await card.locator('.card-body').evaluate((el) => getComputedStyle(el).overflowY);
ok('浏览模式正文可滚动', bodyScroll === 'auto', bodyScroll);
await page.locator('.inspector .btn:has-text("预览")').click();
await page.waitForTimeout(300);
const unlocked = await card.evaluate((el) => !el.classList.contains('locked'));
ok('预览模式=可拖动', unlocked);

// ===== 4. 模板样板内容 =====
await page.locator('.sb-tabs button:has-text("灵感")').click();
await page.waitForTimeout(200);
await page.click('.ideas .sb-tabs button:has-text("模板")');
await page.waitForTimeout(300);
await page.locator('.tpl-item:has-text("重要角色卡")').first().click();
await page.waitForTimeout(500);
const tplHtml = await page.locator('.card').last().locator('.rich-static').innerHTML();
ok('模板卡含样板内容', tplHtml.includes('示例') || tplHtml.length > 200, tplHtml.length + '字符');
await page.locator('.sb-tabs button:has-text("分区")').click();
await page.keyboard.press('Escape');

// ===== 5. 大纲：分区样式 + 折叠 + 排序 =====
await page.locator('.sb-tabs button:has-text("编组")').click();
await page.waitForTimeout(300);
const secTitle = await page.locator('.outline-sec-title').first().innerText();
ok('大纲按分区显示', secTitle.includes('大纲') || secTitle.includes('世界观'), secTitle.slice(0, 20));
await page.locator('.outline-sec-title .g-fold').first().click();
await page.waitForTimeout(300);
const foldedCount = await page.locator('.outline-sec:has-text("已折叠")').count();
ok('大纲分区折叠', foldedCount >= 1);
await page.locator('.outline-sec-title .g-fold').first().click();
await page.waitForTimeout(300);
await page.hover('.outline-item >> nth=0');
const sortUp = await page.locator('.outline-item .outline-actions button[title="上移"]').count();
ok('大纲分区内排序', sortUp >= 1, String(sortUp));

ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 1).join(' | '));

// ===== 移动端：长按 → 多选 → 点选多张 =====
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const mp = await mctx.newPage();
await mp.goto(URL);
await mp.waitForSelector('.welcome');
await mp.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await mp.reload();
await mp.waitForSelector('.welcome');
await mp.click('text=＋ 新建项目');
await mp.click('.type-card:has-text("小说")');
await mp.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await mp.locator('.modal-actions .btn.primary').tap();
await mp.waitForSelector('.canvas-wrap');
await mp.waitForTimeout(800);
const cdp = await mctx.newCDPSession(mp);
await mp.locator('.zc-fab').tap();
await mp.waitForTimeout(200);
await mp.locator('.zc-zoom button[title="适配视图"]').tap();
await mp.waitForTimeout(600);
await mp.locator('.zc-close').tap();
await mp.waitForTimeout(250);
const longPress = async (x, y, ms = 650) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 300));
};
const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 40));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 150));
};
// 长按卡片 → 菜单 → 多选
const cardA = await mp.locator('.card').nth(0).elementHandle();
const ca = await cardA.boundingBox();
await longPress(ca.x + ca.width / 2, ca.y + 20);
await mp.waitForTimeout(200);
const hasMulti = await mp.locator('.ctx-menu button:has-text("多选")').count();
ok('长按菜单含多选', hasMulti === 1);
await mp.locator('.ctx-menu button:has-text("多选")').tap();
await mp.waitForTimeout(300);
const multiBar = await mp.locator('.multi-bar').count();
ok('多选模式浮动条', multiBar === 1);
// 轻点另外两张卡加入选择
const cardB = await mp.locator('.card').nth(1).elementHandle();
const cardC = await mp.locator('.card').nth(2).elementHandle();
const cb = await cardB.boundingBox();
const cc = await cardC.boundingBox();
await tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
await tap(cc.x + cc.width / 2, cc.y + cc.height / 2);
await mp.waitForTimeout(300);
const selN = await mp.locator('.card.selected').count();
ok('触屏点选多张', selN === 3, String(selN));
// 完成
await mp.locator('.multi-bar button:has-text("完成")').tap();
await mp.waitForTimeout(300);
ok('多选完成退出', (await mp.locator('.multi-bar').count()) === 0);

console.log('\n========== 第五轮新功能验证 ==========');
results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith('✓')) ? '\n🎉 全部通过' : '\n❌ 有失败项');
await browser.close();
