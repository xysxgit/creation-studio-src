import { chromium } from 'playwright';
import http from 'node:http';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'AI生成的小说正文内容。' } }] }));
    });
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end('{}');
});
await new Promise((r) => server.listen(8181, r));

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8787/'); await page.waitForSelector('.welcome',{timeout:8000});
await page.evaluate(()=>{localStorage.clear();localStorage.setItem('cs.helpSeen','1');localStorage.setItem('cs.settings', JSON.stringify({ ai: { enabled:true, endpoint:'http://localhost:8181/v1', apiKey:'', model:'test', permission:'edit' } }));});
await page.reload(); await page.waitForSelector('.welcome');
await page.click('text=＋ 新建项目'); await page.waitForTimeout(300);
await page.click('.modal-actions .btn.primary'); await page.waitForSelector('.canvas-wrap',{timeout:15000});
await page.waitForTimeout(500);
await page.click('button[title="正文创作"]'); await page.waitForSelector('.wm-main',{timeout:15000});
await page.waitForTimeout(300);
await page.click('button:has-text("＋ 新建章")'); await page.waitForTimeout(500);
await page.click('.rich-scroll .ProseMirror'); await page.keyboard.type('这是原来的正文内容。');
await page.waitForTimeout(2500);
await page.click('button:has-text("🤖 AI")'); await page.waitForTimeout(300);
await page.fill('textarea[placeholder*="给 AI"]', '帮我续写一段');
await page.click('button:has-text("发送")');
await page.waitForFunction(() => document.querySelector('.wm-ai-msg.ai')?.textContent?.includes('AI生成的小说正文内容'), { timeout: 15000 });
await page.waitForTimeout(300);
await page.click('.wm-ai-msg.ai .wm-ai-apply:has-text("替换正文")'); await page.waitForTimeout(500);
const edText = await page.evaluate(() => (document.querySelector('.rich-scroll .ProseMirror')?.textContent || '').trim());
console.log('替换后正文含AI文本:', edText.includes('AI生成的小说正文内容') ? '✅' : '❌('+edText.slice(0,50)+')');
const writeTrashInfo = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('cs.writeTrash'));
  const arr = [];
  for (const k of keys) { try { arr.push(...(JSON.parse(localStorage.getItem(k)||'[]'))); } catch {} }
  return arr.map(c => JSON.stringify(c));
});
const hasBackup = writeTrashInfo.some(t => t.includes('这是原来的正文内容'));
console.log('原稿已备份到正文回收站:', hasBackup ? '✅' : '❌ 备份条数='+writeTrashInfo.length);
// 校验 AI 生成历史被记录
const aiHistoryInfo = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('cs.aiHistory'));
  const arr = [];
  for (const k of keys) { try { arr.push(...(JSON.parse(localStorage.getItem(k)||'[]'))); } catch {} }
  return arr.map(e => ({ mode: e.mode, title: e.title, text: JSON.stringify(e.content) }));
});
const hasAiHist = aiHistoryInfo.some(e => e.mode==='replace' && e.text.includes('AI生成的小说正文内容'));
console.log('AI 生成历史已记录:', hasAiHist ? '✅' : '❌ 记录数='+aiHistoryInfo.length);
// 打开 AI 生成历史面板
await page.click('button[title="AI 生成历史"]'); await page.waitForTimeout(400);
console.log('AI历史面板标题:', await page.locator('text=AI 生成历史').count()>0?'✅':'❌');
console.log('历史条目含AI文本:', await page.locator('textarea, .aih-preview').count()>0 && await page.locator('text=共 1 条').count()>0?'✅':'❌('+aiHistoryInfo.length+')');
// 关闭面板，再改内容，然后从历史恢复
await page.click('.wm-trash-head .modal-x'); await page.waitForTimeout(300);
await page.click('.rich-scroll .ProseMirror'); await page.keyboard.type('。第二次修改'); await page.waitForTimeout(1200);
await page.click('button[title="AI 生成历史"]'); await page.waitForTimeout(400);
await page.click('.wm-trash-item .wm-item-actions button[title="恢复到该版本"]'); await page.waitForTimeout(500);
const restoredText = await page.evaluate(() => (document.querySelector('.rich-scroll .ProseMirror')?.textContent || '').trim());
console.log('恢复历史后正文回到历史版本(不含第二次修改):', restoredText.includes('AI生成的小说正文内容') && !restoredText.includes('第二次修改') ? '✅' : '❌('+restoredText.slice(0,50)+')');
console.log('AI安全提示文案:', await page.locator('text=自动把本章原稿备份到正文回收站').count()>0?'✅':'❌');
console.log('页错:', errs.length, errs.slice(0,2).join(' | '));
await browser.close();
server.close();