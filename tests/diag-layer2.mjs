import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate(el=>el.click());
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap',{timeout:10000}); await page.waitForSelector('.card',{timeout:15000}); await page.waitForTimeout(600);
console.log('卡片数:', await page.locator('.card').count());
// 打开图层面板
await page.click('.sb-tabs button:has-text("图层")').catch(()=>{});
await page.waitForTimeout(500);
// 点第2张卡
await page.locator('.card').nth(1).click(); await page.waitForTimeout(500);
const g1 = await page.evaluate(()=>[...document.querySelectorAll('.layer-item')].map((el,i)=>({i,t:el.querySelector('.layer-title')?.textContent,on:el.className.includes('active')})));
// 点第6张卡
await page.locator('.card').nth(5).click(); await page.waitForTimeout(500);
const g2 = await page.evaluate(()=>[...document.querySelectorAll('.layer-item')].map((el,i)=>({i,t:el.querySelector('.layer-title')?.textContent,on:el.className.includes('active')})));
console.log('卡2选中完整列表(前6):', JSON.stringify(g1.slice(0,6)));
console.log('卡6选中完整列表(前6):', JSON.stringify(g2.slice(0,6)));
const on2 = g1.filter(x=>x.on).map(x=>x.i+':'+x.t);
const on6 = g2.filter(x=>x.on).map(x=>x.i+':'+x.t);
console.log('active卡2→', on2.join(','), '| active卡6→', on6.join(','));
// 点击图层项第5项
await page.locator('.layer-item').nth(5).click(); await page.waitForTimeout(500);
const g3 = await page.evaluate(()=>{ const items=[...document.querySelectorAll('.layer-item')]; const a=document.querySelector('.layer-item.active'); return {idx:items.indexOf(a), t:a?.querySelector('.layer-title')?.textContent}; });
// 画布是否有选中卡（selected class）
const selN = await page.evaluate(()=>document.querySelectorAll('.card.selected, .card-selected').length);
console.log('点击图层项5→active:', JSON.stringify(g3), '画布选中卡数:', selN);
// 点击画布空白（取消选择）：在画布内找一个非卡片的空白点
const blank = await page.evaluate(()=>{ const wrap=document.querySelector('.canvas-wrap'); if(!wrap)return null; const r=wrap.getBoundingClientRect(); for(let y=r.top+40;y<r.bottom-20;y+=40){ for(let x=r.left+24;x<r.right-24;x+=40){ const el=document.elementFromPoint(x,y); if(el && el.closest('.canvas-wrap') && !el.closest('.card') && !el.closest('.annotation')) return {x:Math.round(x),y:Math.round(y)}; } } return null; });
console.log('blank点:', JSON.stringify(blank));
if (blank) await page.mouse.click(blank.x, blank.y); await page.waitForTimeout(500);
const g4 = await page.evaluate(()=>({ active: document.querySelectorAll('.layer-item.active').length, sel: document.querySelectorAll('.card.selected').length }));
console.log('点击空白→active:', g4.active, '画布选中卡:', g4.sel, (g4.active===0?'✅清空':'❌残留'));
console.log('图层跟踪切换?', (g1.idx!==g2.idx && g1.idx!==-1 && g2.idx!==-1)?'✅':'❌不同步');
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));