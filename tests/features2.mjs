// 第三轮功能测试：空白取消 / 线型箭头 / 图层 / 模板 / 编辑模式全屏 / 画笔 / 编组 / 历史
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
page.on('dialog', async (d) => {
  if (d.type() === 'prompt') { await d.accept('测试模板A'); return; }
  if (d.type() === 'confirm') { await d.accept(); return; }
  await d.dismiss();
});
const zoomText = async () => {
  const t = await page.locator('.statusbar').innerText();
  const m = t.match(/缩放 (\d+)%/);
  return m ? m[1] + '%' : '?';
};
const findBlank = async (wrap) => {
  for (let dy = 24; dy < 720 && true; dy += 36) {
    for (let dx = 24; dx < 800; dx += 60) {
      const isBlank = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!(el.classList && (el.classList.contains('canvas-wrap') || el.classList.contains('canvas-grid')));
      }, [wrap.x + dx, wrap.y + dy]);
      if (isBlank) return { x: wrap.x + dx, y: wrap.y + dy };
    }
  }
  return null;
};
const ensurePanel = async () => {
  const fabN = await page.locator('.zc-fab').count();
  const panelN = await page.locator('.zc-panel').count();
  if (fabN === 0 && panelN > 0) return; // 已展开
  if (fabN === 0) {
    await page.click('.zc-close');
    await page.waitForTimeout(150);
  }
  await page.click('.zc-fab');
  await page.waitForTimeout(250);
};
const findHittableMid = async () => {
  for (let i = 0; i < 14; i++) {
    const b = await page.locator('.edge-mid').nth(i).boundingBox();
    if (!b || b.x < 40 || b.x > 1380 || b.y < 60 || b.y > 820) continue;
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      let c = ''; try { c = el.className.baseVal || el.className || ''; } catch { c = ''; }
      return el.tagName + '.' + String(c);
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    if (String(hit).includes('edge-mid')) return b;
  }
  return null;
};

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

// ===== 1. 空白点击取消选择 =====
const card0 = await page.locator('.card').nth(0).elementHandle();
await card0.click({ position: { x: 30, y: 8 } });
await page.waitForTimeout(200);
const wrap = await page.locator('.canvas-wrap').boundingBox();
const blank = await findBlank(wrap);
await page.mouse.click(blank.x, blank.y);
await page.waitForTimeout(250);
ok('1. 点击空白取消选择', (await page.locator('.card.selected').count()) === 0);

// ===== 2. 线型/箭头切换（连线中段右按钮点击）=====
const midB = await findHittableMid();
await page.mouse.click(midB.x + midB.width / 2, midB.y + midB.height / 2);
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("线型")');
await page.waitForTimeout(250);
const d1 = await page.locator('.edge-path.selected').first().getAttribute('d');
await page.mouse.click(midB.x + midB.width / 2, midB.y + midB.height / 2);
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("线型")');
await page.waitForTimeout(250);
const d2 = await page.locator('.edge-path.selected').first().getAttribute('d');
await page.mouse.click(midB.x + midB.width / 2, midB.y + midB.height / 2);
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("箭头")');
await page.waitForTimeout(250);
const startArrow = await page.locator('.edge-path.selected').first().evaluate((el) => el.getAttribute('marker-start') || '');
await page.keyboard.press('Escape');
ok('2. 直线/折线/头箭切换', d1.includes('L') && d2.includes('L') && d1 !== d2 && startArrow.includes('arrow-back'), `${d1.slice(0, 20)}|${startArrow}`);

// ===== 3. 图层面板 =====
await page.click('.sb-tabs button:has-text("图层")');
await page.waitForTimeout(300);
const layerItems = await page.locator('.layer-item').count();
await page.locator('.layer-item').nth(2).click();
await page.waitForTimeout(300);
ok('3. 图层面板定位卡片', layerItems >= 12 && (await page.locator('.card.selected').count()) === 1, `${layerItems} 项`);

// ===== 4. 自定义模板 =====
await page.locator('.sb-tabs button:has-text("分区")').click();
await page.waitForTimeout(200);
const cardsBefore = await page.locator('.card').count();
// 先适配视图，保证目标卡片在视口内
await ensurePanel();
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(500);
await page.click('.zc-close');
await page.waitForTimeout(150);
const tplCard = await page.locator('.card').nth(3).elementHandle();
await tplCard.click({ button: 'right' });
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("存为模板")');
await page.waitForTimeout(500);
await page.locator('.sb-tabs button:has-text("灵感")').click();
await page.waitForTimeout(200);
await page.click('.ideas .sb-tabs button:has-text("模板")');
await page.waitForTimeout(300);
const myTpl = await page.locator('.my-tpl-row').count();
await page.locator('.my-tpl-row .tpl-item').first().click();
await page.waitForTimeout(500);
const cardsAfter = await page.locator('.card').count();
ok('4. 自定义模板存/插', myTpl === 1 && cardsAfter === cardsBefore + 1, `模板${myTpl} 卡${cardsBefore}→${cardsAfter}`);

