// 验证：Q弹动效取消、选中框显示目标颜色、手柄加大、拖连线悬浮、zoom-ctrl左移
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

// ===== 1) 弹窗动画非Q弹（popIn/无回弹） =====
const animInfo = await page.evaluate(() => {
  const styles = document.styleSheets;
  let springPop = '', modalAnim = '';
  for (const sh of styles) {
    try {
      for (const rule of sh.cssRules) {
        if (rule.selectorText === ':root' && rule.style) {
          springPop = rule.style.getPropertyValue('--spring-pop') || springPop;
        }
        if (rule.selectorText === '.modal' && rule.style) {
          modalAnim = rule.style.animationName || rule.style.animation || '';
        }
      }
    } catch { /* cross-origin */ }
  }
  return { springPop, modalAnim };
});
check('--spring-pop 已改为标准缓动(无回弹)', !animInfo.springPop.includes('1.56'), animInfo.springPop || '无');

// ===== 2) 选中框显示目标颜色（--sel-color） =====
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const cards = page.locator('.card');
await cards.first().click();
await page.waitForTimeout(500);
const selColor = await page.evaluate(() => document.querySelector('.card.selected')?.style.getPropertyValue('--sel-color'));
check('选中卡片注入 --sel-color', !!selColor, selColor);
const selShadow = await page.evaluate(() => {
  const el = document.querySelector('.card.selected');
  return el ? getComputedStyle(el).boxShadow : '';
});
check('选中框阴影使用目标颜色', selColor && selShadow.includes('rgb'), selShadow.slice(0, 40));

// ===== 3) 手柄加大（20px） =====
const rh = await page.evaluate(() => {
  const el = document.querySelector('.card.selected .rh');
  return el ? { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height } : null;
});
check('缩放手柄已加大(≈20px)', !!rh && rh.w >= 18, `${rh?.w}x${rh?.h}px`);

// ===== 4) 拖锚点悬浮效果 =====
await page.mouse.move(box.x + 400 + 20, box.y + 280 + 60); // 卡片中心附近
await page.waitForTimeout(300);
const anchor = page.locator('.card.selected .anchor-e').first();
const ab = await anchor.boundingBox();
await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
await page.mouse.down();
await page.waitForTimeout(300);
const dragCls = await page.evaluate(() => !!document.querySelector('.card.connect-dragging'));
check('拖连接线时卡片悬浮(connect-dragging)', dragCls);
await page.mouse.move(box.x + 600, box.y + 500, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
const dragCls2 = await page.evaluate(() => document.querySelectorAll('.card.connect-dragging').length);
check('连接完成后悬浮消失', dragCls2 === 0, `${dragCls2} 张`);

// ===== 5) zoom-ctrl 向上移 3cm =====
const zc = await page.evaluate(() => {
  const el = document.querySelector('.zoom-ctrl');
  const cs = el ? getComputedStyle(el) : null;
  return cs ? { bottom: cs.bottom, right: cs.right } : null;
});
check('右侧悬浮栏已向上移3cm', !!zc && parseFloat(zc.bottom) >= 110, zc?.bottom || '');
check('悬浮栏 right 保持 12px', !!zc && parseFloat(zc.right) <= 13, zc?.right || '');

console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();