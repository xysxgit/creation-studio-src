// 验证：富文本新增字号/字体下拉；纸张长度自适应；放大编辑字号 18px；收起按钮
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

// 双击画布空白 → 新建卡片 → 再双击卡片 → 全屏编辑
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const cards = page.locator('.card');
check('画布有卡片', (await cards.count()) > 0);
await page.waitForTimeout(600);
await cards.first().dblclick();
await page.waitForTimeout(600);
if (await page.locator('.fullscreen-editor').count() === 0) {
  // 重试一次（卡片动画/位置）
  await cards.first().dblclick();
  await page.waitForTimeout(600);
}
await page.waitForSelector('.fullscreen-editor', { timeout: 6000 });
await page.waitForTimeout(400);

// 1) 工具栏有字号/字体下拉
const sizeSel = page.locator('.rtb-select[aria-label="字号"]');
const fontSel = page.locator('.rtb-select[aria-label="字体"]');
check('工具栏有字号下拉', (await sizeSel.count()) === 1);
check('工具栏有字体下拉', (await fontSel.count()) === 1);

// 2) 纸张长度自适应（aspect-ratio 移除，min-height 保留）
const sheetInfo = await page.evaluate(() => {
  const el = document.querySelector('.paper-sheet');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { aspectRatio: cs.aspectRatio, minHeight: cs.minHeight, height: el.getBoundingClientRect().height };
});
check('纸张不再固定 A4 比例（自适应长度）', !!sheetInfo && sheetInfo.aspectRatio === 'auto', `aspect-ratio=${sheetInfo?.aspectRatio} min-height=${sheetInfo?.minHeight}`);

// 3) 编辑区字号 18px
const bodyFs = await page.evaluate(() => getComputedStyle(document.querySelector('.rich-editor-body')).fontSize);
check('放大编辑默认字号 18px', bodyFs === '18px', bodyFs);

// 4) 输入文字 → 选中 → 设置字号 18 → 生效
await page.click('.rich-editor-body');
await page.keyboard.type('测试字号与字体功能');
await page.keyboard.press('ControlOrMeta+a');
await sizeSel.selectOption('18');
await page.waitForTimeout(300);
const styled = await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].some((s) => s.style.fontSize === '18px'));
check('字号 18px 应用到选中文字', styled);

// 5) 设置字体 宋体 → 生效
await fontSel.selectOption('serif');
await page.waitForTimeout(300);
const fonted = await page.evaluate(() => [...document.querySelectorAll('.rich-editor-body span')].some((s) => (s.style.fontFamily || '').includes('serif')));
check('字体应用到选中文字', fonted);

// 6) 内容增长 → 正文在纸张内部滚动（工具栏固定，纸张高度不变）
const h1 = await page.evaluate(() => document.querySelector('.paper-sheet').getBoundingClientRect().height);
await page.keyboard.press('Enter');
for (let i = 0; i < 20; i++) { await page.keyboard.type('这是一段用于测试纸张内部滚动的正文内容。'); await page.keyboard.press('Enter'); }
await page.waitForTimeout(400);
const h2 = await page.evaluate(() => document.querySelector('.paper-sheet').getBoundingClientRect().height);
check('内容增多时纸张高度稳定(内部滚动)', Math.abs(h2 - h1) < 3, `${Math.round(h1)}px → ${Math.round(h2)}px`);
const rsInfo = await page.evaluate(() => {
  const rs = document.querySelector('.rich-scroll');
  if (!rs) return null;
  rs.scrollTop = rs.scrollHeight;
  return { sh: rs.scrollHeight, ch: rs.clientHeight, st: rs.scrollTop };
});
check('正文在 rich-scroll 内部滚动', !!rsInfo && rsInfo.sh > rsInfo.ch && rsInfo.st > 0, `${rsInfo?.sh}/${rsInfo?.ch} st=${rsInfo?.st}`);

// 7) 收起按钮文案
const btnText = await page.locator('.fe-actions .btn.primary').textContent();
check('收起按钮文案明确（含“收起”）', !!btnText && btnText.includes('收起'), btnText?.trim());

await page.click('.fe-actions .btn.primary');
await page.waitForTimeout(400);
check('点击收起回到画布', (await page.locator('.fullscreen-editor').count()) === 0);

console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();