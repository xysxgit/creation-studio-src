import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
const names = async () => await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('cs.projects')||'[]');return p.map(x=>x.name);});
async function createProject(){
  await page.click('text=＋ 新建项目');
  await page.waitForTimeout(300);
  await page.click('.modal-actions .btn.primary');
  await page.waitForSelector('.canvas-wrap',{timeout:15000});
  await page.waitForTimeout(400);
}
const curr = async () => await page.evaluate(()=>{const m=JSON.parse(localStorage.getItem('cs.projects')||'[]'); const pid=localStorage.getItem('cs.proj'); const p=m.find(x=>x.id===pid); return p?p.name:'?';});
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await createProject();
console.log('项目1名称:', await curr(), '| 列表:', JSON.stringify(await names()));
// 项目菜单 → 新建项目（第2个同名）
await page.click('button[title="项目菜单：新建/关闭/删除/设置"]');
await page.waitForTimeout(200);
await page.click('.project-menu button:has-text("新建项目")');
await page.waitForTimeout(300);
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap',{timeout:15000});
await page.waitForTimeout(400);
console.log('项目2名称:', await curr(), '| 列表:', JSON.stringify(await names()));
const nm = await names();
const ok = new Set(nm).size===nm.length && /2$/.test(nm[nm.length-1]);
console.log(ok?'✅ 同名项目已自动加序号区分':'❌ 未区分: '+JSON.stringify(nm));
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));