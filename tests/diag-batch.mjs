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
const readAllCards = () => page.evaluate(()=>{
  const pid = localStorage.getItem('cs.current');
  const d = JSON.parse(localStorage.getItem('cs.project.'+pid)||'null');
  if(!d) return [];
  let out=[];
  for(const pg of Object.values(d.pages||{})){ for(const c of Object.values(pg.cards||{})){ out.push({id:c.id,t:c.title,g:c.groupId||'',wo:!!c.writingOnly}); } }
  return out;
});
// 进入正文创作
await page.click('button:has-text("✍️ 正文")'); await page.waitForTimeout(400);
// 新建3章 + 1卷
for(let i=0;i<3;i++){ await page.click('text=＋ 新建章'); await page.waitForTimeout(300); }
await page.click('text=＋ 新建卷'); await page.waitForTimeout(300);
const pre = await readAllCards();
console.log('新建后章节:', JSON.stringify(pre.filter(c=>c.wo)));
// 切多选
await page.click('text=🔸 多选'); await page.waitForTimeout(250);
const items = await page.$$('.wm-item');
console.log('wm-item 数:', items.length);
await items[0].click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(150);
await items[1].click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(150);
await page.waitForSelector('.wm-batch-toolbar',{timeout:5000});
const volId = await page.$eval('.wm-batch-toolbar select', el=>el.options[1]?.value||'');
console.log('目标卷id:', volId);
await page.selectOption('.wm-batch-toolbar select', volId);
await page.click('text=移到卷'); await page.waitForTimeout(600);
const vols = await page.$$eval('.wm-item-vol', els=>els.map(e=>e.value));
console.log('章节归属卷:', JSON.stringify(vols));
const ok = vols.filter(v=>v===volId).length>=2;
console.log(ok?'✅ 多选批量移动到卷成功（'+vols.filter(v=>v===volId).length+'章）':'❌ 批量移动到卷失败');
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));