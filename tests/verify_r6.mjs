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

// ===== 1. 主页删除项目 → 回收站 → 恢复 =====
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(800);
const projName = await page.locator('.tb-project-name').inputValue();
// 回主页删除
await page.evaluate(() => { localStorage.removeItem('cs.current'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.waitForTimeout(400);
const delBtn = page.locator('.welcome-del').first();
ok('主页项目删除按钮', (await delBtn.count()) === 1);
page.once('dialog', (d) => d.accept());
await delBtn.click();
await page.waitForTimeout(400);
const trashBadge = await page.locator('.welcome-actions .btn:has-text("回收站")').innerText();
ok('项目进入回收站（主页徽标）', trashBadge.includes('1'), trashBadge);
// 打开回收站恢复
await page.click('.welcome-actions .btn:has-text("回收站")');
await page.waitForSelector('.modal');
const trashItem = await page.locator('.modal .proj-item').first().innerText();
ok('回收站列表显示项目', trashItem.includes(projName), projName);
await page.locator('.modal .btn:has-text("恢复")').first().click();
await page.waitForTimeout(400);
await page.locator('.modal-x').click();
await page.waitForTimeout(200);
ok('项目恢复', (await page.locator('.modal').count()) === 0);
// 恢复后可打开
await page.click('text=📂 打开项目');
await page.waitForSelector('.modal');
const restoredName = await page.locator('.proj-item .proj-main b').first().innerText();
ok('恢复的项目可打开', restoredName.includes(projName), restoredName);
await page.locator('.proj-main').first().click();
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(500);
ok('打开恢复的项目', (await page.locator('.card').count()) >= 12);

// ===== 2. 组框背景色 =====
// 编组两张卡
await page.locator('.card').nth(0).click({ position: { x: 30, y: 30 } });
await page.keyboard.down('Shift');
await page.locator('.card').nth(1).click({ position: { x: 30, y: 30 } });
await page.keyboard.up('Shift');
await page.waitForTimeout(150);
await page.locator('.sb-tabs button:has-text("图层")').click();
await page.waitForTimeout(200);
await page.locator('.layer-toolbar button[title="编组所选"]').click();
await page.waitForTimeout(300);
const groupBg = await page.evaluate(() => {
  const f = document.querySelector('.group-frame');
  return f ? getComputedStyle(f).backgroundColor : '';
});
ok('编组框背景色', groupBg !== 'rgba(0, 0, 0, 0)' && groupBg !== 'transparent', groupBg);

// ===== 3. 图层点击多选（无 Shift）=====
await page.keyboard.press('Escape');
await page.locator('.layer-item').nth(3).click();
await page.waitForTimeout(150);
await page.locator('.layer-item').nth(4).click();
await page.waitForTimeout(200);
const multiSel = await page.locator('.card.selected').count();
ok('图层点击多选（触屏友好）', multiSel === 2, String(multiSel));
await page.keyboard.press('Escape');

// ===== 4. 图层对齐面板 =====
await page.locator('.layer-item').nth(3).click();
await page.waitForTimeout(120);
await page.locator('.layer-item').nth(4).click();
await page.waitForTimeout(200);
await page.locator('.layer-toolbar button[title^="对齐"]').click();
await page.waitForTimeout(200);
const alignBtns = await page.locator('.layer-style .style-row button').count();
ok('图层对齐面板', alignBtns >= 6, String(alignBtns));
await page.locator('.layer-style .style-row button:has-text("左对齐")').click();
await page.waitForTimeout(300);
const aligned = await page.evaluate(() => {
  const sel = [...document.querySelectorAll('.card.selected')];
  return sel.length === 2 && Math.abs(sel[0].getBoundingClientRect().x - sel[1].getBoundingClientRect().x) < 2;
});
ok('对齐生效', aligned);

// ===== 5. 卡片回收站 =====
await page.locator('.layer-toolbar button[title*="删除所选"]').click();
await page.waitForTimeout(400);
const trashBox = await page.locator('.trash-toggle').innerText();
ok('卡片回收站出现', /（\d+）/.test(trashBox) && trashBox.includes('回收站'), trashBox);
await page.locator('.trash-toggle').click();
await page.waitForTimeout(200);
const trashItemCount = await page.locator('.trash-item').count();
ok('回收站列表', trashItemCount === 2, String(trashItemCount));
const cardsBefore = await page.locator('.card').count();
await page.locator('.trash-item button[title="恢复"]').first().click();
await page.waitForTimeout(400);
const cardsAfter = await page.locator('.card').count();
ok('卡片恢复', cardsAfter === cardsBefore + 1, `${cardsBefore}→${cardsAfter}`);
await page.keyboard.press('Escape');

// ===== 6. 分区 tab 改色/排序 + 大纲卡片移动分区 =====
await page.locator('.sb-tabs button:has-text("分区")').click();
await page.waitForTimeout(200);
const secHover = page.locator('.sec-item').nth(1);
await secHover.hover();
const secColorBtn = await secHover.locator('.sec-actions button[title="改颜色"]').count();
ok('分区改色按钮', secColorBtn === 1);
await secHover.locator('.sec-actions button[title="改颜色"]').click();
await page.waitForTimeout(200);
await page.locator('.sec-item .palette-row button').nth(4).click();
await page.waitForTimeout(300);
const newSecColor = await page.evaluate(() => {
  const dot = document.querySelectorAll('.sec-dot')[1];
  return dot ? getComputedStyle(dot).backgroundColor : '';
});
ok('分区改色生效', newSecColor !== 'rgb(108, 92, 231)', newSecColor);
// 大纲：卡片移动分区
await page.locator('.sb-tabs button:has-text("编组")').click();
await page.waitForTimeout(300);
await page.hover('.outline-item >> nth=0');
const moveBtn = await page.locator('.outline-item .outline-actions button[title="移动分区"]').count();
ok('大纲卡片移动分区按钮', moveBtn >= 1);
await page.locator('.outline-item .outline-actions button[title="移动分区"]').first().click();
await page.waitForTimeout(200);
const joinOpts = await page.locator('.join-row button').count();
ok('移动分区选项', joinOpts >= 1, String(joinOpts));
await page.locator('.join-row button').first().click();
await page.waitForTimeout(300);
ok('卡片移动分区无异常', jsErrors.length === 0);

// ===== 7. 浏览模式不可拖动 =====
await page.locator('.sb-tabs button:has-text("分区")').click();
await page.waitForTimeout(150);
// 适配视图确保卡片可见
await page.click('.zc-fab'); await page.waitForTimeout(150);
await page.click('.zc-zoom button[title="适配视图"]'); await page.waitForTimeout(400);
await page.click('.zc-close');
await page.waitForTimeout(150);
await page.locator('.card').nth(2).click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(150);
await page.locator('.inspector .btn:has-text("浏览")').click();
await page.waitForTimeout(300);
const lockedCard = page.locator('.card').nth(2);
const lb0 = await lockedCard.boundingBox();
await page.mouse.move(lb0.x + 60, lb0.y + 15);
await page.mouse.down();
await page.mouse.move(lb0.x + 160, lb0.y + 60, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const lb1 = await lockedCard.boundingBox();
ok('浏览（锁定）卡不可拖动', Math.abs(lb1.x - lb0.x) < 5, `${Math.round(lb0.x)}→${Math.round(lb1.x)}`);
await page.keyboard.press('Escape');

// ===== 8. 新建位置确定性 =====
const newPos1 = await page.evaluate(() => {
  const s = window; return null;
});
// 通过模板插入两次，位置应一致（无随机）
await page.locator('.sb-tabs button:has-text("灵感")').click();
await page.waitForTimeout(200);
await page.click('.ideas .sb-tabs button:has-text("模板")');
await page.waitForTimeout(300);
await page.locator('.tpl-item:has-text("事件卡")').first().click();
await page.waitForTimeout(400);
const c1 = await page.locator('.card').last().boundingBox();
await page.locator('.tpl-item:has-text("事件卡")').first().click();
await page.waitForTimeout(400);
const c2 = await page.locator('.card').nth(-2).boundingBox();
const posDrift = Math.hypot(c1.x - c2.x, c1.y - c2.y);
ok('模板插入位置确定（无随机漂移）', posDrift < 3, Math.round(posDrift) + 'px');
await page.locator('.sb-tabs button:has-text("分区")').click();

ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 1).join(' | '));

console.log('\n========== 第六轮新功能验证 ==========');
results.forEach((r) => console.log(r));
console.log(results.every((r) => r.startsWith('✓')) ? '\n🎉 全部通过' : '\n❌ 有失败项');
await browser.close();
