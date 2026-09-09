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
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);
const c0 = await page.locator('.card').nth(0).boundingBox();
await page.mouse.click(c0.x + c0.width / 2, c0.y + 60);
await page.waitForTimeout(300);
await page.keyboard.type('第一章 测试');
await page.mouse.click(box.x + 20, box.y + 20);
await page.waitForTimeout(400);

// ===== 1) 连线色块选中态（zc-tool风格） =====
// 复制卡2、拖开、连线
await page.mouse.click(c0.x + c0.width / 2, c0.y + c0.height / 2, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.ctx-menu button')].find(b => b.textContent.includes('复制'))?.click(); });
await page.waitForTimeout(700);
const card1 = await page.locator('.card').nth(1).boundingBox();
await page.mouse.move(card1.x + card1.width / 2, card1.y + 30);
await page.mouse.down();
await page.mouse.move(box.x + 800, box.y + 420, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
const card0b = await page.locator('.card').nth(0).boundingBox();
const card1b = await page.locator('.card').nth(1).boundingBox();
await page.mouse.click(card0b.x + card0b.width / 2, card0b.y + card0b.height / 2);
await page.waitForTimeout(300);
const anchor = await page.evaluate(() => {
  const a = document.querySelector('.card.selected .anchor-e');
  const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(anchor.x, anchor.y); await page.mouse.down();
await page.mouse.move(card1b.x + card1b.width / 2, card1b.y + card1b.height / 2, { steps: 15 });
await page.waitForTimeout(150); await page.mouse.up();
await page.waitForTimeout(700);
const mid = await page.evaluate(() => { const e = document.querySelector('.edge-mid'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(mid.x, mid.y);
await page.waitForTimeout(400);
// 点绿色
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('.ctx-menu .palette-row button')];
  bs.find((b) => (b.getAttribute('style') || '').includes('0, 184, 148'))?.click();
});
await page.waitForTimeout(400);
const swatch = await page.evaluate(() => {
  const on = document.querySelector('.ctx-menu .palette-row button.on');
  if (!on) return null;
  const cs = getComputedStyle(on);
  const after = getComputedStyle(on, '::after');
  return { bg: cs.backgroundColor, border: cs.borderColor, shadow: cs.boxShadow.slice(0, 90), afterBg: after.backgroundColor, afterW: after.width, afterH: after.height, afterBottom: after.bottom, afterLeft: after.left };
});
console.log('=== 色块选中态(zc-tool风格) ===');
console.log(JSON.stringify(swatch, null, 1));
const swatchOk = swatch && swatch.bg === 'rgb(0, 184, 148)' && swatch.shadow !== 'none' && /px/.test(swatch.shadow);
console.log(swatchOk ? '✅ 原色保持+投影高亮' : '❌');

// ===== 2) JSON 导出预览渲染（pre 显示项目内容） =====
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('.modal button:has-text("保存项目 JSON")');
await page.waitForTimeout(1200);
const preview = await page.evaluate(() => {
  const pre = document.querySelector('.modal pre');
  if (!pre) return '无pre';
  const t = pre.textContent || '';
  return { hasMeta: t.includes('"meta"'), hasCards: t.includes('"cards"'), hasSections: t.includes('"sections"'), len: t.length };
});
console.log('=== JSON 预览渲染 ===');
console.log(JSON.stringify(preview, null, 1));
console.log(preview.hasMeta && preview.hasCards && preview.hasSections ? '✅ JSON预览含完整项目结构' : '❌');
await page.screenshot({ path: '/root/创作助手/tools/shot-preview.png' });
await browser.close();
process.exit(0);