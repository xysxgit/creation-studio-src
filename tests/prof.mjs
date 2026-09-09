// CDP CPU profile：单次按键的耗时分布
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
const cardBox = await page.locator('.card').first().boundingBox();
await page.mouse.dblclick(cardBox.x + cardBox.width / 2, cardBox.y + 40);
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.click('.fe-body .rich-editor-body');

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
await page.keyboard.type('测', { delay: 0 });
await page.waitForTimeout(300);
const { profile } = await cdp.send('Profiler.stop');

// 聚合：按函数自耗时排序
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const selfTime = new Map();
for (const n of profile.nodes) {
  const st = (n.hitCount || 0) * (profile.samplesDuration ? 0 : 1); // hitCount 不一定可用
}
// 用样本统计
const selfMs = new Map();
for (const sid of profile.samples) {
  const n = byId.get(sid);
  if (!n) continue;
  const key = n.callFrame.functionName + ' @ ' + n.callFrame.url.split('/').pop() + ':' + n.callFrame.lineNumber;
  selfMs.set(key, (selfMs.get(key) || 0) + 1);
}
const total = profile.samples.length;
const top = [...selfMs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log('总样本数:', total, '≈', (total * 1).toFixed(0), 'ms(1ms/样本)');
for (const [k, v] of top) {
  console.log(`${(v / total * 100).toFixed(1)}%  ${v}  ${k.slice(0, 100)}`);
}
await browser.close();
