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
const volId = await page.$eval('.wm-item-vol', el=>el.options[1]?.value||'');
for(const item of await page.$$('.wm-item-vol')){ await item.selectOption(volId); await page.waitForTimeout(100); }

// 测试1：删除一单章 → 应进正文回收站
const firstTitle = await page.$eval('.wm-item .wm-item-title', el=>el.textContent.trim());
page.once('dialog', d=>d.accept());
await (await page.$$('.wm-item .wm-item-actions button[title="删除章节"]'))[0].click();
await page.waitForTimeout(300);
// 打开正文回收站（弹出独立界面）
await page.click('.wm-side-actions button[title="正文回收站"]'); await page.waitForTimeout(300);
const panelOpen = await page.$('.wm-trash-panel');
console.log('回收站独立弹窗:', panelOpen? '✅':'❌');
const badge = await page.$eval('.wm-side-badge', el=>el.textContent.trim()).catch(()=>'');
console.log('回收站图标徽标数量:', badge);
const trashItems = await page.$$eval('.wm-trash-item', els=>els.map(e=>e.querySelector('.wm-item-title')?.textContent.trim()));
console.log('删除章后回收站:', JSON.stringify(trashItems));
const okTrash = trashItems.length === 1 && badge === '1';
console.log(okTrash?'✅ 删除正文章进正文回收站&徽标=1':'❌ 回收站数量/徽标不对');
// 关闭弹窗
await page.click('.wm-trash-head .modal-x'); await page.waitForTimeout(200);
console.log('弹窗已关闭:', await page.$('.wm-trash-panel')? '❌ 未关':'✅');

// 测试2：恢复（重新打开回收站弹窗再恢复）
await page.click('.wm-side-actions button[title="正文回收站"]'); await page.waitForTimeout(300);
await page.click('.wm-trash-item button[title="恢复到目录"]'); await page.waitForTimeout(300);
await page.click('.wm-trash-head .modal-x'); await page.waitForTimeout(250);
const chapterCount = await page.$$eval('.wm-item', els=>els.length);
console.log('恢复后目录章节数:', chapterCount);

// 测试3：删除卷及内容 → 卷+章进正文回收站
await page.click('.outline-actions .row-more'); await page.waitForTimeout(250);
await page.waitForSelector('.sidebar-sheet',{timeout:4000});
console.log('⋯弹层(portal)打开:', await page.$('.sidebar-sheet')? '✅':'❌');
page.once('dialog', d=>d.accept());
await page.click('.sidebar-sheet button.danger'); await page.waitForTimeout(400);
await page.click('.wm-side-actions button[title="正文回收站"]'); await page.waitForTimeout(300);
const trash2 = await page.$$eval('.wm-trash-item', els=>els.length);
const heads = await page.$$eval('.outline-sec-title .g-name', els=>els.map(e=>e.textContent.trim())).catch(()=>[]);
console.log('删卷及内容后回收站数:', trash2, '卷头:', JSON.stringify(heads));
const okDel = trash2 >= 3 && !heads.some(h=>h.includes('第'));
console.log(okDel?'✅ 删除卷及内容→正文回收站':'❌ 删除卷及内容失败');

await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));