import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); };

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e)));
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

// ===== 1. 默认工具为移动 =====
await page.click('.zc-fab');
await page.waitForTimeout(200);
const moveActive = await page.locator('.zc-tool.active:has-text("移动")').count();
ok('默认工具为移动', moveActive === 1, String(moveActive));
await page.click('.zc-close');

// ===== 2. 连线默认直线 =====
const cardA = page.locator('.card').nth(0);
const cardB = page.locator('.card').nth(5);
await cardA.click({ position: { x: 150, y: 100 } });
await page.waitForTimeout(150);
const anchor = page.locator('.anchor-e').last();
const ab = await anchor.boundingBox();
const bb = await cardB.boundingBox();
await page.mouse.move(ab.x + 6, ab.y + 6);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const d = await page.locator('.edge-path').last().getAttribute('d');
ok('新连线默认为直线', d.includes(' L ') && !d.includes(' C '), String(d).slice(0, 30));

// ===== 3. 预览模式：按钮 + 完整排版 + 与编辑同步 =====
const pCard = page.locator('.card').nth(1);
await pCard.hover();
const previewBtn = pCard.locator('.card-collapse-btn[title^="预览模式"]');
const btnCount = await previewBtn.count();
ok('卡片有预览模式按钮', btnCount === 1);
const btnH = await previewBtn.evaluate((el) => getComputedStyle(el).height);
ok('全屏/收纳按钮加大', parseFloat(btnH) >= 26, btnH);
await previewBtn.click();
await page.waitForTimeout(300);
const previewMode = await pCard.evaluate((el) => el.classList.contains('preview-mode'));
const previewBody = await pCard.locator('.card-preview-body').count();
ok('预览模式开启（完整排版容器）', previewMode && previewBody === 1);
// 预览内容随编辑同步：先记录内容，改标题与正文后检查
const oldHtml = await pCard.locator('.card-preview-body').innerHTML();
// 双击预览卡 → 全屏编辑（预览卡双击走全屏）
await pCard.locator('.card-preview-body').dblclick();
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.click('.fe-body .rich-editor-body');
await page.keyboard.type('预览同步测试文本');
await page.waitForTimeout(300);
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(300);
const newHtml = await pCard.locator('.card-preview-body').innerHTML();
ok('预览内容与编辑实时同步', newHtml !== oldHtml && newHtml.includes('预览同步测试文本'), 'updated');
// 全屏打开时内联编辑被关闭（状态同步）
const editingCards = await page.locator('.card.editing').count();
ok('全屏编辑与卡片编辑状态同步', editingCards === 0, String(editingCards));

// ===== 4. 保存按钮 + 状态 =====
await page.click('button[title="保存 Ctrl+S"]');
await page.waitForTimeout(300);
const saveChip = await page.locator('.vt-save').innerText();
ok('保存按钮与状态', saveChip.includes('已保存') || saveChip.includes('保存中'), saveChip);
// Ctrl+S 快捷键
await page.keyboard.press('Control+s');
await page.waitForTimeout(300);
ok('Ctrl+S 保存无异常', jsErrors.length === 0);

// ===== 5. 图层定位（缩小后）=====
await page.click('.zc-fab');
await page.waitForTimeout(200);
for (let i = 0; i < 4; i++) { await page.click('.zc-zoom button[title="缩小"]'); await page.waitForTimeout(150); }
await page.click('.zc-close');
await page.waitForTimeout(200);
await page.click('.sb-tabs button:has-text("图层")');
await page.waitForTimeout(300);
const targetLayer = page.locator('.layer-item').nth(5);
const targetTitle = await targetLayer.locator('.layer-title').innerText();
await targetLayer.click();
await page.waitForTimeout(400);
// 目标卡应位于视口中心附近
const found = await page.evaluate((title) => {
  const cards = [...document.querySelectorAll('.card')];
  const c = cards.find((x) => (x.querySelector('.card-title-input') || {}).value === title);
  if (!c) return { ok: false };
  const r = c.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return { ok: Math.abs(cx - 720) < 220 && Math.abs(cy - 500) < 220, cx: Math.round(cx), cy: Math.round(cy) };
}, targetTitle);
ok('缩小后图层定位居中', found.ok, JSON.stringify(found));