// ===== 5. 编辑工具：双击卡片 → 全屏写作 =====
await page.locator('.sb-tabs button:has-text("检查器")').click();
await page.waitForTimeout(200);
await ensurePanel();
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(500);
await page.click('.zc-tool:has-text("选择")');
await page.waitForTimeout(200);
const editActive = await page.locator('.zc-tool.active:has-text("选择")').count();
const ecard = await page.locator('.card').nth(2).elementHandle();
const eb = await ecard.boundingBox();
await page.mouse.dblclick(eb.x + eb.width / 2, eb.y + eb.height / 2);
await page.waitForSelector('.fullscreen-editor', { timeout: 5000 });
ok('5. 编辑工具双击=全屏写作', editActive === 1);
await page.locator('.fe-actions .btn.primary').click();
await page.waitForTimeout(300);

// ===== 6. 画笔工具 =====
await page.click('.zc-tool:has-text("画笔")');
await page.waitForTimeout(200);
const pb = await findBlank(wrap);
await page.mouse.move(pb.x, pb.y);
await page.mouse.down();
await page.mouse.move(pb.x + 120, pb.y + 60, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const annCount = await page.locator('.annotation-line').count();
ok('6. 画笔绘制标注', annCount >= 1, String(annCount));
// 选择工具下点击标注可选中
await page.click('.zc-tool:has-text("框选")');
await page.waitForTimeout(200);
const annB = await page.locator('.annotation-line').first().boundingBox();
if (annB) {
  const hit = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    let c = ''; try { c = el.className.baseVal || el.className || ''; } catch { c = ''; }
    return el.tagName + '.' + String(c).slice(0, 30);
  }, [annB.x + annB.width / 2, annB.y + annB.height / 2]);
  await page.mouse.click(annB.x + annB.width / 2, annB.y + annB.height / 2);
}
await page.waitForTimeout(250);
const selAnn = await page.locator('.annotation-g.selected').count();
await page.keyboard.press('Delete');
await page.waitForTimeout(250);
ok('7. 标注选中并删除', selAnn === 1 && (await page.locator('.annotation-line').count()) === 0, `选${selAnn} 删后${await page.locator('.annotation-line').count()}`);

// ===== 7. 编组功能 =====
await ensurePanel();
await page.click('.zc-zoom button[title="适配视图"]');
await page.waitForTimeout(500);
const ga = await page.locator('.card').nth(0).elementHandle();
const gb = await page.locator('.card').nth(1).elementHandle();
const ba = await ga.boundingBox();
await ga.click({ position: { x: 30, y: 30 } });
await page.keyboard.down('Shift');
await gb.click({ position: { x: 30, y: 30 } });
await page.keyboard.up('Shift');
await page.waitForTimeout(200);
const selCount = await page.locator('.card.selected').count();
console.log('[diag] selCount:', selCount);
await ga.click({ button: 'right', position: { x: 30, y: 30 } });
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("编组")');
await page.waitForTimeout(400);
const groupFrame = await page.locator('.group-frame').count();
// 组内拖动：拖 ga 头部，gb 应一起移动
// 先取消多选，只选中 ga 单卡再拖动（组内单卡独立移动，不带动整组）
await page.mouse.click(blank.x, blank.y);
await page.waitForTimeout(200);
await ga.click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(200);
const gb0 = await gb.boundingBox();
await page.mouse.move(ba.x + 60, ba.y + 15);
await page.mouse.down();
await page.mouse.move(ba.x + 160, ba.y + 80, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const gb1 = await gb.boundingBox();
ok('8. 编组后单卡独立拖动（不带动整组）', selCount === 2 && groupFrame === 1 && Math.abs(gb1.x - gb0.x) < 10, `选${selCount} 组框${groupFrame} 位移${Math.round(gb1.x - gb0.x)}`);
// 组右键解散
const gfCount = await page.evaluate(() => document.querySelectorAll('.group-frame').length);
console.log('[diag] group frames in dom:', gfCount);
await page.locator('.group-name').first().click({ button: 'right' });
await page.waitForSelector('.ctx-menu', { timeout: 3000 });
await page.click('.ctx-menu button:has-text("解散")');
await page.waitForTimeout(300);
ok('9. 解散编组', (await page.locator('.group-frame').count()) === 0);

// ===== 8. 历史记录 =====
await page.click('.sb-tabs button:has-text("历史")');
await page.waitForTimeout(300);
const histItems = await page.locator('.history-item').count();
ok('10. 历史记录面板', histItems >= 3, `${histItems} 条`);

ok('11. 无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

console.log('\n========== 第三轮功能测试 ==========');
results.forEach((r) => console.log(r));
console.log(failures === 0 ? '\n🎉 全部通过' : `\n❌ ${failures} 项失败`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
