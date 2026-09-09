// 综合诊断：手柄缩放恒定 + native保存桩
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const errors = [];
const browser0 = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser0.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.__saved = [];
  window.OperitAndroid = { saveBase64: (n, b, m) => { window.__saved.push({ n, b: b.length, m }); } };
});
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
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 300, box.y + 200);
await page.waitForTimeout(500);

// ===== 手柄/锚点 缩放恒定（先测，无 modal 干扰） =====
const cards = page.locator('.card');
await cards.first().click();
await page.waitForTimeout(400);
const measure = async () => {
  return await page.evaluate(() => {
    const rh = document.querySelector('.card.selected .rh-se');
    const an = document.querySelector('.card.selected .anchor-e');
    const cs = document.querySelector('.card.selected .rich-static');
    return { rhW: rh ? rh.getBoundingClientRect().width : 0, anW: an ? an.getBoundingClientRect().width : 0, fs: cs ? parseFloat(getComputedStyle(cs).fontSize) : 0 };
  });
};
const m1 = await measure();
await page.click('button[title="工具与缩放"]');
await page.waitForTimeout(300);
await page.click('button[title="放大"]');
await page.waitForTimeout(500);
await page.click('button[title="放大"]');
await page.waitForTimeout(500);
const m2 = await measure();
check('缩放手柄屏幕宽度恒定(≈26px)', Math.abs(m1.rhW - m2.rhW) < 3 && Math.abs(m1.rhW - 26) < 4, `${m1.rhW.toFixed(1)}→${m2.rhW.toFixed(1)}`);
check('连线锚点屏幕宽度恒定(≈28px)', Math.abs(m1.anW - m2.anW) < 3 && Math.abs(m1.anW - 28) < 4, `${m1.anW.toFixed(1)}→${m2.anW.toFixed(1)}`);
check('卡片正文CSS值不变(随画布缩放)', Math.abs(m1.fs - m2.fs) < 2, `${m1.fs.toFixed(1)}→${m2.fs.toFixed(1)}`);

// ===== native 保存桩 =====
await page.click('button[title="100%"]');
await page.waitForTimeout(300);
await page.click('button[title="导出"]');
await page.waitForTimeout(300);
await page.click('.modal-sec button:has-text("8K")');
await page.waitForTimeout(1500);
await page.click('.btn-grid .btn.primary');
await page.waitForTimeout(800);
const saved = await page.evaluate(() => window.__saved);
check('图片保存调用 saveBase64', saved.length >= 1, saved.slice(-1).map(x => `${x.n}(${x.b}B/${x.m})`).join() || '无');
await page.waitForTimeout(500);
await page.click('button[title="导出"]');
await page.waitForTimeout(300);
await page.click('.modal-sec button:has-text("保存项目")');
await page.waitForTimeout(600);
await page.click('.btn-grid .btn.primary');
await page.waitForTimeout(600);
const saved2 = await page.evaluate(() => window.__saved);
check('项目JSON保存调用 saveBase64', saved2.length >= 2, saved2.slice(-1).map(x => `${x.n}(${x.b}B/${x.m})`).join() || '无');
await browser0.close();
console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));