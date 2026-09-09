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
// 若顶栏收起则展开
const expand = await page.$('button:has-text("▾ 展开")');
if (expand) { await expand.click(); await page.waitForTimeout(300); }
// 打开设置
await page.click('button[title="设置"]'); await page.waitForTimeout(400);
const hasSyncBtn = await page.locator('button:has-text("立即同步")').count();
const hasListBtn = await page.locator('button:has-text("列出云端版本")').count();
const hasPreset = await page.locator('div.ai-presets button:has-text("坚果云")').count();
const hasHint = await page.locator('text=多版本备份').count();
console.log('立即同步(多版本)按钮:', hasSyncBtn>0?'✅':'❌');
console.log('列出云端版本按钮:', hasListBtn>0?'✅':'❌');
console.log('网盘预设(坚果云)按钮:', hasPreset>0?'✅':'❌');
console.log('多版本提示文案:', hasHint>0?'✅':'❌');
// 点"坚果云"预设应自动填入 URL 并开启
await page.click('div.ai-presets button:has-text("坚果云")'); await page.waitForTimeout(200);
const urlVal = await page.$eval('input[placeholder*="dav.jianguoyun"]', el=>el.value).catch(()=>'');
console.log('点预设后URL含 dav.jianguoyun:', /dav\.jianguoyun/i.test(urlVal)?'✅':'❌('+urlVal+')');
console.log('设置弹窗:.modal 存在:', await page.$('.modal')?'✅':'❌');
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));
await browser.close();