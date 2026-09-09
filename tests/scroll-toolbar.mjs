// 验证：富文本长文本内部滚动 + 工具栏固定；悬浮栏上移3cm；字号按钮组
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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

// ===== 1) 全屏编辑器：长文本内部滚动 + 工具栏固定 =====
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const cards = page.locator('.card');
await cards.first().dblclick();
await page.waitForTimeout(800);
if (await page.locator('.fullscreen-editor').count() === 0) { await cards.first().dblclick(); await page.waitForTimeout(800); }
await page.click('.rich-editor-body');
const toolbarTop0 = await page.evaluate(() => document.querySelector('.fe-body .rich-toolbar')?.getBoundingClientRect().top ?? 0);
for (let i = 0; i < 40; i++) { await page.keyboard.type(`第${i}行：足够长的正文内容用于验证长文本滚动与工具栏固定是否正常。`); await page.keyboard.press('Enter'); }
await page.waitForTimeout(400);
const scroll = await page.evaluate(() => {
  const rs = document.querySelector('.rich-scroll');
  if (!rs) return null;
  const sh = rs.scrollHeight, ch = rs.clientHeight;
  rs.scrollTop = sh;
  return { sh, ch, st: rs.scrollTop };
});
check('正文在 rich-scroll 内部滚动(sh>ch)', !!scroll && scroll.sh > scroll.ch, `${scroll?.sh} / ${scroll?.ch}`);
check('滚动生效(scrollTop>0)', !!scroll && scroll.st > 0, `scrollTop=${scroll?.st}`);
const toolbarTop1 = await page.evaluate(() => document.querySelector('.fe-body .rich-toolbar')?.getBoundingClientRect().top ?? 0);
check('工具栏未被顶走(位置固定)', Math.abs(toolbarTop1 - toolbarTop0) < 3, `top ${toolbarTop0.toFixed(0)} → ${toolbarTop1.toFixed(0)}`);
await page.click('.fe-actions .btn.primary');
await page.waitForTimeout(500);

// ===== 2) 检查器字号按钮组 =====
await cards.first().click();
await page.waitForTimeout(500);
const btns = await page.evaluate(() => [...document.querySelectorAll('.inspector .btn-row button')].map(b => b.textContent.trim()));
check('字号按钮组含常用字号', ['12','13','14','16','18','20','24'].every(f => btns.includes(f)), btns.join(','));
check('无 range slider', (await page.locator('.inspector input[type="range"]').count()) === 0);
await page.click('.inspector .btn-row button:has-text("20")');
await page.waitForTimeout(500);
const fsApplied = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.card .rich-static')).fontSize));
check('点击 20 → 卡片字号 20px', Math.abs(fsApplied - 20) < 1.5, `${fsApplied}px`);

// ===== 3) 悬浮栏向上移3cm =====
const zc = await page.evaluate(() => {
  const el = document.querySelector('.zoom-ctrl');
  const cs = el ? getComputedStyle(el) : null;
  return cs ? { bottom: cs.bottom, right: cs.right } : null;
});
check('悬浮栏向上移3cm(bottom≈125px)', !!zc && parseFloat(zc.bottom) >= 110, zc?.bottom || '');
check('悬浮栏 right 恢复 12px', !!zc && parseFloat(zc.right) <= 13, zc?.right || '');

console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();