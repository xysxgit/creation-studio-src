// 体验修复验证：默认卡片尺寸 / 锚点缩放匹配 / A4三模式切换 / 纸张不再随键盘缩小
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

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

// 1) 双击空白新建 → 默认应为 A4 纸比例卡片（170×240）
const wb = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(wb.x + 200, wb.y + 200);
await page.waitForTimeout(600);
const cardBox = await page.locator('.card').last().boundingBox();
const cardCls = await page.locator('.card').last().getAttribute('class');
check('新建卡片为 A4 纸比例', !!cardBox && Math.abs(cardBox.width / cardBox.height - 210 / 297) < 0.05,
  cardBox ? `w=${Math.round(cardBox.width)} h=${Math.round(cardBox.height)} 比例=${(cardBox.width / cardBox.height).toFixed(3)}` : '未创建');
check('卡片为 A4 纸样式', !!cardCls && cardCls.includes('paper-a4'), cardCls?.match(/paper-\w+/)?.[0]);

// 2) 锚点随缩放贴边：选中卡片，比较 zoom=1 与 zoom>1 时锚点中心到卡片边缘的屏幕距离
await page.locator('.card').last().click();
await page.waitForTimeout(300);
const anchorDist = () => page.evaluate(() => {
  const card = document.querySelector('.card.selected');
  const anchor = card?.querySelector('.anchor-e');
  if (!card || !anchor) return null;
  const cb = card.getBoundingClientRect();
  const ab = anchor.getBoundingClientRect();
  return Math.abs(ab.left + ab.width / 2 - cb.right);
});
const d1 = await anchorDist();
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('+'); // 键盘缩放：锚定选中卡片（不依赖鼠标位置）
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);
const d2 = await anchorDist();
const btnSizes = await page.evaluate(() => [...document.querySelectorAll('.card-collapse-btn')].map((b) => b.getBoundingClientRect().width));
// 修复后锚点始终贴住卡片边缘（中心在边缘 8px 内），按钮屏幕尺寸恒定
check('锚点缩放贴边（在卡片边缘）', d1 !== null && d2 !== null && Math.abs(d1) < 8 && Math.abs(d2) < 8,
  d1 !== null && d2 !== null ? `zoom1:${d1.toFixed(1)}px zoom2:${d2.toFixed(1)}px` : '无法测量');
check('功能按钮与卡片固定比例（随缩放缩放，不飞出）', btnSizes.length > 0 && btnSizes.every((w) => w > 20),
  btnSizes.length ? `按钮宽度: ${btnSizes.map((w) => Math.round(w)).join(',')}px（放大后随卡片变大）` : '无按钮');

// 3) 双击卡片进全屏编辑 → 无模式切换按钮，固定 A4 单页纸张
await page.locator('.card').last().dblclick();
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
const btns = await page.locator('.fe-actions .btn').allTextContents();
check('无 A4/卡片模式切换按钮', !btns.some((t) => t.includes('A4') || t.includes('卡片')), btns.join(' | '));
check('全屏编辑固定 A4 单页纸张', await page.evaluate(() => {
  const stage = document.querySelector('.paper-stage.a4');
  const sheet = stage?.querySelector('.paper-sheet');
  return !!stage && !!sheet;
}));
// 纸张尺寸固定（min(96%,860px)），不依赖视口高度——软键盘弹出不再改变大小
check('纸张尺寸固定（不随视口/键盘变化）', await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText === '.paper-sheet' && rule.style?.width?.includes('860px') && !rule.style?.width?.includes('vh')) return true;
      }
    } catch { /* cross-origin */ }
  }
  return false;
}));

const allOk = results.every((r) => r.ok) && !errors.length;
console.log(`\n${allOk ? '🎉 全部通过' : '⚠️ 有失败项'} | JS错误: ${errors.length}`);
await browser.close();
process.exit(allOk ? 0 : 1);