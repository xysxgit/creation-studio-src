import fs from 'fs';
let ok = (m) => console.log('✅', m), bad = (m) => console.log('⚠️', m);

// ============ 1) 测试：JSON/图片改用「浏览器默认下载」按钮验证 downloadBlob 路径 ============
let t = fs.readFileSync('/root/创作助手/tests/export-clean-part1.mjs', 'utf8');
t = t.replace(`await page.click('.btn.primary:has-text("选择位置并下载")');`, `await page.click('.btn:has-text("⤓ 浏览器默认下载")');`, 1);
fs.writeFileSync('/root/创作助手/tests/export-clean-part1.mjs', t);
ok('part1 改浏览器默认下载');

// ============ 2) Modals.tsx：图片未生成时的友好提示 ============
let m = fs.readFileSync('/root/创作助手/src/components/Modals.tsx', 'utf8');
const oldImg = `      if (format === 'image') {
        if (!imgSrc) throw new Error('图片尚未生成，请稍候');
        blob = await (await fetch(imgSrc)).blob();`;
const newImg = `      if (format === 'image') {
        if (!imgSrc) { toast('画布图片仍在生成中，请稍候再点一次…', 'warn'); setBusy(false); return; }
        blob = await (await fetch(imgSrc)).blob();`;
if (m.includes(oldImg)) { m = m.replace(oldImg, newImg, 1); fs.writeFileSync('/root/创作助手/src/components/Modals.tsx', m); ok('图片提示优化'); } else bad('图片提示定位');
console.log('完成');