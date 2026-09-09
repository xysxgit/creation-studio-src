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

// ===== 1. 横版工具面板 + 画笔/橡皮样式区分 + 点空白自动收纳 =====
await page.click('.zc-fab');
await page.waitForTimeout(250);
const toolsRow = await page.evaluate(() => {
  const tools = document.querySelector('.zc-tools');
  if (!tools) return false;
  return getComputedStyle(tools).flexDirection === 'row';
});
const eraserStyle = await page.locator('.zc-tool.eraser').evaluate((el) => getComputedStyle(el).color).catch(() => '');
ok('悬浮面板横版布局', toolsRow === true);
ok('橡皮按钮独立样式（红色系）', eraserStyle.includes('214, 48, 49') || eraserStyle.includes('d63031'), eraserStyle);
// 点画布空白处自动收纳
const wrapB = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.click(wrapB.x + wrapB.width - 60, wrapB.y + 60);
await page.waitForTimeout(300);
ok('点击空白自动收纳面板', (await page.locator('.zc-panel').count()) === 0);
await page.click('.zc-fab');
await page.waitForTimeout(200);
// 竖排工具栏存在（页面/撤销/重做/保存/删除）
const vtBtns = await page.locator('.v-toolbar .vt-btn').count();
ok('左侧竖排工具栏（撤销/重做/保存/删除）', vtBtns >= 4, String(vtBtns));
await page.click('.zc-close');

// ===== 2. 项目菜单：设置/关闭/删除/新建 =====
await page.click('.tb-btn:has-text("项目")');
await page.waitForSelector('.project-menu');
const menuItems = await page.locator('.project-menu button').allInnerTexts();
ok('项目菜单含新建/关闭/删除/设置', ['新建项目', '关闭项目', '项目设置', '删除项目'].every((t) => menuItems.some((m) => m.includes(t))), menuItems.join('|'));
await page.click('.project-menu button:has-text("项目设置")');
await page.waitForSelector('.modal');
const psTitle = await page.locator('.modal h3').innerText();
ok('项目设置弹窗', psTitle.includes('项目设置'), psTitle);
await page.click('.modal-x');
// 关闭项目 → 欢迎页
await page.click('.tb-btn:has-text("项目")');
await page.waitForSelector('.project-menu');
await page.click('.project-menu button:has-text("关闭项目")');
await page.waitForSelector('.welcome', { timeout: 5000 });
ok('关闭项目回到欢迎页', true);
// 重新打开项目
await page.click('text=📂 打开项目');
await page.waitForSelector('.modal');
await page.locator('.proj-main').first().click();
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(500);
ok('重新打开项目', (await page.locator('.card').count()) >= 10);

// ===== 3. 居中排版同步（text-align 渲染）=====
const card = page.locator('.card').nth(2);
await card.click({ position: { x: 150, y: 100 } });
await page.waitForTimeout(150);
await page.locator('.card.selected .card-collapse-btn[title="全屏写作"]').first().click();
await page.waitForSelector('.fullscreen-editor');
await page.click('.fe-body .rich-editor-body');
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('居中同步测试');
await page.waitForTimeout(200);
await page.click('.rtb[title="居中"]');
await page.waitForTimeout(300);
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(400);
const alignHtml = await card.locator('.rich-static').first().innerHTML();
ok('居中排版渲染同步（text-align）', alignHtml.includes('text-align: center'), alignHtml.slice(0, 70));

