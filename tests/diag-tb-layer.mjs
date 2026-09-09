// 富文本工具栏布局 + 图层选中同步诊断
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")'); await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap'); await page.waitForTimeout(500);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300); await page.waitForTimeout(600);
await page.locator('.rich-editor-body').click(); await page.waitForTimeout(200);

// ===== 工具栏按钮布局 =====
const layout = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.rich-toolbar .rtb')];
  const info = btns.map((b) => ({ t: (b.getAttribute('title') || '').slice(0, 6), x: Math.round(b.getBoundingClientRect().x), y: Math.round(b.getBoundingClientRect().y) }));
  const toolbar = document.querySelector('.rich-toolbar').getBoundingClientRect();
  // 按行分组
  const rows = {};
  for (const b of info) { const r = b.y; if (!rows[r]) rows[r] = []; rows[r].push(b.t); }
  return { info, rows: Object.values(rows).map(row => row.join('|')), tbW: Math.round(toolbar.width) };
});
console.log('工具栏宽:', layout.tbW);
console.log('行分布:', JSON.stringify(layout.rows));
console.log('左/中/右位置:', JSON.stringify(layout.info.filter(b => ['左对齐','居中','右对齐'].some(n => b.t.startsWith(n)))));
await page.screenshot({ path: '/root/创作助手/tools/shot-tb.png' });

// 退出编辑
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// ===== 图层选中同步 =====
await page.click('button[title="图层"]').catch(() => {}); // 若有顶层图层按钮
// 打开左侧面板图层面板
await page.click('.sb-tabs button:has-text("图层")').catch(() => {});
await page.waitForTimeout(400);
// 建第二张卡（不同位置）
await page.mouse.dblclick(box.x + 700, box.y + 300); await page.waitForTimeout(500);
// 选中第一张卡
await page.locator('.card').first().click(); await page.waitForTimeout(400);
const a1 = await page.evaluate(() => document.querySelectorAll('.layer-item')[0]?.className);
const active1 = await page.evaluate(() => !!document.querySelector('.layer-item.active'));
// 选中另一张卡
await page.locator('.card').last().click(); await page.waitForTimeout(400);
const active2 = await page.evaluate(() => !!document.querySelector('.layer-item.active'));
const ai = await page.evaluate(() => { const a=document.querySelectorAll('.layer-item.active'); const t=a[0]?.querySelector('.layer-title')?.textContent; return t || ''; });
console.log('图层active1:', active1, '| active2:', active2, '| active标题:', ai);

await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));