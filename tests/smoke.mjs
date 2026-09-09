// 创作助手 端到端冒烟测试（Playwright + 本地 Chromium）
import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
let failures = 0;
function ok(name, cond, extra = '') {
  curStep++;
  curStep++;
  results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page1 = await ctx1.newPage();
const jsErrors = [];
let curStep = 0;
page1.on('pageerror', (e) => { jsErrors.push(String(e) + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); console.log('[P1 ERROR at step', curStep + ']', String(e).slice(0, 130)); });
page1.on('console', (m) => { if (m.type() === 'error') jsErrors.push('console: ' + m.text()); });

const blankPoint = async () => {
  const w = await page1.locator('.canvas-wrap').boundingBox();
  for (let dy = 100; dy < 700; dy += 40) {
    for (let dx = 24; dx < 800; dx += 60) {
      const ok2 = await page1.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!(el.classList && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid')));
      }, [w.x + dx, w.y + dy]);
      if (ok2) return { x: w.x + dx, y: w.y + dy };
    }
  }
  return { x: w.x + 100, y: w.y + 100 };
};
const newSticky = async () => {
  const p = await blankPoint();
  await page1.mouse.dblclick(p.x, p.y);
  await page1.waitForTimeout(300);
};

// ===== 1. 欢迎页 =====
await page1.goto(URL);
await page1.waitForSelector('.welcome', { timeout: 8000 });
await page1.evaluate(() => { localStorage.setItem('cs.helpSeen', '1'); });
ok('1. 欢迎页加载', true);

// ===== 2. 新建项目（小说 + 样例）=====
await page1.click('text=＋ 新建项目');
await page1.waitForSelector('.type-card');
await page1.click('.type-card:has-text("小说")');
await page1.fill('.modal input[placeholder*="未命名"]', '冒烟测试之书');
await page1.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page1.click('.modal-actions .btn.primary');
await page1.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page1.waitForTimeout(600);
const cardCount1 = await page1.locator('.card').count();
ok('2. 样例项目创建，卡片数=' + cardCount1, cardCount1 >= 12, String(cardCount1));
const secCount = await page1.locator('.sec-item').count();
ok('3. 分区列表加载 (' + secCount + ')', secCount >= 8, String(secCount));

// ===== 4. 富文本编辑 =====
const firstCard = page1.locator('.card').first();
await firstCard.dblclick({ position: { x: 120, y: 60 } });
await page1.waitForSelector('.rich-editor', { timeout: 5000 });
await page1.click('.rich-editor-body');
await page1.keyboard.type('冒烟测试：这是正文内容，用于验证字数统计。');
await page1.keyboard.press('Escape');
await page1.waitForTimeout(300);
const hasWc = await page1.locator('.card-wc').count();
ok('4. 富文本编辑并显示字数', hasWc >= 1);

// ===== 5. 工具栏新建便签 =====
const before = await page1.locator('.card').count();
await newSticky();
await page1.waitForTimeout(300);
const after = await page1.locator('.card').count();
ok('5. 新建便签卡 (+1)', after === before + 1, `${before}→${after}`);

// ===== 6. 拖拽卡片（用 elementHandle 固定元素）=====
const dragCardH = await page1.locator('.card').nth(1).elementHandle();
const b1 = await dragCardH.boundingBox();
await page1.mouse.move(b1.x + 100, b1.y + 18);
await page1.mouse.down();
await page1.mouse.move(b1.x + 220, b1.y + 120, { steps: 8 });
await page1.mouse.up();
await page1.waitForTimeout(200);
const b2 = await dragCardH.boundingBox();
ok('6. 拖拽移动卡片', Math.abs(b2.x - b1.x) > 60 && Math.abs(b2.y - b1.y) > 60, `(${Math.round(b1.x)},${Math.round(b1.y)})→(${Math.round(b2.x)},${Math.round(b2.y)})`);

// ===== 7. 缩放卡片 =====
await dragCardH.click({ position: { x: 20, y: 20 } });
await page1.waitForTimeout(200);
const selHandle = page1.locator('.rh-se').first();
const hb = await selHandle.boundingBox();
const beforeW = (await dragCardH.boundingBox()).width;
await page1.mouse.move(hb.x + 3, hb.y + 3);
await page1.mouse.down();
await page1.mouse.move(hb.x + 90, hb.y + 70, { steps: 6 });
await page1.mouse.up();
await page1.waitForTimeout(200);
const afterW = (await dragCardH.boundingBox()).width;
ok('7. 拖拽手柄缩放卡片', afterW > beforeW + 40, `${Math.round(beforeW)}→${Math.round(afterW)}`);

