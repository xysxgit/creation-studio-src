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
// 建卷 + 3章，移到卷
await page.click('text=＋ 新建卷'); await page.waitForTimeout(250);
for(let i=0;i<3;i++){ await page.click('text=＋ 新建章'); await page.waitForTimeout(220); }
const volId = await page.$eval('.wm-item-vol', el=>el.options[1]?.value||'');
for(const item of await page.$$('.wm-item-vol')){ await item.selectOption(volId); await page.waitForTimeout(100); }
console.log('卷名起点检查：', await page.$eval('.g-name', el=>el.textContent.trim()));
// 切多选，验证提示条出现
await page.click('text=🔸 多选'); await page.waitForTimeout(200);
const hint = await page.$('.wm-multi-hint');
console.log('多选提示条:', hint? '✅ 出现':'❌ 无');
// 点前2章标题 + 勾选标记
const items = await page.$$('.wm-item');
await items[0].click({position:{x:20,y:12}}); await page.waitForTimeout(100);
await items[1].click({position:{x:20,y:12}}); await page.waitForTimeout(100);
const checks = await page.$$eval('.wm-item-check', els=>els.map(e=>e.classList.contains('on')));
console.log('勾选标记:', JSON.stringify(checks));
console.log('批量计数:', await page.$eval('.wm-batch-count', el=>el.textContent.trim()));
// 全选
await page.click('text=全选'); await page.waitForTimeout(150);
console.log('全选后计数:', await page.$eval('.wm-batch-count', el=>el.textContent.trim()));
// 多选模式下删除卷（章节被选中），经⋯弹层，确认卷删除且章节回未分卷
await page.click('.outline-actions .row-more'); await page.waitForTimeout(200);
await page.waitForSelector('.sidebar-sheet',{timeout:4000});
page.once('dialog', d=>d.accept());
await page.click('.sidebar-sheet button:has-text("删除卷（章节移到未分卷）")'); await page.waitForTimeout(400);
const vols = await page.$$eval('.wm-item-vol', els=>els.map(e=>e.value));
const heads = await page.$$eval('.outline-sec-title .g-name', els=>els.map(e=>e.textContent.trim()));
console.log('删除卷后章节归属:', JSON.stringify(vols), '卷头:', JSON.stringify(heads));
const ok = vols.every(v=>v==='') && !heads.some(h=>h.includes('第 1 卷'));
console.log(ok?'✅ 多选模式下删除卷成功':'❌ 删除卷异常');
await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));