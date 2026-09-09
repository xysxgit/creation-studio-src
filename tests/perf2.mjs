// 页内性能测量：长任务统计 + 打字耗时分解
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(700);
}
console.log('卡片数:', await page.locator('.card').count());

const cardBox = await page.locator('.card').first().boundingBox();
await page.mouse.dblclick(cardBox.x + cardBox.width / 2, cardBox.y + 40);
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.click('.fe-body .rich-editor-body');

// 页内观察者：长任务 + 每字符键盘输入计时
await page.evaluate(() => {
  window.__perf = { long: [], keys: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.long.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* ignore */ }
  document.addEventListener('keydown', () => { window.__perf.keys.push(performance.now()); }, true);
});
const text = '性能测试输入文本。'.repeat(12);
await page.keyboard.type(text, { delay: 0 });
await page.waitForTimeout(1500);
const perf = await page.evaluate(() => ({
  long: window.__perf.long,
  keyCount: window.__perf.keys.length,
  historyLen: document.querySelectorAll('.history-item').length,
}));
console.log('长任务:', perf.long);
console.log('总长任务时长:', perf.long.reduce((a, b) => a + b, 0), 'ms, 次数:', perf.long.length, '字符数:', text.length);
console.log('历史条目数:', perf.historyLen);
await browser.close();
