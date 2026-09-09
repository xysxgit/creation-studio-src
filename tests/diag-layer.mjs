import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")'); await page.click('.modal-actions .btn.primary'); await page.waitForSelector('.canvas-wrap',{timeout:10000}); await page.waitForTimeout(600);
const box = await page.locator('.canvas-wrap').boundingBox();
// 建两卡（不同位置，且在画布内）
await page.mouse.dblclick(box.x+430, box.y+180); await page.waitForTimeout(600);
await page.mouse.dblclick(box.x+220, box.y+470); await page.waitForTimeout(600);
const cardN = await page.evaluate(()=>document.querySelectorAll('.card').length);
console.log('canvas卡片数:', cardN, 'wrap宽:', Math.round(box.width));
// 打开左侧"图层"面板
await page.click('.sb-tabs button:has-text("图层")').catch(()=>{});
await page.waitForTimeout(500);
// 选中第一张卡
await page.locator('.card').first().click(); await page.waitForTimeout(500);
const s1 = await page.evaluate(()=>{ const items=[...document.querySelectorAll('.layer-item')]; const a=document.querySelector('.layer-item.active'); return {idx:items.indexOf(a), n:items.length}; });
// 选中第二张卡
await page.locator('.card').last().click(); await page.waitForTimeout(500);
const s2 = await page.evaluate(()=>{ const items=[...document.querySelectorAll('.layer-item')]; const a=document.querySelector('.layer-item.active'); return {idx:items.indexOf(a), n:items.length}; });
console.log('选卡1 active index:', JSON.stringify(s1), '| 选卡2 active index:', JSON.stringify(s2));
console.log('点击卡片→图层同步?', (s2.idx===1) ? '✅同步(切到第2项)' : '❌不同步');
// 点击图层项第2项 → 画布应选中第2卡（反向同步）
await page.locator('.layer-item').nth(1).click(); await page.waitForTimeout(500);
const s3 = await page.evaluate(()=>{ const items=[...document.querySelectorAll('.layer-item')]; const a=document.querySelector('.layer-item.active'); return {idx:items.indexOf(a)}; });
console.log('点击图层项2→active index:', s3.idx, (s3.idx===1?'✅':'❌'));
// 左对齐行分布（宽屏）
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.locator('.card').first().dblclick(); await page.waitForTimeout(600);
await page.locator('.rich-editor-body').click(); await page.waitForTimeout(200);
const rows = await page.evaluate(()=>{ const btns=[...document.querySelectorAll('.rich-toolbar .rtb')]; const m={}; btns.forEach(b=>{const y=Math.round(b.getBoundingClientRect().y);(m[y]=m[y]||[]).push((b.getAttribute('title')||'').slice(0,6));}); return Object.values(m).map(r=>r.join('|')); });
console.log('左对齐行分布:', JSON.stringify(rows));
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));