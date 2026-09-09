// 色块选中/工具栏行分布/图层同步 综合诊断
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
const check=(n,ok,d='')=>console.log(`${ok?'✅':'❌'} ${n}${d?' — '+d:''}`);
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")'); await page.click('.modal-actions .btn.primary'); await page.waitForSelector('.canvas-wrap',{timeout:10000}); await page.waitForTimeout(600);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x+400, box.y+300); await page.waitForTimeout(600); // 双击空白建卡
await page.locator('.card').first().dblclick(); await page.waitForTimeout(600); // 进入编辑
await page.locator('.rich-editor-body').click(); await page.waitForTimeout(200);

// ===== 工具栏行分布 =====
const rows = await page.evaluate(()=>{ const btns=[...document.querySelectorAll('.rich-toolbar .rtb')]; const m={}; btns.forEach(b=>{const y=Math.round(b.getBoundingClientRect().y);(m[y]=m[y]||[]).push((b.getAttribute('title')||'').slice(0,6));}); return Object.values(m).map(r=>r.join('|')); });
console.log('工具栏行分布:', JSON.stringify(rows));

// ===== 色块选中（文字颜色弹层）=====
const colorBtn = page.locator('button[title="文字颜色：给选中的文字上色"]');
await colorBtn.click(); await page.waitForTimeout(200);
const swatches = await page.evaluate(()=>[...document.querySelectorAll('.rtb-swatch')].map(s=>({bg:getComputedStyle(s).backgroundColor, on:s.className.includes('on')})));
console.log('色块初始:', JSON.stringify(swatches.slice(0,4)));
// 选第2个色块
await page.evaluate(()=>document.querySelectorAll('.rtb-swatch')[1].click()); await page.waitForTimeout(300);
const sel = await page.evaluate(()=>{ const s=document.querySelectorAll('.rtb-swatch')[1]; return {bg:getComputedStyle(s).backgroundColor, on:s.className.includes('on'), vis:s.getBoundingClientRect().width>0}; });
console.log('选中色块背景:', JSON.stringify(sel));
check('选中后色块背景仍在(非透明)', sel.bg!=='rgba(0, 0, 0, 0)' && sel.vis, sel.bg);
// 重开弹层
await colorBtn.click(); await page.waitForTimeout(200); await colorBtn.click(); await page.waitForTimeout(200);
const sel2 = await page.evaluate(()=>{ const s=document.querySelectorAll('.rtb-swatch')[1]; return {bg:getComputedStyle(s).backgroundColor, on:s.className.includes('on')}; });
console.log('重开后：', JSON.stringify(sel2));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// ===== 图层同步 =====
await page.click('.sb-tabs button:has-text("图层")').catch(()=>{});
await page.waitForTimeout(400);
await page.mouse.dblclick(box.x+700, box.y+300); await page.waitForTimeout(500);
await page.locator('.card').first().click(); await page.waitForTimeout(400);
const a1 = await page.evaluate(()=>!!document.querySelector('.layer-item.active'));
const t1 = await page.evaluate(()=>document.querySelector('.layer-item.active .layer-title')?.textContent);
await page.locator('.card').last().click(); await page.waitForTimeout(400);
const a2 = await page.evaluate(()=>!!document.querySelector('.layer-item.active'));
const t2 = await page.evaluate(()=>document.querySelector('.layer-item.active .layer-title')?.textContent);
console.log('图层 active1:', a1, '('+t1+')', '| active2:', a2, '('+t2+')');
check('图层选中状态可切换不同步修复', a1 && a2 && t1!==t2, `'${t1}'->'${t2}'`);
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));