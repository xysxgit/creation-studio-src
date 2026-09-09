// 新功能端到端测试：工具切换 / 全屏写作 / 节点模式 / 连线分支 / 连线断开 / 帮助中心
import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const results = [];
let failures = 0;
function ok(name, cond, extra = '') {
  results.push(`${cond ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  console.log(results[results.length - 1]);
  if (!cond) failures++;
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const jsErrors = [];
page.on('pageerror', (e) => { jsErrors.push(String(e)); console.log('[P ERROR]', String(e).slice(0, 100)); });

const edgeCount = async () => parseInt((await page.locator('.statusbar').innerText()).match(/连线 (\d+)/)[1], 10);

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
await page.waitForTimeout(700);
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(600);
await page.click('.zc-close');
await page.waitForTimeout(200);

// ===== 1. 工具切换 =====
await page.click('.zc-fab');
await page.waitForTimeout(250);
await page.click('.zc-tool:has-text("移动")');
const moveActive = await page.locator('.zc-tool.active:has-text("移动")').count();
const wrapBox = await page.locator('.canvas-wrap').boundingBox();
const z0 = await page.locator('.zoom-val').innerText();
await page.mouse.move(wrapBox.x + wrapBox.width - 120, wrapBox.y + 100);
await page.mouse.down();
await page.mouse.move(wrapBox.x + wrapBox.width - 40, wrapBox.y + 160, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const z1 = await page.locator('.zoom-val').innerText();
ok('1. 移动工具可拖动画布且不缩放', moveActive === 1 && z0 === z1, `${z0} → ${z1}`);
await page.click('.zc-tool:has-text("框选")');
const selectActive = await page.locator('.zc-tool.active:has-text("框选")').count();
await page.click('.zc-close');
await page.waitForTimeout(150);
const panelClosed = await page.locator('.zc-panel').count();
ok('2. 切回选择工具', selectActive === 1 && panelClosed === 0);

// ===== 2. 全屏写作 =====
const cardH = await page.locator('.card').nth(0).elementHandle();
await cardH.click({ position: { x: 30, y: 8 } });
await page.waitForTimeout(200);
await page.locator('.card.selected .card-collapse-btn[title="全屏写作"]').first().click();
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
await page.click('.fe-body .rich-editor-body');
await page.keyboard.type('全屏写作测试内容');
await page.waitForTimeout(300);
const feWords = await page.locator('.fe-meta em').innerText();
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(300);
ok('3. 全屏写作（输入并完成）', (await page.locator('.fullscreen-editor').count()) === 0, feWords);

// ===== 3. 节点模式切换 =====
const cardB = await page.locator('.card').nth(1).elementHandle();
await cardB.click({ position: { x: 30, y: 8 } });
await page.waitForTimeout(200);
await page.click('.inspector .btn:has-text("节点")');
await page.waitForTimeout(300);
const nodeMode = await cardB.evaluate((el) => !!el.querySelector('.node-summary'));
await page.click('.inspector .btn:has-text("预览")');
await page.waitForTimeout(200);
ok('4. 卡片切换导图节点模式', nodeMode);

// ===== 4. 连线中段拖出分支节点 =====
const edgeBefore = await edgeCount();
let mb1 = null;
for (let i = 0; i < 14; i++) {
  const b = await page.locator('.edge-mid').nth(i).boundingBox();
  if (b && b.x > 40 && b.x < 1380 && b.y > 60 && b.y < 820) { mb1 = b; break; }
}
if (!mb1) throw new Error('no visible left mid');
await page.mouse.move(mb1.x + mb1.width / 2, mb1.y + mb1.height / 2);
await page.mouse.down();
const wb = await page.locator('.canvas-wrap').boundingBox();
let dest = null;
for (let dy = wb.y + 80; dy < wb.y + wb.height - 40; dy += 60) {
  for (let dx = wb.x + 60; dx < wb.x + wb.width - 60; dx += 80) {
    const ok = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!(el && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid')));
    }, [dx, dy]);
    if (ok) { dest = { x: dx, y: dy }; break; }
  }
  if (dest) break;
}
if (!dest) dest = { x: wb.x + wb.width - 90, y: wb.y + wb.height - 110 };
await page.mouse.move(dest.x, dest.y, { steps: 10 });
await page.mouse.up();
await page.waitForSelector('.branch-menu', { timeout: 4000 });
ok('5. 连线中段拖出分支菜单', true);
await page.click('.branch-menu button:has-text("事件")');
await page.waitForTimeout(500);
const edgeAfter = await edgeCount();
ok('6. 分支节点创建并自动连线', edgeAfter === edgeBefore + 1, `连线 ${edgeBefore}→${edgeAfter}`);

// ===== 5. 连线断开（右键中段点 → 断开）=====
const edgeBefore2 = await edgeCount();
await page.click('.zc-fab');
await page.waitForTimeout(200);
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(600);
let mb2 = null;
for (let i = 0; i < 14; i++) {
  const b = await page.locator('.edge-mid').nth(i).boundingBox();
  if (b && b.x > 40 && b.x < 1380 && b.y > 60 && b.y < 820) { mb2 = b; break; }
}
if (!mb2) throw new Error('no visible mid');
// 点击中段按钮弹出设置菜单；若被卡片遮挡则尝试下一个按钮
let menuShown = false;
for (let i = 0; i < 14 && !menuShown; i++) {
  const b = await page.locator('.edge-mid').nth(i).boundingBox();
  if (!b || b.x < 40 || b.x > 1380 || b.y < 60 || b.y > 820) continue;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  try {
    await page.waitForSelector('.ctx-menu .danger:has-text("断开")', { timeout: 1200 });
    menuShown = true;
  } catch { /* 被遮挡，试下一个 */ }
}
if (!menuShown) throw new Error('no settings menu from mid buttons');
await page.click('.ctx-menu .danger:has-text("断开")');
await page.waitForTimeout(300);
const edgeAfter2 = await edgeCount();
ok('7. 右键断开连线', edgeAfter2 === edgeBefore2 - 1, `${edgeBefore2}→${edgeAfter2}`);

// ===== 6. 帮助中心 =====
await page.evaluate(() => { localStorage.removeItem('cs.helpSeen'); });
await page.reload();
await page.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page.waitForSelector('.help-modal', { timeout: 5000 });
ok('8. 首次进入自动弹出操作说明', true);
await page.click('.help-tabs button:has-text("思维导图")');
await page.waitForTimeout(200);
const mindRows = await page.locator('.help-row').count();
await page.click('.modal-x');
ok('9. 帮助中心内容完整', mindRows >= 5, `${mindRows} 行`);

ok('10. 无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

console.log('\n========== 新功能测试 ==========');
results.forEach((r) => console.log(r));
console.log(failures === 0 ? '\n🎉 全部通过' : `\n❌ ${failures} 项失败`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
