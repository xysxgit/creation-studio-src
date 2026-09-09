// 横屏布局诊断：测量 v-toolbar / zc-fab / page-menu 间距
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
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
await page.mouse.dblclick(box.x + 200, box.y + 120); await page.waitForTimeout(500);

const boxes = await page.evaluate(() => {
  const g = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right) }; };
  return { vt: g('.v-toolbar'), fab: g('.zc-fab'), zoom: g('.zoom-ctrl'), ps: g('.page-switcher-btn'), canvas: g('.canvas-wrap') };
});
console.log('=== 横屏(844x390) 布局 ===');
console.log('v-toolbar:', JSON.stringify(boxes.vt));
console.log('zc-fab:', JSON.stringify(boxes.fab));
console.log('zoom-ctrl:', JSON.stringify(boxes.zoom));
console.log('page-switcher-btn:', JSON.stringify(boxes.ps));
if (boxes.fab && boxes.vt) {
  const gap = boxes.fab.y - boxes.vt.b;
  console.log('fab.top - vt.bottom 间隔 =', gap + 'px', gap < 12 ? '⚠️ 太近' : 'OK');
}
// 展开页面切换面板
await page.click('.page-switcher-btn').catch(()=>{});
await page.waitForTimeout(400);
const pm = await page.evaluate(() => { const e = document.querySelector('.page-menu'); if(!e) return null; const r=e.getBoundingClientRect(); return { y:Math.round(r.y), b:Math.round(r.bottom), h:Math.round(r.height), r:Math.round(r.right) }; });
console.log('page-menu(展开):', JSON.stringify(pm));
await browser.close();
console.log('errs:', errs.length, errs.slice(0,2).join(' | '));