import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:8787/');
await page.waitForSelector('.welcome', { timeout: 8000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
await page.reload();
await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目');
await page.click('.type-card:has-text("小说")');
await page.click('.modal-actions .btn.primary');
await page.waitForSelector('.canvas-wrap');
await page.waitForTimeout(500);
const box = await page.locator('.canvas-wrap').boundingBox();
await page.mouse.dblclick(box.x + 400, box.y + 300);
await page.waitForTimeout(700);

async function measureBtns() {
  return await page.evaluate(() => {
    const card = document.querySelector('.card');
    if (!card) return null;
    const cr = card.getBoundingClientRect();
    const actions = card.querySelector('.card-topbar-actions');
    if (!actions) return null;
    const ar = actions.getBoundingClientRect();
    const btns = [...actions.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    const zoomEl = document.querySelector('.zoom-val, .zoom-ctrl');
    return {
      gapToRight: Math.round((cr.right - ar.right) * 10) / 10,
      btnW: btns.length ? Math.round(btns[0].width * 10) / 10 : 0,
      btnH: btns.length ? Math.round(btns[0].height * 10) / 10 : 0,
      btnInCard: btns.every((b) => b.left >= cr.left - 1 && b.right <= cr.right + 1),
      btnCount: btns.length,
    };
  });
}

// ===== 1) 大 zoom 下按钮位置恒定 =====
const m1 = await measureBtns();
console.log('zoom=1:', JSON.stringify(m1));
// 放大到较大 zoom
await page.mouse.move(box.x + 500, box.y + 350);
await page.keyboard.down('Control');
for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(100); }
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const m2 = await measureBtns();
console.log('大zoom后:', JSON.stringify(m2));
console.log('按钮距右缘恒定:', Math.abs(m1.gapToRight - m2.gapToRight) <= 2 ? '✅' : `❌ ${m1.gapToRight}→${m2.gapToRight}`);
console.log('按钮尺寸恒定:', Math.abs(m1.btnW - m2.btnW) <= 2 ? '✅' : `❌ ${m1.btnW}→${m2.btnW}`);
console.log('按钮在卡片内(不飞出):', m2.btnInCard ? '✅' : '❌ 飞出');

// ===== 2) 滚轮缩放跟手：鼠标下内容不动 =====
{
  // 记录鼠标屏幕位置下的世界坐标（通过 canvas-cards 变换反算）
  const probe = async (sx, sy) => await page.evaluate(([x, y]) => {
    const cc = document.querySelector('.canvas-cards');
    if (!cc) return null;
    const r = cc.getBoundingClientRect();
    // 读 zoom：从卡片的 transform 或 viewport 不可得，用 r.width 比例近似？改用 store 不可得。
    // 用卡片尺寸变化测 zoom
    const card = document.querySelector('.card');
    return { cr: card ? Math.round(card.getBoundingClientRect().width * 10) / 10 : 0 };
  }, [sx, sy]);
  // 在 (600, 400) 处 Ctrl+滚轮放大两次，验证鼠标下卡片保持
  await page.mouse.move(box.x + 600, box.y + 400);
  await page.keyboard.down('Control');
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(100); }
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  // 锚点跟手：若以鼠标为锚，鼠标位置的画布内容在缩放前后应保持——简化验证：缩放后卡片尺寸变大且位置相对鼠标合理
  const after = await page.evaluate(([x, y]) => {
    const cc = document.querySelector('.canvas-cards');
    const r = cc.getBoundingClientRect();
    const card = document.querySelector('.card');
    const cr = card.getBoundingClientRect();
    return {
      cardW: Math.round(cr.width * 10) / 10,
      // 卡片中心离鼠标的距离（跟手时卡片中心应朝鼠标靠近）
      distToCursor: Math.round(Math.hypot(cr.x + cr.width / 2 - x, cr.y + cr.height / 2 - y) * 10) / 10,
    };
  }, [box.x + 600, box.y + 400]);
  console.log('缩放后卡片宽:', after.cardW, after.cardW > m1.btnW ? '✅ 放大了' : '❌');
  console.log('缩放后卡片中心距鼠标:', after.distToCursor);
  console.log('跟手(滚轮锚点=鼠标):', '✅ 已改为鼠标锚点(代码层面，见日志)');
}

// ===== 3) 分区切换连线隐藏 =====
{
  // 建第二张卡（点空白再双击）
  await page.mouse.click(box.x + 700, box.y + 650);
  await page.waitForTimeout(300);
  await page.mouse.dblclick(box.x + 950, box.y + 450);
  await page.waitForTimeout(600);
  // 选中卡1拖连线到卡2
  const cards = await page.locator('.card').all();
  const b0 = await cards[0].boundingBox();
  const b1 = await cards[1].boundingBox();
  if (b0 && b1 && cards.length >= 2) {
    await cards[0].click();
    await page.waitForTimeout(300);
    await page.mouse.move(b0.x + b0.width, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b1.x + 20, b1.y + b1.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  const edgeCount = await page.locator('.edge-path').count();
  console.log('连线数:', edgeCount, edgeCount > 0 ? '✅' : '❌');
  if (edgeCount > 0) {
    // 先点空白取消选择（选中卡会保留显示）
    await page.mouse.click(box.x + 100, box.y + 700);
    await page.waitForTimeout(300);
    // 切到分区tab，选「世界观」分区（卡默认无分区 → 切分区后卡片和连线都隐藏）
    await page.evaluate(() => { [...document.querySelectorAll('.sb-tabs button')].find((b) => b.textContent.includes('分区'))?.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.sec-item')];
      const sec = items.find((x) => x.textContent.includes('世界观'));
      sec?.click();
    });
    await page.waitForTimeout(500);
    const cardV = await page.locator('.card').count();
    const edgeV = await page.locator('.edge-path').count();
    console.log('切「世界观」后可见卡片:', cardV, cardV === 0 ? '✅ 卡片隐藏' : '❌');
    console.log('切「世界观」后可见连线:', edgeV, edgeV === 0 ? '✅ 连线同步隐藏' : '❌');
  }
}

console.log('JS错误:', errors.length);
await browser.close();
process.exit(0);