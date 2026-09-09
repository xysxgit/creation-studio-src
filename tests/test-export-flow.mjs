import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:8787/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap', { timeout: 6000 });
await page.waitForTimeout(600);
// 创建一张卡并输入标题
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const c0 = await page.locator('.card').nth(0).boundingBox();
await page.mouse.click(c0.x + c0.width / 2, c0.y + 60);
await page.waitForTimeout(300);
await page.keyboard.type('第一章 测试');
await page.mouse.click(box.x + 20, box.y + 20);
await page.waitForTimeout(400);
// 打开顶栏导出按钮（aria-label=导出）
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
console.log('=== 导出弹窗 ===');
console.log(await page.evaluate(() => document.querySelector('.modal')?.innerText.slice(0, 300)));
// 点 Markdown → 应进入预览确认界面
await page.click('.modal button:has-text("保存项目 JSON")');
await page.waitForTimeout(800);
console.log('=== 导出预览界面 ===');
console.log(await page.evaluate(() => document.querySelector('.modal')?.innerText.slice(0, 500)));
// 检查预览内容
const preview = await page.evaluate(() => {
  const pre = document.querySelector('.modal pre');
  return pre ? pre.textContent.slice(0, 200) : '无pre';
});
console.log('=== 预览内容 ===', JSON.stringify(preview));
// 检查按钮（选择位置/直接下载/返回）
const btns = await page.evaluate(() => [...document.querySelectorAll('.modal .btn-grid button')].map(b => b.textContent.trim()));
console.log('=== 按钮 ===', JSON.stringify(btns));
const nameInput = await page.evaluate(() => { const inp = document.querySelector('.modal input'); return inp ? { value: inp.value, type: inp.type } : null; });
console.log('=== 文件名输入 ===', JSON.stringify(nameInput));
await page.screenshot({ path: '/root/创作助手/tools/shot-export.png' });
// 测试"浏览器默认下载"触发（headless下应触发下载事件）
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.click('.modal .btn-grid button:has-text("浏览器默认下载")'),
]);
console.log('=== 下载触发 ===', download ? `✅ ${download.suggestedFilename()}` : '未触发');
await browser.close();
process.exit(0);