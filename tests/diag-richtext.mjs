// 富文本/字号/字体/图层 验证
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.type-card:has-text("小说")'); await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap'); await page.waitForTimeout(500);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300); await page.waitForTimeout(600);

// ===== 富文本 smart toggle =====
// 进入编辑：双击卡片正文
await page.mouse.dblclick(box.x + 400, box.y + 300); await page.waitForTimeout(600);
await page.locator('.rich-editor-body').click(); await page.waitForTimeout(200);
await page.keyboard.type('ABCDE'); await page.waitForTimeout(200);
// 用键盘选中 ABC（TipTap 自身 selection）
await page.keyboard.press('Home'); await page.waitForTimeout(100);
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
await page.waitForTimeout(100);
await page.click('button[title="加粗"]'); await page.waitForTimeout(300);
const bolded = await page.evaluate(() => document.querySelector('.rich-editor-body').innerHTML);
check('选区加粗：ABC带<strong>', /<strong>ABC<\/strong>/.test(bolded) || /<strong>[^<]*ABC[^<]*<\/strong>/.test(bolded), bolded.slice(0,70));
// 应用后光标已移出mark，输入X应不加粗
await page.keyboard.type('X'); await page.waitForTimeout(300);
const afterX = await page.evaluate(() => document.querySelector('.rich-editor-body').innerHTML);
check('框选应用后输入X不加粗(光标已移出mark)', !/<strong>[^<]*X[^<]*<\/strong>/.test(afterX), afterX.slice(0,70));
// 无选区（光标在普通文本A前）→ 点加粗 toggle 开启 + 状态高亮 + 后续输入加粗
await page.keyboard.press('End'); await page.waitForTimeout(100);
await page.click('button[title="加粗"]'); await page.waitForTimeout(300);
const btnOn = await page.evaluate(() => document.querySelector('button[title="加粗"]')?.className.includes('on'));
check('无选区点加粗→状态高亮', !!btnOn);
await page.keyboard.type('XY'); await page.waitForTimeout(300);
const afterXY = await page.evaluate(() => document.querySelector('.rich-editor-body').innerHTML);
check('无选区持续应用：输入XY加粗', /<strong>[^<]*XY[^<]*<\/strong>/.test(afterXY), afterXY.slice(0,80));

// ===== 字号 8-42 + 字体去无用/导入 =====
const fsOpts = await page.evaluate(() => { const s = document.querySelector('select[aria-label="字号"]'); return s ? [...s.options].map(o => o.value) : []; });
check('字号含8与42', fsOpts.includes('8') && fsOpts.includes('42'), fsOpts.join(','));
const fontOpts = await page.evaluate(() => { const s = document.querySelector('select[aria-label="字体"]'); return s ? [...s.options].map(o => o.value) : []; });
check('字体无宋体/黑体', !fontOpts.some(v => v.includes('宋体') || v.includes('黑体') || v.includes('楷体') || v.includes('仿宋') || v.includes('微软雅黑')), fontOpts.join(','));
check('字体含通用族+导入按钮', fontOpts.includes('serif') && fontOpts.includes('sans-serif') && await page.locator('button[aria-label="导入字体"]').count() === 1);
// 退出编辑
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// ===== 图层 active =====
await page.locator('.card').first().click(); await page.waitForTimeout(300);
// 打开左侧图层面板
await page.click('.sb-tabs button:has-text("图层")').catch(() => {});
await page.waitForTimeout(400);
const layerActive = await page.evaluate(() => !!document.querySelector('.layer-item.active'));
check('图层面板选中项有active(同历史样式)', layerActive);

await browser.close();
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));