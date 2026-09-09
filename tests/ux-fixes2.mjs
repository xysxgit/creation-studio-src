// 验证：画笔内容可点选 + 编组面板文件夹化 + zc-tool 选中态样式
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

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

// ===== 1) 画笔：画一条线 → 切 select 点击线 → 选中 =====
// 打开工具面板，选画笔
await page.click('.zc-fab');
await page.waitForTimeout(300);
await page.click('.zc-tool:has-text("画笔")');
await page.waitForTimeout(300);
const wb = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.move(wb.x + 300, wb.y + 400);
await page.mouse.down();
await page.mouse.move(wb.x + 500, wb.y + 400, { steps: 5 });
await page.mouse.move(wb.x + 500, wb.y + 550, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
check('画笔画出标注', (await page.locator('.annotation-g').count()) > 0, `${await page.locator('.annotation-g').count()} 条`);

// 切到框选工具，点击标注线（落在线段路径上）→ 选中高亮
await page.click('.zc-tool:has-text("框选")');
await page.waitForTimeout(300);
await page.mouse.click(wb.x + 500, wb.y + 450);
await page.waitForTimeout(400);
check('画的内容可点选（选中高亮）', (await page.locator('.annotation-g.selected').count()) > 0);

// ===== 2) zc-tool 选中态样式（accent 浅色底 + 指示条）=====
await page.click('.zc-fab');
await page.waitForTimeout(300);
check('工具选中态为浅色底+指示条（非整块纯色）', await page.evaluate(() => {
  const btn = document.querySelector('.zc-tool.active');
  if (!btn) return false;
  const cs = getComputedStyle(btn);
  const after = getComputedStyle(btn, '::after');
  return cs.color !== 'rgb(255, 255, 255)' && after.height === '3px';
}));

// ===== 3) 编组面板：文件夹视图；无「＋新建文件夹」（串到分区已删）、无「添加分区/新建编组」=====
await page.click('.sb-tabs button:has-text("编组")').catch(() => {});
await page.waitForTimeout(400);
const panelText = await page.locator('.outline-body, .sb-body').first().textContent();
check('编组面板无「＋新建文件夹」', !!panelText && !panelText.includes('＋ 新建文件夹'));
check('已去掉「添加分区」和「新建编组」', !!panelText && !panelText.includes('添加分区') && !panelText.includes('新建编组'));
// 未编组区块需画布有卡片才显示（无卡时显示空状态）

const allOk = results.every((r) => r.ok) && !errors.length;
console.log(`\n${allOk ? '🎉 全部通过' : '⚠️ 有失败项'} | JS错误: ${errors.length}`);
await browser.close();
process.exit(allOk ? 0 : 1);