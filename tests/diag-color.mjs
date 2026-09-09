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
// 多选2卡
await page.keyboard.down('Control');
await page.locator('.card').nth(0).click();
await page.locator('.card').nth(1).click();
await page.keyboard.up('Control'); await page.waitForTimeout(300);
const selCount = await page.evaluate(()=>document.querySelectorAll('.card.selected').length);
console.log('多选卡数:', selCount);
// 点编组按钮
const gpBtn = page.locator('button[title="编组所选"]');
const hasBtn = await gpBtn.count();
console.log('编组按钮数:', hasBtn);
if (hasBtn) await gpBtn.click(); await page.waitForTimeout(500);
// 右键编组包围框（group-frame）
try { await page.locator('.group-frame').first().click({ button: 'right' }); } catch(e){ console.log('无group-frame，尝试group-item', (e.message||'').slice(0,40)); }
await page.waitForTimeout(500);
const pal = await page.evaluate(()=>[...document.querySelectorAll('.group-ctx .palette-row button')].map(b=>({bg:getComputedStyle(b).backgroundColor, on:b.className.includes('on')})));
console.log('组颜色palette(前4):', JSON.stringify(pal.slice(0,4)));
if (pal.length) {
  await page.evaluate(()=>document.querySelectorAll('.group-ctx .palette-row button')[2].click()); await page.waitForTimeout(300);
  const sel = await page.evaluate(()=>{const s=document.querySelectorAll('.group-ctx .palette-row button')[2]; return {bg:getComputedStyle(s).backgroundColor, on:s.className.includes('on'), vis:s.getBoundingClientRect().width>0}; });
  console.log('选中色块3:', JSON.stringify(sel), '背景保留?', sel.bg!=='rgba(0, 0, 0, 0)'?'✅':'❌');
}
await browser.close();
console.log('页错:',errs.length,errs.slice(0,2).join(' | '));