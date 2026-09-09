import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
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

// 建几张卡片 + 一个分区 + 一个编组
await page.evaluate(() => {
  const st = window.__STUDIO__ ? window.__STUDIO__ : null;
});
// 通过 UI 建卡片：双击画布
const canvas = await page.locator('.canvas-wrap');
const box = await canvas.boundingBox();
await page.mouse.dblclick(box.x + 300, box.y + 200);
await page.waitForTimeout(300);
await page.mouse.dblclick(box.x + 500, box.y + 200);
await page.waitForTimeout(300);

// ===== 1) 分区 tab：选中色条 + 删除分区及内容 =====
await page.click('.sb-tabs button:has-text("分区")');
await page.waitForTimeout(300);
// 模板预置分区，直接选「世界观」
const secName = '世界观';
const secCount = await page.locator('.sec-item').count();
console.log('分区数:', secCount, secCount >= 2 ? '✅' : '❌');
// 选中分区 → 有左侧色条
const secLoc = page.locator('.sec-item').nth(1);
await secLoc.click();
await page.waitForTimeout(300);
const borderLeft = await page.evaluate((nm) => {
  const el = [...document.querySelectorAll('.sec-item')].find((x) => x.textContent.includes(nm));
  return getComputedStyle(el).borderLeftWidth;
}, secName.slice(0, 2));
console.log('分区选中色条:', borderLeft === '3px' ? '✅ 3px色条' : '❌ ' + borderLeft);
// 行内 🗑 存在（删除分区及内容入口）
await page.evaluate(() => { document.querySelectorAll('.sec-item')[1].classList.add('hover'); });
const hasRowDel = await page.evaluate(() => {
  const el = document.querySelectorAll('.sec-item')[1];
  return el.querySelector('button[title="删除分区及内容"]') !== null;
});
console.log('行内「删除分区及内容」按钮:', hasRowDel ? '✅' : '❌');

// ===== 2) 编组 tab：文件夹视图 =====
await page.evaluate(() => { [...document.querySelectorAll('.sb-tabs button')].find((b) => b.textContent.includes('编组')).click(); });
await page.waitForTimeout(300);
const panelText = await page.locator('.outline-body').textContent();
console.log('无「＋新建文件夹」:', !panelText.includes('＋ 新建文件夹') ? '✅ 已删除' : '❌ 还在');
console.log('有「未编组」:', panelText.includes('未编组') ? '✅' : '❌');

// 用 UI：编组tab里点击卡片多选
const items = await page.locator('.outline-item').count();
console.log('编组tab卡片条目:', items);
// 点击第一张卡片（多选模式默认multi）
if (items > 0) {
  await page.evaluate(() => { document.querySelector('.outline-item')?.click(); });
  await page.waitForTimeout(200);
}
// 若出现编组所选按钮 → 说明多选生效
const hasGroupBtn = await page.locator('.layer-toolbar:has-text("编组所选")').count();
console.log('多选后出现编组所选:', hasGroupBtn > 0 ? '✅' : items > 1 ? '❌' : '（仅一张卡，需两张）');

// ===== 3) 图层 tab：精简 =====
await page.evaluate(() => { [...document.querySelectorAll('.sb-tabs button')].find((b) => b.textContent.includes('图层')).click(); });
await page.waitForTimeout(300);
const layerText = await page.locator('.layers-body').textContent();
console.log('图层无回收站:', !layerText.includes('回收站') ? '✅' : '❌');
console.log('图层无编组按钮:', !layerText.includes('编组') ? '✅' : '❌');
console.log('图层无对齐:', !layerText.includes('对齐') ? '✅' : '❌');
const layerItems = await page.locator('.layer-item').count();
console.log('图层条目数:', layerItems, layerItems > 0 ? '✅' : '❌');

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);