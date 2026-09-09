// 横屏/竖屏 全功能巡检
import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const errs = [];

async function runFlow(name, vw, vh) {
  console.log(`\n===== ${name} (${vw}x${vh}) =====`);
  const b = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: vw, height: vh } })).newPage();
  p.on('pageerror', (e) => errs.push(name + ': ' + e));
  await p.goto('http://localhost:8787/');
  await p.waitForSelector('.welcome', { timeout: 8000 });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('cs.helpSeen', '1'); });
  await p.reload(); await p.waitForSelector('.welcome');
  check(name + ' 欢迎可见', (await p.locator('.welcome').count()) >= 1);
  await p.click('text=＋ 新建项目');
  await p.waitForTimeout(300);
  const typeOk = (await p.locator('.type-card:has-text("小说")').count()) >= 1;
  check(name + ' 新建弹窗可开', typeOk);
  await p.click('.type-card:has-text("小说")');
  await p.click('.modal-actions .btn.primary');
  await p.waitForSelector('.canvas-wrap');
  await p.waitForTimeout(500);
  const box = await p.locator('.canvas-wrap').boundingBox();
  await p.mouse.dblclick(box.x + Math.min(box.width/2, 260), box.y + Math.min(box.height/2, 160));
  await p.waitForTimeout(500);
  check(name + ' 能建卡片', (await p.locator('.card').count()) >= 1);
  // 顶栏溢出检查
  const topbar = await p.evaluate(() => {
    const tb = document.querySelector('.topbar');
    return tb ? { sw: tb.scrollWidth, cw: tb.clientWidth, hasH: tb.scrollWidth > tb.clientWidth } : null;
  });
  check(name + ' 顶栏无横向溢出', topbar && !topbar.hasH, topbar ? `sw${topbar.sw}/cw${topbar.cw}` : '无顶栏');
  // 选中卡片，检查器可用
  await p.locator('.card').first().click();
  await p.waitForTimeout(400);
  const insp = await p.evaluate(() => !!document.querySelector('.inspector'));
  check(name + ' 检查器出现', insp);
  // 打开导出（顶栏导出在移动端可能被收进项目菜单，尝试两处）
  let exportModal = false;
  await p.click('button[title="导出"]').catch(() => {});
  await p.waitForTimeout(300);
  exportModal = await p.evaluate(() => !!document.querySelector('.modal'));
  if (!exportModal) {
    await p.click('.tb-btn[title*="项目菜单"]').catch(() => {});
    await p.waitForTimeout(300);
    await p.click('.project-menu button:has-text("导出")').catch(() => {});
    await p.waitForTimeout(400);
    exportModal = await p.evaluate(() => !!document.querySelector('.modal'));
  }
  check(name + ' 导出弹窗可开', exportModal);
  if (exportModal) { const sv = await p.evaluate(() => { const m = document.querySelector('.modal'); return m ? { mw: m.getBoundingClientRect().width, sw: document.documentElement.clientWidth } : null; }); check(name + ' 导出弹窗不溢出', sv ? sv.mw <= sv.sw + 2 : false, sv ? `${Math.round(sv.mw)}/${sv.sw}` : ''); }
  await b.close();
}

await runFlow('竖屏', 390, 844);
await runFlow('横屏', 844, 390);
await runFlow('桌面', 1280, 800);
console.log('\n页面错误:', errs.length, errs.slice(0,3).join(' | '));