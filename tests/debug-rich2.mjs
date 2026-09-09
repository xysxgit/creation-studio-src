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

await page.click('.rich-editor-body');
await page.keyboard.type('测试字号功能ABC');
await page.keyboard.press('ControlOrMeta+a');
await page.waitForTimeout(200);
console.log('选中:', JSON.stringify(await page.evaluate(() => window.getSelection()?.toString())));

// 1) 点加粗按钮
await page.click('.rtb[title="加粗"]').catch((e) => console.log('B click err', String(e).slice(0,100)));
await page.waitForTimeout(500);
console.log('点B后 spans:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span, .rich-editor-body strong')].map((s) => ({ tag: s.tagName, fs: s.style.fontSize, text: s.textContent })))));

// 2) 保持全选，直接点字号（不重新选）
const sizeSel = page.locator('.rtb-select[aria-label="字号"]');
await sizeSel.selectOption('18').catch((e) => console.log('sel err', String(e).slice(0, 100)));
await page.waitForTimeout(500);
console.log('选18后 spans:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].map((s) => ({ tag: s.tagName, fs: s.style.fontSize, text: s.textContent })))));

// 3) 重新全选再选字号
await page.keyboard.press('ControlOrMeta+a');
await page.waitForTimeout(200);
await sizeSel.selectOption('18').catch((e) => console.log('sel2 err', String(e).slice(0, 100)));
await page.waitForTimeout(500);
console.log('重选后 spans:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].map((s) => ({ tag: s.tagName, fs: s.style.fontSize, text: s.textContent })))));

// 4) 用键盘改字号下拉是否触发（dispatch change）
await page.evaluate(() => {
  const sel = document.querySelector('.rtb-select[aria-label="字号"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '24');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
console.log('evaluate改24后 spans:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].map((s) => ({ tag: s.tagName, fs: s.style.fontSize, text: s.textContent })))));

await browser.close();