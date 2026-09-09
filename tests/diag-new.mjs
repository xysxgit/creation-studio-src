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
await page.waitForTimeout(500);
const readCards = () => page.evaluate(()=>{
  const pid = localStorage.getItem('cs.current');
  const d = JSON.parse(localStorage.getItem('cs.project.'+pid)||'null');
  if(!d) return [];
  const pageId = Object.keys(d.pages||{})[0];
  const page = d.pages[pageId];
  return Object.values(page?.cards||{}).map(c=>({t:c.title,k:c.kind,x:c.x,y:c.y}));
});
// 双击空白新建两张便签
await page.mouse.dblclick(200, 250); await page.waitForTimeout(600);
const c1 = await readCards(); console.log('第1张:', JSON.stringify(c1));
// 用右键空白菜单新建第二张（避开双击的2秒抑制与落点问题）
await page.mouse.click(520, 700, { button: 'right' }); await page.waitForTimeout(300);
await page.click('text=📝 新建便签卡'); await page.waitForTimeout(500);
await page.mouse.click(60, 700, { button: 'right' }); await page.waitForTimeout(300);
await page.click('text=📝 新建便签卡'); await page.waitForTimeout(500);
console.log('卡片(存档):', JSON.stringify(await readCards()));
const t = await readCards().then(a=>a.map(c=>c.t));
const cardOk = t.includes('便签卡1') && t.includes('便签卡2');
console.log(cardOk?'✅ 新建便签自动命名 便签卡1/便签卡2':'❌ 卡片命名异常: '+JSON.stringify(t));
// 历史跳转：打开左菜单历史，点第一条（恢复初始），确认 current 唯一
await page.click('.sb-tabs button:has-text("历史")'); await page.waitForTimeout(200);
await page.click('.history-item >> nth=0'); await page.waitForTimeout(400);
const curCount = await page.$$eval('.history-item.current', els=>els.length);
console.log(curCount===1?'✅ 点击历史跳转后 current 高亮唯一 ('+curCount+')':'❌ 历史跳转出现 '+curCount+' 个高亮');
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));