import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); };

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
// ===== 桌面：页面 / 文件夹 / 模板菜单 / AI 面板 =====
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

// 1. 页面切换器
await page.click('.page-switcher-btn');
await page.waitForSelector('.page-menu');
const pageItems1 = await page.locator('.page-item').count();
ok('页面切换器打开', pageItems1 === 1, String(pageItems1));
await page.click('.page-add');
await page.waitForTimeout(400);
const cardsOnPage2 = await page.locator('.card').count();
await page.click('.page-switcher-btn');
await page.waitForSelector('.page-menu');
const pageItems2 = await page.locator('.page-item').count();
ok('新建页面并切换（新页为空）', pageItems2 === 2 && cardsOnPage2 === 0, `页${pageItems2} 卡${cardsOnPage2}`);
await page.click('.page-switcher-btn'); // 收起菜单
await page.waitForTimeout(200);
// 新页加一张卡
await page.mouse.dblclick(720, 450);
await page.waitForTimeout(300);
const cardsPage2 = await page.locator('.card').count();
// 切回页面1
await page.click('.page-switcher-btn');
await page.waitForSelector('.page-menu');
await page.click('.page-item >> nth=0');
await page.waitForTimeout(400);
const cardsPage1 = await page.locator('.card').count();
ok('切回页面1（数据独立）', cardsPage1 === 15 && cardsPage2 === 1, `页1=${cardsPage1} 页2=${cardsPage2}`);
// 重命名页面
await page.click('.page-switcher-btn');
await page.waitForSelector('.page-menu');
await page.hover('.page-item >> nth=0');
page.once('dialog', (d) => d.accept('序章'));
await page.locator('.page-item .page-actions button[title="重命名页面"]').first().click();
await page.waitForTimeout(300);
const pageName = await page.locator('.page-switcher-btn').getAttribute('title');
ok('重命名页面', (pageName || '').includes('序章'), pageName || '');
// 删除页面（页2有卡，需要确认；菜单此时仍开着）
await page.hover('.page-item >> nth=0');
page.once('dialog', (d) => d.accept());
await page.locator('.page-item .page-actions button[title="删除页面"]').first().click();
await page.waitForTimeout(400);
await page.click('.page-switcher-btn');
await page.waitForSelector('.page-menu');
const pageItems3 = await page.locator('.page-item').count();
ok('删除页面', pageItems3 === 1, String(pageItems3));
// 刷新后页面持久化
await page.reload();
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(700);
const afterReload = await page.locator('.page-switcher-btn').getAttribute('title');
ok('刷新后页面持久化', (afterReload || '').includes('页面 2'), afterReload || '');

