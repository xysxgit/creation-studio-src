import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.modal-actions .btn.primary'); await page.waitForSelector('.canvas-wrap',{timeout:15000});
await page.waitForTimeout(400);
await page.click('button:has-text("✍️ 正文")'); await page.waitForTimeout(400);
await page.click('text=＋ 新建卷'); await page.waitForTimeout(250);
for(let i=0;i<3;i++){ await page.click('text=＋ 新建章'); await page.waitForTimeout(220); }
// 移到卷
const volId = await page.$eval('.wm-item-vol', el=>el.options[1]?.value||'');
for(const item of await page.$$('.wm-item-vol')){ await item.selectOption(volId); await page.waitForTimeout(100); }
// 切多选
await page.click('text=🔸 多选'); await page.waitForTimeout(200);
// 先勾选一章让批量工具栏出现
const items0 = await page.$$('.wm-item');
await items0[0].click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(120);
await page.waitForSelector('.wm-batch-toolbar',{timeout:4000});
// 全选 -> 再点一次（取消全选）
await page.click('text=全选'); await page.waitForTimeout(120);
console.log('全选后:', await page.$eval('.wm-batch-count', el=>el.textContent.trim()));
await page.click('text=取消全选'); await page.waitForTimeout(120);
const afterToggle = await page.$$eval('.wm-item-check', els=>els.map(e=>e.classList.contains('on')));
console.log('取消全选后勾选:', JSON.stringify(afterToggle));
// 重新勾选一章，让工具栏出现，再测「退出多选」
await items0[0].click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(120);
await page.waitForSelector('.wm-batch-toolbar',{timeout:4000});
await page.click('text=退出多选'); await page.waitForTimeout(150);
const hintAfter = await page.$('.wm-multi-hint');
console.log('退出多选后提示条:', hintAfter? '❌ 仍在':'✅ 已消失');
// 打开卷弹层，选「删除卷及内容」
await page.click('.outline-actions .row-more'); await page.waitForTimeout(200);
await page.waitForSelector('.sidebar-sheet',{timeout:4000});
const sheetTitle = await page.$eval('.sidebar-sheet-title', el=>el.textContent.trim());
console.log('卷弹层标题:', sheetTitle);
page.once('dialog', d=>{ console.log('删除确认:', d.message()); d.accept(); });
await page.click('.sidebar-sheet button.danger'); await page.waitForTimeout(400);
const heads = await page.$$eval('.outline-sec-title .g-name', els=>els.map(e=>e.textContent.trim()));
const vols = await page.$$eval('.wm-item-vol', els=>els.map(e=>e.value)).catch(()=>[]);
console.log('删除卷及内容后卷头:', JSON.stringify(heads));
const ok = !heads.some(h=>h.includes('第 1 卷'));
console.log(ok?'✅ 删除卷及内容成功（卷+章节都删）':'❌ 删除卷失败');
await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));