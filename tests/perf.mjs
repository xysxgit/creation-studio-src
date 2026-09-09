// 性能测量：大量卡片下的打字延迟 / 平移流畅度 / 启动时间
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const t0 = Date.now();
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
const tWelcome = Date.now() - t0;
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
const tProject = Date.now() - t0;

for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(700);
}
const cardCount = await page.locator('.card').count();
console.log('卡片数:', cardCount);

// 打字延迟：全屏编辑输入，测量平均每字符耗时
const cardBox = await page.locator('.card').first().boundingBox();
await page.mouse.dblclick(cardBox.x + cardBox.width / 2, cardBox.y + 40);
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.click('.fe-body .rich-editor-body');
const text = '性能测试输入文本。'.repeat(12);
const tp0 = Date.now();
await page.keyboard.type(text, { delay: 0 });
const typeMs = Date.now() - tp0;
console.log(`打字 ${text.length} 字符耗时 ${typeMs}ms → ${(typeMs / text.length).toFixed(1)}ms/字符`);

// 平移流畅度：拖动画布，统计 >50ms 长帧
const wrap = await page.locator('.canvas-wrap').boundingBox();
const measure = await page.evaluate(() => new Promise((resolve) => {
  const longFrames = [];
  let last = performance.now();
  const loop = (t) => { const gap = t - last; last = t; if (gap > 50) longFrames.push(Math.round(gap)); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setTimeout(() => resolve(longFrames), 2400);
}));
await page.keyboard.press('Escape'); // 关闭全屏编辑器
await page.waitForTimeout(300);
await page.mouse.move(wrap.x + 700, wrap.y + 400);
await page.mouse.down();
for (let i = 0; i < 24; i++) {
  await page.mouse.move(wrap.x + 700 - i * 18, wrap.y + 400 + i * 9);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(2600);
console.log('平移期间 >50ms 长帧数:', measure.length, '样例:', measure.slice(0, 6).join(','));

const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));
console.log('JS 堆内存:', mem, 'MB');
console.log(`启动: 欢迎页 ${tWelcome}ms, 项目就绪 ${tProject}ms`);
await browser.close();
