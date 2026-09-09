// 画布交互诊断：缩放拖动跟手性、点击命中、卡片拖动坐标
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")'); await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap'); await page.waitForTimeout(500);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300); await page.waitForTimeout(600);
// 先读卡片初始位置
const c0 = await page.evaluate(() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return { cx: r.x + r.width/2, cy: r.y + r.height/2, w: r.width, h: r.height }; });

// ===== 1) zoom=1 拖动卡片跟手 =====
await page.mouse.move(c0.cx, c0.cy); await page.mouse.down(); await page.mouse.move(c0.cx + 100, c0.cy + 60, { steps: 6 }); await page.mouse.up();
await page.waitForTimeout(300);
const c1 = await page.evaluate(() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
check('zoom=1 卡片拖动跟手(移动100,60)', Math.abs((c1.x - c0.cx) - 100) < 6 && Math.abs((c1.y - c0.cy) - 60) < 6, `Δ${(c1.x-c0.cx).toFixed(1)},${(c1.y-c0.cy).toFixed(1)}`);

// ===== 2) 点击命中不错位 =====
const c2 = await page.evaluate(() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; });
await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(300);
const hit = await page.evaluate(() => !!document.querySelector('.card.selected'));
check('点击卡片命中选中', hit);

// ===== 3) 缩放到 25% 后 pan 画布跟手 =====
// 用工具面板缩放按钮缩小
await page.click('button[title="工具与缩放"]'); await page.waitForTimeout(300);
for (let i = 0; i < 6; i++) { await page.click('button[title="缩小"]'); await page.waitForTimeout(120); }
await page.waitForTimeout(300);
const zoom = await page.evaluate(() => { const el = document.querySelector('.canvas-cards'); const m = getComputedStyle(el).transform.match(/matrix\(([^,]+)/); return m ? parseFloat(m[1]) : 1; });
check('已缩小到低zoom', zoom < 0.6, `zoom≈${zoom.toFixed(2)}`);
// pan：在空白处按住拖
const b2 = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.move(b2.x + 60, b2.y + 60); await page.mouse.down(); await page.mouse.move(b2.x + 60 + 200, b2.y + 60 + 100, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
const pan = await page.evaluate(() => { const el = document.querySelector('.canvas-cards'); const t = getComputedStyle(el).transform; const m = t.match(/matrix\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^\)]+)\)/); return m ? { tx: parseFloat(m[5]), ty: parseFloat(m[6]) } : null; });
console.log('pan后 canvas-cards translate:', JSON.stringify(pan));

await browser.close();
console.log('errs:', errs.length, errs.slice(0,2).join(' | '));