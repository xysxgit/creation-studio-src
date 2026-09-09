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
// 设置连线为绿色
const mid = await page.evaluate(() => { const e = document.querySelector('.edge-mid'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(mid.x, mid.y);
await page.waitForTimeout(400);
await page.evaluate(() => {
  const bs = [...document.querySelectorAll('.ctx-menu .palette-row button')];
  bs.find((b) => (b.getAttribute('style') || '').includes('0, 184, 148'))?.click();
});
await page.waitForTimeout(400);
// 验证画布连线SVG颜色
const svgStroke = await page.evaluate(() => {
  const p = document.querySelector('.edges-layer .edge-path');
  return p ? p.getAttribute('stroke') : null;
});
console.log('画布连线颜色:', svgStroke);

// ===== 1) 导出图片含连线（验证箭头/颜色） =====
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('.modal button:has-text("画布 8K 图片")');
await page.waitForTimeout(1800);
const imgInfo = await page.evaluate(() => {
  const im = document.querySelector('.modal img');
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  // 找绿色像素（连线 #00b894 → rgb(0,184,148)）
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let green = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r < 30 && gg > 150 && gg < 210 && b > 110 && b < 180) green++;
  }
  return { w: c.width, h: c.height, greenPx: green };
});
console.log('导出图:', JSON.stringify(imgInfo));
console.log('✅ 导出图中含绿色连线(与画布一致):', imgInfo && imgInfo.greenPx > 200 ? '✅' : '❌ greenPx=' + imgInfo?.greenPx);

// ===== 2) 点"选择位置并下载"应弹保存位置选择 =====
// 注入 mock showSaveFilePicker
await page.evaluate(() => {
  window.__pickerCalled = null; window.__written = 0;
  window.showSaveFilePicker = async (opts) => {
    window.__pickerCalled = { suggestedName: opts.suggestedName };
    return {
      name: opts.suggestedName,
      createWritable: async () => ({ write: async (blob) => { window.__written = blob.size; }, close: async () => {} }),
    };
  };
});
// 返回导出列表，重新进图片预览
await page.click('.modal .btn-grid button:has-text("返回")');
await page.waitForTimeout(300);
await page.click('.modal button:has-text("画布 8K 图片")');
await page.waitForTimeout(1800);
await page.click('.modal .btn-grid button:has-text("选择位置并下载")');
await page.waitForTimeout(1200);
const pick = await page.evaluate(() => ({ called: window.__pickerCalled, written: window.__written }));
console.log('保存位置选择:', JSON.stringify(pick));
console.log('✅ 点击下载弹出保存位置选择并写入:', pick.called && pick.written > 0 ? '✅' : '❌');
await page.screenshot({ path: '/root/创作助手/tools/shot-export2.png' });
await browser.close();
process.exit(0);