// 验证：图片导出（浏览器默认下载路径）触发
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

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
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);

await page.click('button[aria-label="导出"]');
await page.waitForTimeout(500);
await page.click('button:has-text("画布 8K 图片")');
await page.waitForTimeout(500);
let imgOk = false;
for (let i = 0; i < 40; i++) {
  imgOk = (await page.locator('.modal img').count()) > 0;
  if (imgOk) break;
  await page.waitForTimeout(500);
}
check('图片预览已生成', imgOk);
if (imgOk) {
  const dlImg = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.click('.btn:has-text("⤓ 浏览器默认下载")');
  const im = await dlImg;
  check('图片导出触发下载', !!im, im?.suggestedFilename());
} else {
  check('图片导出触发下载', false, '预览未生成（8K 生成超时）');
}
console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();