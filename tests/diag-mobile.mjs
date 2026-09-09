
import { chromium } from 'playwright';
const CHROME='/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const check=(n,ok,d='')=>console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:''));
const errs=[];
const b=await chromium.launch({headless:true,executablePath:CHROME,args:['--no-sandbox']});
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:8787/');
await p.waitForSelector('.welcome');
await p.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await p.reload();
await p.waitForSelector('.welcome');
await p.click('text=＋ 新建项目');
await p.click('.type-card:has-text("小说")');
await p.click('.modal-actions .btn.primary');
await p.waitForSelector('.canvas-wrap');
await p.waitForTimeout(500);
// 项目菜单 → 导出/导入
await p.click('button[title="项目菜单：新建/关闭/删除/设置"]');
await p.waitForTimeout(300);
const menuBtns=await p.evaluate(()=>[...document.querySelectorAll('.project-menu button')].map(x=>x.textContent.trim()));
check('移动端项目菜单含导出/导入', menuBtns.includes('导出 / 导入'), menuBtns.slice(0,5).join(','));
await p.click('.project-menu button:has-text("导出 / 导入")');
await p.waitForTimeout(400);
check('移动端导出弹窗可开', (await p.locator('.modal-sec button:has-text("8K")').count())>=1);
await p.click('.modal-actions button:has-text("关闭")').catch(()=>{});
await p.waitForTimeout(300);
// 正文创作入口
await p.click('button[title="项目菜单：新建/关闭/删除/设置"]');
await p.waitForTimeout(300);
await p.click('.project-menu button:has-text("正文创作")');
await p.waitForTimeout(600);
check('正文创作窗口出现', (await p.locator('.writing-mode').count())>=1);
const wm=await p.evaluate(()=>({w:document.querySelector('.writing-mode')?.offsetWidth||0, vh:window.innerHeight}));
check('正文创作宽度适配', wm.w>0 && wm.w<=390+2, wm.w+'px');
await b.close();
console.log('页面错误:', errs.length, errs.slice(0,2).join(' | '));