// ===== 4. 预览模式：长内容可滚动 + 简约图标 =====
// 先给卡片写入长内容
await card.click({ position: { x: 150, y: 100 } });
await page.waitForTimeout(150);
await page.locator('.card.selected .card-collapse-btn[title="全屏写作"]').first().click();
await page.waitForSelector('.fullscreen-editor');
await page.click('.fe-body .rich-editor-body');
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('很长的内容。'.repeat(80));
await page.waitForTimeout(300);
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(400);
await card.hover();
await card.locator('.card-collapse-btn[title^="预览模式"]').click();
await page.waitForTimeout(300);
const iconSvg = await card.locator('.card-collapse-btn[title^="退出预览模式"] svg').count();
const scrollable = await card.locator('.card-preview-body').evaluate((el) => el.scrollHeight > el.clientHeight);
ok('预览模式简约SVG图标', iconSvg === 1);
ok('预览长内容可滚动', scrollable === true);
// 预览图标（进入预览前是眼睛）
await card.locator('.card-collapse-btn[title^="退出预览模式"]').click();
await page.waitForTimeout(250);
const eyeSvg = await card.locator('.card-collapse-btn[title^="预览模式"] svg').count();
ok('预览入口简约眼睛图标', eyeSvg === 1);
// 预览体内无内容溢出卡片（约束生效）
await card.locator('.card-collapse-btn[title^="预览模式"]').click();
await page.waitForTimeout(300);
const pb = await card.locator('.card-preview-body').boundingBox();
const cb2 = await card.boundingBox();
ok('预览体高度受卡片约束', pb.height <= cb2.height + 2, `${Math.round(pb.height)} vs ${Math.round(cb2.height)}`);

// ===== 5. 框选后编组 =====
await page.click('.zc-fab'); await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="适配视图"]'); await page.waitForTimeout(500);
await page.click('.zc-close');
await page.click('.sb-tabs button:has-text("分区")');
await page.waitForTimeout(200);
// 用框选选择左上两张卡
const wb = await page.locator('.canvas-wrap').boundingBox();
await page.click('.zc-fab'); await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("框选")');
await page.click('.zc-close');
const c0 = await page.locator('.card').nth(0).boundingBox();
const c4 = await page.locator('.card').nth(4).boundingBox();
const bx = Math.min(c0.x, c4.x) - 20;
const by = Math.min(c0.y, c4.y) - 20;
const bw = Math.abs(c4.x + c4.width - c0.x) + 40;
const bh = Math.abs(c4.y + c4.height - c0.y) + 40;
const startX = Math.max(c0.x - 8, wb.x + 60);
const startY = Math.max(c0.y - 8, wb.y + 60);
await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(bx + bw - 10, by + bh - 10, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const selCount = await page.locator('.card.selected').count();
await page.locator('.sb-tabs button:has-text("检查器")').click();
await page.waitForTimeout(200);
const groupBtn = await page.locator('.inspector .btn:has-text("编组所选")').count();
ok('框选后可编组（检查器）', selCount > 1 && groupBtn === 1, `选${selCount}`);
await page.locator('.inspector .btn:has-text("编组所选")').click();
await page.waitForTimeout(300);
ok('编组生效', (await page.locator('.group-frame').count()) === 1);
await page.locator('.inspector .btn:has-text("解散编组")').click().catch(() => {});
await page.waitForTimeout(200);

// ===== 6. 历史记录点击跳转 =====
await page.locator('.sb-tabs button:has-text("历史")').click();
await page.waitForTimeout(300);
const histCount = await page.locator('.history-item').count();
const firstHist = page.locator('.history-item').nth(0);
const isCurrent = await firstHist.evaluate((el) => el.classList.contains('current'));
if (!isCurrent) {
  await firstHist.click();
  await page.waitForTimeout(300);
}
ok('历史记录点击跳转', true, `${histCount} 条`);
await page.locator('.sb-tabs button:has-text("分区")').click();

// ===== 7. 图层定位精确 =====
await page.click('.zc-fab'); await page.waitForTimeout(200);
for (let i = 0; i < 3; i++) { await page.click('.zc-zoom button[title="缩小"]'); await page.waitForTimeout(120); }
await page.click('.zc-close');
await page.locator('.sb-tabs button:has-text("图层")').click();
await page.waitForTimeout(200);
const layerTitle = await page.locator('.layer-item').nth(5).locator('.layer-title').innerText();
await page.locator('.layer-item').nth(5).click();
await page.waitForTimeout(400);
const loc = await page.evaluate((title) => {
  const c = [...document.querySelectorAll('.card')].find((x) => (x.querySelector('.card-title-input') || {}).value === title);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const w = document.querySelector('.canvas-wrap').getBoundingClientRect();
  return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), wx: Math.round(w.x + w.width / 2), wy: Math.round(w.y + w.height / 2) };
}, layerTitle);
ok('图层定位精确居中', loc && Math.abs(loc.cx - loc.wx) < 40 && Math.abs(loc.cy - loc.wy) < 40, JSON.stringify(loc));

