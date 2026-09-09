import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
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
await page.waitForTimeout(600);
const cards = page.locator('.card');
await cards.first().dblclick();
await page.waitForTimeout(800);
if (await page.locator('.fullscreen-editor').count() === 0) { await cards.first().dblclick(); await page.waitForTimeout(800); }

// 输入文字并全选
await page.click('.rich-editor-body');
await page.keyboard.type('测试字号功能ABC');
await page.waitForTimeout(200);
await page.keyboard.press('ControlOrMeta+a');
await page.waitForTimeout(200);
// 查看选中状态（selection range 文本）
const sel = await page.evaluate(() => window.getSelection()?.toString());
console.log('选中文本:', JSON.stringify(sel));

const sizeSel = page.locator('.rtb-select[aria-label="字号"]');
console.log('select count:', await sizeSel.count());
await sizeSel.selectOption('18').catch((e) => console.log('selectOption ERR:', String(e).slice(0, 150)));
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const body = document.querySelector('.rich-editor-body');
  const spans = [...document.querySelectorAll('.rich-editor-body span')];
  return {
    html: body ? body.innerHTML.slice(0, 400) : null,
    spans: spans.map((s) => ({ cls: s.className, fs: s.style.fontSize, ff: s.style.fontFamily, text: s.textContent?.slice(0, 20) })),
  };
});
console.log('innerHTML:', info.html);
console.log('spans:', JSON.stringify(info.spans));

// 直接试字体的 select
const fontSel = page.locator('.rtb-select[aria-label="字体"]');
await fontSel.selectOption('宋体, SimSun, serif').catch((e) => console.log('font selectOption ERR:', String(e).slice(0, 150)));
await page.waitForTimeout(500);
const info2 = await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].map((s) => ({ fs: s.style.fontSize, ff: s.style.fontFamily, t: s.textContent?.slice(0, 15) })));
console.log('spans2:', JSON.stringify(info2));
await browser.close();