// ===== 8. 连线（用两张全新便签卡，保证无既有连线）=====
const edgeText = await page1.locator('.statusbar').innerText();
const edgeCountBefore = parseInt((edgeText.match(/连线 (\d+)/) || [])[1] || '0', 10);
await newSticky();
await newSticky();
await page1.waitForTimeout(300);
const totalCards = await page1.locator('.card').count();
const stickyAH = await page1.locator('.card').last().elementHandle();
const stickyBH = await page1.locator('.card').nth(totalCards - 2).elementHandle();
await stickyAH.click({ position: { x: 20, y: 20 } });
await page1.waitForTimeout(150);
const anchor = page1.locator('.anchor-e').last();
const ab = await anchor.boundingBox();
const bb = await stickyBH.boundingBox();
await page1.mouse.move(ab.x + 6, ab.y + 6);
await page1.mouse.down();
await page1.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 10 });
await page1.mouse.up();
await page1.waitForTimeout(300);
const edgeText2 = await page1.locator('.statusbar').innerText();
const edgeCountAfter = parseInt((edgeText2.match(/连线 (\d+)/) || [])[1] || '0', 10);
ok('8. 锚点拖拽连线', edgeCountAfter === edgeCountBefore + 1, `${edgeCountBefore}→${edgeCountAfter}`);

// ===== 9. 右下角悬浮工具面板（折叠/展开 + 工具切换）=====
await page1.click('.zc-fab');
await page1.waitForTimeout(250);
const panelOpen = await page1.locator('.zc-panel').count();
await page1.click('.zc-tool:has-text("移动")');
const moveActive = await page1.locator('.zc-tool.active:has-text("移动")').count();
// 移动工具下拖空白平移
const wrapBox9 = await page1.locator('.canvas-wrap').boundingBox();
const z9a = await page1.locator('.zoom-val').innerText();
await page1.mouse.move(wrapBox9.x + wrapBox9.width - 120, wrapBox9.y + 80);
await page1.mouse.down();
await page1.mouse.move(wrapBox9.x + wrapBox9.width - 40, wrapBox9.y + 140, { steps: 6 });
await page1.mouse.up();
await page1.waitForTimeout(200);
const z9b = await page1.locator('.zoom-val').innerText();
await page1.click('.zc-tool:has-text("框选")');
await page1.click('.zc-close');
await page1.waitForTimeout(200);
const panelClosed = await page1.locator('.zc-panel').count();
ok('9. 悬浮面板展开/工具切换/折叠', panelOpen === 1 && moveActive === 1 && z9a === z9b && panelClosed === 0, `面板${panelOpen}→${panelClosed} 缩放${z9a}→${z9b}`);

// ===== 10. 缩放以选中对象为锚点 =====
await page1.click('.zc-fab');
await page1.waitForTimeout(200);
await page1.keyboard.press('Escape');
await page1.waitForTimeout(200);
const zoomCard = await page1.locator('.card').nth(2).elementHandle();
await zoomCard.click({ position: { x: 30, y: 30 }, force: true });
await page1.waitForTimeout(200);
const zcBefore = await page1.locator('.zoom-val').innerText();
const zb = await zoomCard.boundingBox();
const centerBefore = { x: zb.x + zb.width / 2, y: zb.y + zb.height / 2 };
// 鼠标移到别处（远离卡片），点面板 + 按钮缩放：应以选中卡为锚
await page1.mouse.move(120, 700);
await page1.click('.zc-zoom button:has-text("+")');
await page1.waitForTimeout(400);
const zcAfter = await page1.locator('.zoom-val').innerText();
const za = await zoomCard.boundingBox();
const centerAfter = { x: za.x + za.width / 2, y: za.y + za.height / 2 };
const drift = Math.hypot(centerAfter.x - centerBefore.x, centerAfter.y - centerBefore.y);
ok('10. 缩放以选中对象为锚', zcBefore !== zcAfter && drift < 60, `${zcBefore}→${zcAfter} 漂移${Math.round(drift)}px`);

