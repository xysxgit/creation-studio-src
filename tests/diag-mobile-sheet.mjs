import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.modal-actions .btn.primary'); await page.waitForSelector('.canvas-wrap',{timeout:15000});
await page.waitForTimeout(400);
await page.click('button:has-text("✍️ 正文")'); await page.waitForTimeout(400);
await page.click('text=＋ 新建卷'); await page.waitForTimeout(300);
await page.click('text=＋ 新建章'); await page.waitForTimeout(300);
const rm = await page.$('.outline-actions .row-more');
console.log('row-more存在:', !!rm, '可见:', rm? await rm.isVisible():'-', '可点:', rm? await rm.isEnabled():'-');
if(rm){
  // 记录点击前是否有 sheet
  const before = await page.$('.sidebar-sheet');
  console.log('点击前sheet:', !!before);
  await rm.tap().catch(async()=>{await rm.click();});
  await page.waitForTimeout(500);
  const after = await page.$('.sidebar-sheet');
  console.log('点击后sheet:', !!after, 'sheet可见:', after? await after.isVisible():'-');
}
// 检查 writing-mode 是否 transform/overflow 影响
const cs = await page.$eval('.writing-mode', el=>{const s=getComputedStyle(el); return {transform:s.transform, overflow:s.overflow, z:s.zIndex, position:s.position};}).catch(()=>null);
console.log('writing-mode样式:', JSON.stringify(cs));
await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));