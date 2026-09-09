// 验证：导出/导入界面精简（删MD/HTML/Word/TXT）；EPUB/JSON/图片 下载触发
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(600);

// 建一张卡并写内容
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 280);
await page.waitForTimeout(500);

// ===== 1) 导出/导入界面精简 =====
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(500);
const modalText = await page.locator('.modal').last().textContent();
check('已删除 Markdown 导出', !modalText.includes('Markdown'));
check('已删除 HTML 导出', !modalText.includes('HTML'));
check('已删除 Word 导出', !modalText.includes('Word'));
check('已删除 纯文本 导出', !modalText.includes('纯文本'));
check('保留 画布8K图片', modalText.includes('画布 8K 图片'));
check('保留 保存项目JSON', modalText.includes('保存项目 JSON'));
check('保留 读取项目JSON', modalText.includes('读取项目 JSON'));

// ===== 2) JSON 保存触发下载 =====
const dlJson = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.click('button:has-text("保存项目 JSON")');
await page.waitForTimeout(500);
await page.click('.btn:has-text("⤓ 浏览器默认下载")');
await page.waitForTimeout(1500);
const j = await dlJson;
check('保存项目 JSON 触发下载', !!j, j?.suggestedFilename());
// 确保模态关闭（Esc + 兜底点关闭）
await page.keyboard.press('Escape').catch(() => {});
await page.waitForTimeout(400);
await page.click('.modal .btn:has-text("关闭")').catch(() => {});
await page.click('.modal-x').catch(() => {});
await page.waitForTimeout(400);
check('JSON 保存后模态已关闭', (await page.locator('.modal').count()) === 0);

// ===== 4) 正文创作 EPUB 触发下载 =====
await page.click('button[aria-label="导出"]');
await page.waitForTimeout(400);
await page.click('button:has-text("正文创作导出")');
await page.waitForSelector('.writing-mode', { timeout: 5000 });
// 新建章节并写内容
await page.click('.btn:has-text("＋ 新建章")');
await page.waitForTimeout(500);
await page.click('.wm-title-input');
await page.keyboard.type('第一章 测试');
await page.click('.rich-editor-body');
await page.keyboard.type('这是一段用于EPUB导出的测试正文内容。');
await page.waitForTimeout(300);
const dlEpub = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await page.click('.btn.small:has-text("EPUB")');
const ep = await dlEpub;
check('正文创作 EPUB 触发下载', !!ep, ep?.suggestedFilename());

console.log('JS错误:', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();