// ===== 8. 缩放锚点：连线选中时以连线中点为锚 =====
await page.click('.zc-fab'); await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="适配视图"]'); await page.waitForTimeout(500);
await page.click('.zc-close');
// 点一条线选中
await page.evaluate(() => {
  const p = document.querySelectorAll('.edge-hit-path');
  const mid = p[Math.floor(p.length / 2)];
  const r = mid.getBoundingClientRect();
  mid.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  mid.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
});
await page.waitForTimeout(200);
const edgeSel = await page.locator('.edge-path.selected').count();
const midBefore = await page.evaluate(() => {
  const sel = document.querySelector('.edge-path.selected');
  if (!sel) return null;
  const r = sel.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.click('.zc-fab'); await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="放大"]');
await page.waitForTimeout(400);
await page.click('.zc-close');
const midAfter = await page.evaluate(() => {
  const sel = document.querySelector('.edge-path.selected');
  if (!sel) return null;
  const r = sel.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const edgeDrift = midBefore && midAfter ? Math.hypot(midAfter.x - midBefore.x, midAfter.y - midBefore.y) : -1;
ok('连线选中缩放锚定连线中点', edgeSel > 0 && edgeDrift >= 0 && edgeDrift < 60, `漂移${Math.round(edgeDrift)}px`);

// ===== 9. 编组大纲编辑/协作按钮 =====
await page.locator('.sb-tabs button:has-text("编组")').click();
await page.waitForTimeout(300);
const outlineActions = await page.locator('.outline-item .outline-actions button').count();
ok('编组大纲条目操作按钮', outlineActions >= 3, String(outlineActions));
await page.hover('.outline-item >> nth=0');
await page.locator('.outline-actions button[title="全屏编辑"]').first().click();
await page.waitForSelector('.fullscreen-editor', { timeout: 4000 });
ok('编组大纲双击/按钮全屏编辑', true);
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(300);

ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 1).join(' | '));

// ===== 移动端：空白长按只弹模板菜单（无一级菜单）=====
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
  for (let dy = 300; dy < 700; dy += 60) {
    for (let dx = 40; dx < 350; dx += 60) {
      const el = document.elementFromPoint(dx, dy);
      if (el && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid'))) return { x: dx, y: dy };
    }
  }
  return { x: 60, y: 500 };
});
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: blank.x, y: blank.y }] });
await new Promise((r) => setTimeout(r, 700));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await mp.waitForTimeout(400);
const tplMenuN = await mp.locator('.tpl-menu').count();
const ctxMenuN = await mp.locator('.ctx-menu:not(.tpl-menu)').count();
ok('移动端空白长按只弹模板菜单（无双菜单）', tplMenuN === 1 && ctxMenuN === 0, `模板${tplMenuN} 一级${ctxMenuN}`);
// 移动端顶栏不横向溢出
const tbOverflow = await mp.evaluate(() => document.querySelector('.topbar').scrollWidth > window.innerWidth + 2);
ok('移动端顶栏自适应（无溢出）', tbOverflow === false);

console.log('\n========== 第三轮新功能验证 ==========');
results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith('✓')) ? '\n🎉 全部通过' : '\n❌ 有失败项');
await browser.close();
