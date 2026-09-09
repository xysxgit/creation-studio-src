// 验证：卡片字号设置（检查器）、反缩放、富文本字号同步、正文创作滚动
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

// 建卡 + 写内容
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const cards = page.locator('.card');
await cards.first().dblclick();
await page.waitForTimeout(800);
if (await page.locator('.fullscreen-editor').count() === 0) { await cards.first().dblclick(); await page.waitForTimeout(800); }
await page.click('.rich-editor-body');
await page.keyboard.type('这是卡片正文内容，用于验证字号设置与同步。');
// 富文本里给文字设置字号 20（全选 → 字号 20）
await page.keyboard.press('ControlOrMeta+a');
await page.waitForTimeout(200);
await page.locator('.rtb-select[aria-label="字号"]').selectOption('20');
await page.waitForTimeout(300);
// 收起
await page.click('.fe-actions .btn.primary');
await page.waitForTimeout(500);

// ===== 1) 检查器：正文字号 slider =====
await cards.first().click();
await page.waitForTimeout(500);
const inspText = await page.locator('.inspector').textContent();
check('检查器有「字体缩放」', inspText.includes('字体缩放'));
const fsBtns = page.locator('.inspector .btn-row button');
check('字号为常用按钮组(非slider)', (await fsBtns.count()) >= 5 && (await page.locator('.inspector input[type="range"]').count()) === 0, String(await fsBtns.count()) + ' 个按钮');

// ===== 2) 点击字号 18 → 卡片正文应用 =====
await page.click('.inspector .btn-row button:has-text("18")');
await page.waitForTimeout(600);
const fs1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.card .rich-static')).fontSize));
check('卡片正文字号 = 18px', Math.abs(fs1 - 18) < 1.5, `${fs1}px`);

// ===== 3) 富文本字号同步：卡片 span 有 font-size:20px =====
const spanFs = await page.evaluate(() => {
  const spans = [...document.querySelectorAll('.card .rich-static span')];
  const hit = spans.find((sp) => sp.style.fontSize.includes('20'));
  return hit ? hit.style.fontSize : '';
});
check('富文本设置的字号同步到卡片显示(20px)', spanFs.includes('20'), spanFs);

// ===== 4) 画布缩放后文字随画布一起放缩（不再反缩放）=====
await page.mouse.click(box.x + 30, box.y + 30); // 点空白，清焦点
await page.waitForTimeout(300);
await page.keyboard.press('=');
await page.keyboard.press('=');
await page.waitForTimeout(700);
const fs2 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.card .rich-static')).fontSize));
const zoom = await page.evaluate(() => {
  const el = document.querySelector('.canvas-cards');
  if (!el) return 1;
  const m = getComputedStyle(el).transform.match(/matrix\(([^,]+)/);
  return m ? parseFloat(m[1]) : 1;
});
check('画布已放大(zoom>1)', zoom > 1, `zoom≈${zoom.toFixed(2)}`);
check('放大后文字随画布放缩(CSS值不变≈18)', Math.abs(fs2 - 18) < 1.5, `卡片字号${fs2.toFixed(1)}px(CSS)`);

// ===== 5) 正文创作：富文本界面可滚动 =====
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('button:has-text("正文创作导出")');
await page.waitForSelector('.writing-mode', { timeout: 5000 });
await page.click('.btn:has-text("＋ 新建章")');
await page.waitForTimeout(500);
await page.click('.rich-editor-body');
for (let i = 0; i < 25; i++) { await page.keyboard.type(`第${i}行：这是一段足够长的正文内容，用来验证纸张滚动是否正常。`); await page.keyboard.press('Enter'); }
await page.waitForTimeout(500);
const scrollInfo = await page.evaluate(() => {
  const rs = document.querySelector('.rich-scroll');
  if (!rs) return null;
  const sh = rs.scrollHeight, ch = rs.clientHeight;
  rs.scrollTop = sh;
  return { sh, ch, st: rs.scrollTop };
});
check('纸张可滚动(sh>ch)', !!scrollInfo && scrollInfo.sh > scrollInfo.ch, `${scrollInfo?.sh} / ${scrollInfo?.ch}`);
check('滚动生效(scrollTop>0)', !!scrollInfo && scrollInfo.st > 0, `scrollTop=${scrollInfo?.st}`);

console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();