// ===== 6. 橡皮擦工具按钮 =====
await page.click('.sb-tabs button:has-text("分区")');
await page.waitForTimeout(200);
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("橡皮")');
await page.waitForTimeout(200);
const eraserOn = await page.locator('.zc-tool.active:has-text("橡皮")').count();
const penEraserMode = await page.locator('.pen-mode.on:has-text("橡皮")').count();
ok('橡皮擦工具按钮', eraserOn === 1 && penEraserMode === 1, `${eraserOn}/${penEraserMode}`);
const fabIcon = await page.locator('.zc-fab').count(); // 面板开着
await page.click('.zc-close');
const fabText = await page.locator('.zc-fab').innerText();
ok('橡皮模式 FAB 图标 🧽', fabText.includes('🧽'), fabText.trim());
// 用画笔画一条，再用橡皮擦掉
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("画笔")');
await page.waitForTimeout(200);
await page.click('.zc-close');
const wrap = await page.locator('.canvas-wrap').boundingBox();
const penSpot = await page.evaluate(() => {
  const wrapEl = document.querySelector('.canvas-wrap').getBoundingClientRect();
  for (let dy = 500; dy < wrapEl.height - 40; dy += 40) {
    for (let dx = 40; dx < wrapEl.width - 40; dx += 40) {
      const el = document.elementFromPoint(wrapEl.x + dx, wrapEl.y + dy);
      if (el && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid'))) return { x: wrapEl.x + dx, y: wrapEl.y + dy };
    }
  }
  return { x: wrapEl.x + wrapEl.width / 2, y: wrapEl.y + wrapEl.height - 60 };
});
await page.mouse.move(penSpot.x, penSpot.y);
await page.mouse.down();
await page.mouse.move(penSpot.x + 120, penSpot.y + 50, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const annCount = await page.locator('.annotation-line').count();
// 切橡皮擦除
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("橡皮")');
await page.waitForTimeout(200);
await page.click('.zc-close');
await page.mouse.move(penSpot.x, penSpot.y);
await page.mouse.down();
await page.mouse.move(penSpot.x + 100, penSpot.y + 40, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(400);
const annAfter = await page.locator('.annotation-line').count();
ok('橡皮擦擦除标注', annCount >= 1 && annAfter === 0, `${annCount}→${annAfter}`);

// ===== 7. 弹出菜单可滚动（连接线设置菜单内容多时滚动）=====
await page.click('.sb-tabs button:has-text("分区")').catch(() => {});
// 适配视图，保证连线可见
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(500);
await page.click('.zc-close');
await page.waitForTimeout(150);
// 右键连线（命中层中点，避免被卡片遮挡）→ 设置菜单
await page.evaluate(() => {
  const paths = document.querySelectorAll('.edge-hit-path');
  const last = paths[paths.length - 1];
  const r = last.getBoundingClientRect();
  last.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
});
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
const scrollable = await page.evaluate(() => {
  const m = document.querySelector('.ctx-menu');
  if (!m) return false;
  const cs = getComputedStyle(m);
  return cs.overflowY === 'auto' && parseFloat(cs.maxHeight) > 0;
});
ok('弹出选项可滚动（overflow-y）', scrollable);
await page.keyboard.press('Escape');

// ===== 8. 云同步设置 UI =====
await page.click('.tb-btn[title="设置"]');
await page.waitForSelector('.modal');
const cloudSec = await page.locator('.modal h4:has-text("云盘同步")').count();
const saveSec = await page.locator('.modal h4:has-text("保存")').count();
ok('设置含云盘同步/保存区块', cloudSec === 1 && saveSec === 1, `云${cloudSec} 保存${saveSec}`);
// 填入云设置并同步（无服务器转发时直连失败也在预期内——验证不崩溃）
await page.locator('.modal .fld input[placeholder*="dav.jianguoyun"]').fill('https://dav.jianguoyun.com/dav/test');
await page.locator('.modal .fld input[placeholder*="云盘账号"]').fill('user@example.com');
await page.locator('.modal .fld input[placeholder*="应用密码"]').fill('pass');
await page.locator('.modal .btn:has-text("立即同步")').click();
await page.waitForTimeout(1500);
ok('云同步尝试（失败提示不崩溃）', jsErrors.length === 0);
await page.click('.modal-x');

ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 1).join(' | '));

// ===== 移动端：空白长按 → 模板菜单 =====
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
const mp = await mctx.newPage();
await mp.goto(URL);
await mp.waitForSelector('.welcome');
await mp.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await mp.reload();
await mp.waitForSelector('.welcome');
await mp.click('text=＋ 新建项目');
await mp.click('.type-card:has-text("小说")');
await mp.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await mp.click('.modal-actions .btn.primary');
await mp.waitForSelector('.canvas-wrap');
await mp.waitForTimeout(800);
const cdp = await mctx.newCDPSession(mp);
const blank = await mp.evaluate(() => {
  for (let dy = 200; dy < 700; dy += 60) {
    for (let dx = 40; dx < 350; dx += 60) {
      const el = document.elementFromPoint(dx, dy);
      if (el && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid'))) return { x: dx, y: dy };
    }
  }
  return { x: 60, y: 400 };
});
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: blank.x, y: blank.y }] });
await new Promise((r) => setTimeout(r, 700));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mp.waitForTimeout(400);
const tplMenuVisible = await mp.locator('.tpl-menu').count();
ok('移动端空白长按弹出模板菜单', tplMenuVisible === 1, String(tplMenuVisible));
await mp.keyboard.press('Escape');
// 空白长按后再双击不冲突（菜单已关，双击新建生效）
const before = await mp.locator('.card').count();
const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 40));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 120));
};
await tap(blank.x, blank.y);
await tap(blank.x, blank.y);
await mp.waitForTimeout(400);
const after = await mp.locator('.card').count();
ok('长按/双击互不冲突（双击新建仍可用）', after === before + 1, `${before}→${after}`);

console.log('\n========== 第二轮新功能验证 ==========');
results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith('✓')) ? '\n🎉 全部通过' : '\n❌ 有失败项');
await browser.close();