// 2. 文件夹分组（打开项目模态框）
await page.click('button[title="导出"]');
await page.waitForSelector('.modal');
await page.click('.modal-x');
await page.click('button[title="局域网协同"]');
await page.waitForSelector('.modal');
await page.click('.modal-x');
await page.click('.tb-btn:has-text("📂")').catch(() => {});
// 直接通过设置打开？用欢迎页方式：退出项目再打开
await page.evaluate(() => { localStorage.removeItem('cs.current'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=📂 打开项目');
await page.waitForSelector('.modal');
page.once('dialog', (d) => d.accept('我的创作'));
await page.click('.modal .btn:has-text("新建文件夹")');
await page.waitForTimeout(200);
const folderBlocks = await page.locator('.folder-block').count();
const folderName = await page.locator('.folder-name').first().innerText();
ok('新建文件夹并分组显示', folderBlocks >= 2 && folderName.includes('我的创作'), `块${folderBlocks} ${folderName}`);
// 移动项目到文件夹
await page.selectOption('.proj-folder-select >> nth=0', { index: 1 });
await page.waitForTimeout(200);
const inFolder = await page.locator('.folder-block').first().locator('.proj-item').count();
ok('项目移入文件夹', inFolder === 1, String(inFolder));
await page.click('.modal-x');

// 3. 长按/右键 → 插入模板菜单
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(700);
const card0 = page.locator('.card').nth(0);
// 用合成 MouseEvent 触发右键（带真实坐标，避免卡片交叠时的命中测试干扰）
await card0.evaluate((el) => {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
});
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("插入模板")');
await page.waitForSelector('.tpl-menu', { timeout: 3000 });
const tplItems = await page.locator('.tpl-menu button').count();
ok('右键 → 插入模板菜单', tplItems >= 10, String(tplItems));
await page.locator('.tpl-menu button:has-text("重要角色")').first().click();
await page.waitForTimeout(500);
ok('模板插入画布', (await page.locator('.card').count()) >= 16, String(await page.locator('.card').count()));
// 右键菜单高度（compact）
await card0.evaluate((el) => {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
});
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
const menuBox = await page.locator('.ctx-menu').boundingBox();
ok('卡片右键菜单紧凑高度', (menuBox ? menuBox.height : 999) < 300, menuBox ? Math.round(menuBox.height) + 'px' : 'none');
await page.keyboard.press('Escape');

// 4. 点击空白关闭弹出菜单
await card0.evaluate((el) => {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
});
await page.waitForSelector('.ctx-menu');
await page.mouse.click(1200, 850);
await page.waitForTimeout(250);
ok('点击空白关闭右键菜单', (await page.locator('.ctx-menu').count()) === 0);

// 5. FAB 图标：编辑/画笔
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("选择")');
await page.click('.zc-close');
await page.waitForTimeout(150);
const fabEdit = await page.locator('.zc-fab').innerText();
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-tool:has-text("画笔")');
await page.click('.zc-close');
await page.waitForTimeout(150);
const fabPen = await page.locator('.zc-fab').innerText();
ok('折叠后图标区分（选择➤/画笔🖌️）', fabEdit.includes('➤') && fabPen.includes('🖌️'), `选择=${fabEdit.trim()} 画笔=${fabPen.trim()}`);
// 画笔设置面板
await page.click('.zc-fab');
await page.waitForTimeout(200);
const penTools = await page.locator('.pen-tools').count();
ok('画笔设置面板（颜色/粗细/橡皮/清空）', penTools === 1);
await page.click('.zc-close');

// 6. AI 面板：智能体预设 + 协同编辑按钮（先启用 AI）
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('cs.settings') || '{}');
  s.ai = { enabled: true, endpoint: 'http://localhost:11434/v1', apiKey: '', model: 'qwen2.5:7b' };
  localStorage.setItem('cs.settings', JSON.stringify(s));
});
await page.reload();
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(700);
await page.click('.sidebar-right .sb-tabs button:has-text("灵感")');
await page.waitForTimeout(200);
await page.click('.ideas .sb-tabs button:has-text("AI")');
await page.waitForTimeout(300);
const agents = await page.locator('.ai-agent').count();
ok('AI 智能体预设', agents >= 10, String(agents));
await page.click('.ai-agent:has-text("文风润色")');
await page.waitForTimeout(200);
const agentDesc = await page.locator('.ai-agent-desc').innerText();
ok('切换智能体', agentDesc.includes('文风润色师'), agentDesc);
const quickBtns = await page.locator('.ai-quick button').count();
ok('智能体快捷指令', quickBtns >= 4, String(quickBtns));

// 7. 设置里的 AI 预设（本地模型）
await page.click('.tb-btn[title="设置"]');
await page.waitForSelector('.modal');
const presets = await page.locator('.ai-presets button').count();
const hasLocal = await page.locator('.ai-presets button:has-text("Ollama")').count();
ok('设置 AI 服务预设（含本地模型）', presets >= 5 && hasLocal === 1, `预设${presets}`);
await page.click('.ai-presets button:has-text("Ollama")');
await page.waitForTimeout(150);
const endpoint = await page.locator('.modal input[placeholder*="localhost"]').first().inputValue();
ok('本地模型预设自动填入', endpoint.includes('11434'), endpoint);
await page.click('.modal-x');

ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 1).join(' | '));

// ===== 移动端：双击空白新建 =====
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
const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 40));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 120));
};
const before = await mp.locator('.card').count();
// 找一个空白点双击（两次快速 tap）
const blank = await mp.evaluate(() => {
  for (let dy = 200; dy < 700; dy += 60) {
    for (let dx = 60; dx < 330; dx += 60) {
      const el = document.elementFromPoint(dx, dy);
      if (el && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid'))) return { x: dx, y: dy };
    }
  }
  return { x: 100, y: 500 };
});
await tap(blank.x, blank.y);
await tap(blank.x, blank.y);
await mp.waitForTimeout(400);
const after = await mp.locator('.card').count();
ok('移动端双击空白新建便签', after === before + 1, `${before}→${after}`);
// 画布底部遮罩修复：打开左侧抽屉后侧栏仍可点击
await mp.click('.tb-btn.mobile-only');
await mp.waitForTimeout(400);
const drawerOpen = await mp.locator('.sidebar-left.open').count();
const secClick = await mp.locator('.sec-item').first().click().then(() => true).catch(() => false);
await mp.waitForTimeout(300);
ok('侧边栏展开后仍可点击（遮罩不挡）', drawerOpen === 1 && secClick === true);

console.log('\n========== 新功能验证 ==========');
results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith('✓')) ? '\n🎉 全部通过' : '\n❌ 有失败项');
await browser.close();
