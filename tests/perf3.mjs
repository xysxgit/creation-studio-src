// 分层定位打字性能瓶颈（每次运行独立页面/独立 observer）
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function run(label, hideCss) {
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
  if (hideCss) {
    await page.evaluate((css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, hideCss);
  }
  const cardBox = await page.locator('.card').first().boundingBox();
  await page.mouse.dblclick(cardBox.x + cardBox.width / 2, cardBox.y + 40);
  await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
  await page.click('.fe-body .rich-editor-body');
  const text = '性能测试输入文本。'.repeat(6);
  const t0 = Date.now();
  await page.keyboard.type(text, { delay: 0 });
  await page.waitForTimeout(800);
  const long = await page.evaluate(() => {
    const entries = performance.getEntriesByType('longtask');
    return { n: entries.length, total: entries.reduce((a, e) => a + e.duration, 0) };
  });
  console.log(`${label}: ${text.length}字符 ${Date.now() - t0}ms | 长任务 ${long.n}次 共${Math.round(long.total)}ms → ${(long.total / text.length).toFixed(0)}ms/字符`);
  await page.close();
}

await run('基线(全部渲染)      ');
await run('隐藏迷你地图       ', '.minimap { display: none !important; }');
await run('隐藏连线层+迷你地图 ', '.edges-layer, .edges-hit, .minimap { display: none !important; }');
await run('隐藏卡片+连线+地图  ', '.canvas-cards, .edges-layer, .edges-hit, .minimap { display: none !important; }');
await browser.close();
