import fs from 'fs';
// 更新 card-fontsize 测试：slider → 按钮组
let t = fs.readFileSync('/root/创作助手/tests/card-fontsize.mjs', 'utf8');
const oldCheck = `const inspText = await page.locator('.inspector').textContent();
check('检查器有「正文字号」', inspText.includes('正文字号'));
const slider = page.locator('.inspector input[type="range"]');
check('字号 slider 存在', (await slider.count()) >= 1);

// ===== 2) 设置字号 26 → 卡片正文应用 =====
await page.evaluate(() => {
  const inp = document.querySelector('.inspector input[type="range"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '26');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(600);`;
const newCheck = `const inspText = await page.locator('.inspector').textContent();
check('检查器有「正文字号」', inspText.includes('正文字号'));
const fsBtns = page.locator('.inspector .btn-row button');
check('字号为常用按钮组(非slider)', (await fsBtns.count()) >= 5 && (await page.locator('.inspector input[type="range"]').count()) === 0, String(await fsBtns.count()) + ' 个按钮');

// ===== 2) 点击字号 18 → 卡片正文应用 =====
await page.click('.inspector .btn-row button:has-text("18")');
await page.waitForTimeout(600);`;
if (t.includes(oldCheck)) { t = t.replace(oldCheck, newCheck, 1); fs.writeFileSync('/root/创作助手/tests/card-fontsize.mjs', t); console.log('✅ card-fontsize 改按钮组'); } else console.log('⚠️ 未匹配');

// 后续断言 26px 改为 18px
t = fs.readFileSync('/root/创作助手/tests/card-fontsize.mjs', 'utf8');
t = t.replace(`check('卡片正文字号 = 26px', Math.abs(fs1 - 26) < 1.5, \`\${fs1}px\`);`, `check('卡片正文字号 = 18px', Math.abs(fs1 - 18) < 1.5, \`\${fs1}px\`);`);
t = t.replace(`check('放大后字号反缩放(屏幕恒定≈26)', Math.abs(fs2 * zoom - 26) < 3, \`卡片字号\${fs2.toFixed(1)}px × zoom\${zoom.toFixed(2)} ≈ \${(fs2 * zoom).toFixed(1)}px\`);`, `check('放大后字号反缩放(屏幕恒定≈18)', Math.abs(fs2 * zoom - 18) < 3, \`卡片字号\${fs2.toFixed(1)}px × zoom\${zoom.toFixed(2)} ≈ \${(fs2 * zoom).toFixed(1)}px\`);`);
fs.writeFileSync('/root/创作助手/tests/card-fontsize.mjs', t);
console.log('✅ 断言 26→18');