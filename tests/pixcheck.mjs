// 像素级验证：卡片顶角色条转角曲率与边框贴合（无白色楔形）
import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.setItem('cs.helpSeen', '1'); });
await page.click('text=＋ 新建项目');
await page.waitForSelector('.type-card');
await page.click('.type-card:has-text("小说")');
await page.fill('.modal input[placeholder*="未命名"]', '圆角验证');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap', { timeout: 8000 });
await page.waitForTimeout(800);
await page.keyboard.press('f');
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find((x) => {
    const cs = getComputedStyle(x);
    return cs.backgroundImage.includes('linear-gradient') && x.getBoundingClientRect().width > 120;
  });
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, accent: getComputedStyle(c).backgroundImage.match(/rgb\([^)]+\)/)?.[0] || '' };
});
console.log('CARD:', JSON.stringify(info));
if (!info) { await browser.close(); process.exit(1); }
const { x, y, w, accent } = info;
const accentRGB = accent.replace(/[^\d,]/g, '').split(',').map(Number);

// 截取卡片左上区域（CSS 像素），在页面内用 canvas 采样
const clip = { x: x - 4, y: y - 4, width: w + 8, height: 40 };
const png = await page.screenshot({ clip });
const b64 = png.toString('base64');
const samples = await page.evaluate(async ({ b64, w, clip, accentRGB }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const scale = img.width / clip.width; // deviceScaleFactor
  const sample = (dx, dy) => {
    const d = g.getImageData(Math.round((dx + 4) * scale), Math.round((dy + 4) * scale), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  return {
    wedge: sample(5, 2),
    nearCorner: sample(3, 1.5),
    mid: sample(Math.floor(w / 2), 2),
    outside: sample(-3, -3),
    accentRGB,
    imgW: img.width,
  };
}, { b64, w, clip, accentRGB });

const near = (a, b, tol = 60) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
console.log('samples:', JSON.stringify(samples));
const ok1 = near(samples.wedge, accentRGB, 60);
const ok2 = near(samples.nearCorner, accentRGB, 60);
const ok3 = near(samples.mid, accentRGB, 60);
const ok4 = !near(samples.outside, accentRGB, 80) && samples.outside[3] > 0; // 色条不越出圆角曲线
console.log(`\n== 圆角贴合验证 ==`);
console.log(`${ok1 ? '✓' : '✗'} 楔形区 (5,2) = ${samples.wedge} 应为色条色 ${accentRGB}`);
console.log(`${ok2 ? '✓' : '✗'} 近角区 (3,1.5) = ${samples.nearCorner} 应为色条色 ${accentRGB}`);
console.log(`${ok3 ? '✓' : '✗'} 色条中段 = ${samples.mid} 应为色条色 ${accentRGB}`);
console.log(`${ok4 ? '✓' : '✗'} 卡片外角落 = ${samples.outside} 不应为纯白（画布背景）`);
console.log(ok1 && ok2 && ok3 && ok4 ? '\n🎉 圆角贴合修复验证通过' : '\n❌ 存在问题');
await browser.close();
