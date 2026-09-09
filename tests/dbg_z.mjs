import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[P ERROR]', String(e).slice(0, 200)));
await page.goto(URL);
await page.waitForSelector('.welcome');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(800);
const ctrlWheel = (x, y, dy) => page.evaluate(([xx, yy, dyy]) => {
  const el = document.elementFromPoint(xx, yy) || document.querySelector('.canvas-wrap');
  el.dispatchEvent(new WheelEvent('wheel', { clientX: xx, clientY: yy, deltaY: dyy, ctrlKey: true, bubbles: true, cancelable: true }));
}, [x, y, dy]);
const worldAt = () => page.evaluate(([x, y]) => {
  const r = document.querySelector('.canvas-cards').getBoundingClientRect();
  const wrap = document.querySelector('.canvas-wrap').getBoundingClientRect();
  const z = r.width / wrap.width;
  return { wx: (x - r.x) / z, wy: (y - r.y) / z, z };
}, [800, 450]);
await page.click('.zc-fab'); await page.waitForTimeout(150);
for (let i = 0; i < 12; i++) { await page.click('.zc-zoom button[title="缩小"]'); await page.waitForTimeout(80); }
await page.click('.zc-close');
const w0 = await worldAt();
for (let i = 0; i < 5; i++) { await ctrlWheel(800, 450, -240); await page.waitForTimeout(120); }
const w1 = await worldAt();
console.log('A. 0.15放大锚漂移:', Math.round(Math.hypot(w1.wx - w0.wx, w1.wy - w0.wy)), 'units, zoom', w1.z.toFixed(2));
const before = await page.locator('.card').count();
for (let i = 0; i < 6; i++) { await ctrlWheel(800, 450, 240); await page.waitForTimeout(100); }
const after = await page.locator('.card').count();
console.log('B. 缩小可见卡片:', before, '→', after);
await page.click('.zc-fab'); await page.waitForTimeout(150);
for (let i = 0; i < 6; i++) { await page.click('.zc-zoom button[title="缩小"]'); await page.waitForTimeout(80); }
await page.click('.zc-close');
await page.locator('.sb-tabs button:has-text("图层")').click();
await page.waitForTimeout(200);
const titles = await page.locator('.layer-item .layer-title').allInnerTexts();
await page.locator('.layer-item').nth(10).click();
await page.waitForTimeout(400);
const target = titles[10];
const info = await page.evaluate((title) => {
  const w = document.querySelector('.canvas-wrap').getBoundingClientRect();
  const cc = document.querySelector('.canvas-cards').getBoundingClientRect();
  const c = [...document.querySelectorAll('.card')].find((x) => (x.querySelector('.card-title-input') || {}).value === title);
  return { found: !!c, vp: Math.round(cc.x - w.x) + ',' + Math.round(cc.y - w.y) + ',z=' + (cc.width / w.width).toFixed(2), center: c ? { x: Math.round(c.getBoundingClientRect().x + c.getBoundingClientRect().width / 2), y: Math.round(c.getBoundingClientRect().y + c.getBoundingClientRect().height / 2) } : null, wrapCenter: { x: Math.round(w.x + w.width / 2), y: Math.round(w.y + w.height / 2) } };
}, target);
console.log('C. 图层定位:', JSON.stringify(info));
await browser.close();
