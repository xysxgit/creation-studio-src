// 边视口裁剪验证：创建项目后，全景 vs 深度放大（视野内无卡片）对比 SVG 边数量
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const URL = 'http://localhost:8787/';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL);
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.locator('.modal input[type="checkbox"]').evaluate((el) => { el.click(); });
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(500);

const countEdges = () => page.evaluate(() => document.querySelectorAll('.edges-svg path').length);
const countCards = () => page.locator('.card').count();
const full = { cards: await countCards(), edges: await countEdges() };

// 连续放大：以视口中心为锚深度放大，直到视野内卡片几乎清空
let zoomedEdges = full.edges;
let zoomedCards = full.cards;
await page.mouse.move(720, 450);
for (let i = 0; i < 6 && zoomedCards > 1; i++) {
  await page.mouse.wheel(0, -800);
  await page.waitForTimeout(500);
  zoomedCards = await countCards();
  zoomedEdges = await countEdges();
}
const zoomed = { cards: zoomedCards, edges: zoomedEdges };

console.log('全景:', JSON.stringify(full));
console.log('放大局部:', JSON.stringify(zoomed));
const ok = zoomed.cards < full.cards && zoomed.edges < full.edges;
console.log(ok ? '✅ 边视口裁剪生效：局部视野边数减少' : '❌ 裁剪未生效');
console.log('JS 错误:', errors.length);
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
