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
// 新建卷（应叫第1卷）
await page.click('text=＋ 新建卷'); await page.waitForTimeout(300);
const volName = await page.$eval('.g-name', el=>el.textContent.trim());
console.log('新建卷名:', volName);
// 新建2章并移到该卷
for(let i=0;i<2;i++){ await page.click('text=＋ 新建章'); await page.waitForTimeout(250); }
const volId = await page.$eval('.wm-item-vol', el=>el.options[1]?.value||'');
console.log('卷id:', volId);
for(const item of await page.$$('.wm-item-vol')){ await item.selectOption(volId); await page.waitForTimeout(120); }
const before = await page.$$eval('.wm-item-vol', els=>els.map(e=>e.value));
console.log('移到卷后章节归属:', JSON.stringify(before));
// 点击删除卷
page.once('dialog', d=>{ console.log('确认框:', d.message()); d.accept(); });
await page.click('.outline-actions button[title="删除卷（章节移到未分卷）"]'); await page.waitForTimeout(400);
const after = await page.$$eval('.wm-item-vol', els=>els.map(e=>e.value));
console.log('删除卷后章节归属:', JSON.stringify(after));
const heads = await page.$$eval('.outline-sec-title .g-name', els=>els.map(e=>e.textContent.trim()));
console.log('剩余卷头:', JSON.stringify(heads));
const ok = after.every(v=>v==='') && !heads.some(h=>h.includes('第 1 卷'));
console.log(ok?'✅ 删除卷成功（章节回未分卷，卷头消失）':'❌ 删除卷失败');
await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));