// ===== 11. 删除卡片 =====
const curCount = await page1.locator('.card').count();
const delCardH = await page1.locator('.card').nth(0).elementHandle();
await delCardH.click({ position: { x: 30, y: 30 }, force: true });
await page1.keyboard.press('Delete');
await page1.waitForTimeout(300);
const countAfterDel = await page1.locator('.card').count();
ok('11. Delete 删除卡片', countAfterDel === curCount - 1, `${curCount}→${countAfterDel}`);

// ===== 12. 导出/设置模态框 =====
await page1.click('button[title="导出"]');
await page1.waitForSelector('.modal');
ok('12. 导出模态框', true);
await page1.click('.modal-x');
await page1.click('button[title="设置"]');
await page1.waitForSelector('.modal');
await page1.check('.modal input[type="checkbox"] >> nth=0');
await page1.waitForTimeout(150);
const theme = await page1.evaluate(() => document.documentElement.dataset.theme);
ok('13. 深色主题切换', theme === 'dark', theme);
await page1.uncheck('.modal input[type="checkbox"] >> nth=0');
await page1.click('.modal-actions .btn:has-text("完成")');

// ===== 14. 局域网协同：上传并连接 =====
await page1.click('button[title="局域网协同"]');
await page1.waitForSelector('.modal');
await page1.fill('.modal input[placeholder*="192.168"]', 'http://localhost:8787');
await page1.click('.modal .btn:has-text("上传并连接")');
await page1.waitForSelector('.tb-status.on', { timeout: 10000 });
ok('14. 上传并连接协同服务器', true);

// ===== 15. 第二个用户从服务器打开同一项目 =====
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page2 = await ctx2.newPage();
const jsErrors2 = [];
page2.on('pageerror', (e) => { jsErrors2.push(String(e) + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); console.log('[P2 ERROR]', String(e).slice(0, 130)); });
await page2.goto(URL);
await page2.waitForSelector('.welcome');
await page2.click('text=📂 打开项目');
await page2.waitForSelector('.modal');
await page2.fill('.modal input[placeholder*="192.168"]', 'http://localhost:8787');
await page2.click('.modal .btn:has-text("刷新服务器列表")');
await page2.waitForSelector('.proj-item', { timeout: 8000 });
const serverCount = await page2.locator('.proj-item').count();
ok('15. 服务器项目列表可见', serverCount >= 1, String(serverCount));
await page2.locator('.proj-main').first().click();
await page2.waitForSelector('.canvas-wrap', { timeout: 8000 });
const cardCount2 = await page2.locator('.card').count();
ok('16. 用户2打开同一项目', cardCount2 === (await page1.locator('.card').count()), String(cardCount2));

// ===== 16b. 实时同步：用户2新建卡片 → 用户1看到 =====
const before1 = await page1.locator('.card').count();
{
  const w = await page2.locator('.canvas-wrap').boundingBox();
  await page2.mouse.dblclick(w.x + 100, w.y + 100);
  await page2.waitForTimeout(300);
}
await page1.waitForFunction(
  (n) => document.querySelectorAll('.card').length === n,
  before1 + 1,
  { timeout: 6000 }
);
ok('17. 实时协同：用户2 新建 → 用户1 同步可见', true, `${before1}→${before1 + 1}`);

// ===== 16c. 实时协同：用户2 编辑标题 → 用户1 同步 =====
const titleCard2 = page2.locator('.card').last();
await titleCard2.click({ position: { x: 30, y: 30 }, force: true });
await page1.waitForTimeout(200);
const titleInput = page2.locator('.card-title-input').last();
await titleInput.dblclick();
await titleInput.fill('来自协作者的卡片');
await page1.waitForFunction(
  () => [...document.querySelectorAll('.card-title-input')].some((i) => i.value === '来自协作者的卡片'),
  null,
  { timeout: 6000 }
);
ok('18. 实时协同：标题文字同步', true);

// ===== 17. 刷新后持久化 =====
await page1.reload();
await page1.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page1.waitForTimeout(400);
const cardCount3 = await page1.locator('.card').count();
ok('19. 刷新后项目持久化', cardCount3 === before1 + 1, String(cardCount3));
const synced = await page1.locator('.tb-status.on').count();
ok('20. 刷新后协同状态恢复', synced >= 1);

ok('21. 无未捕获 JS 错误', jsErrors.length === 0 && jsErrors2.length === 0, jsErrors.slice(0, 2).join(' | '));

console.log('\n========== 冒烟测试结果 ==========');
results.forEach((r) => console.log(r));
console.log(failures === 0 ? '\n🎉 全部通过' : `\n❌ ${failures} 项失败`);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
