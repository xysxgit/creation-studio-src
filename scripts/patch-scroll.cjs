const fs = require('fs');
const p = '/root/创作助手/src/styles.css';
let s = fs.readFileSync(p, 'utf8');

function fix(sel) {
  const re = new RegExp(sel + '\\s*\\{[^}]*\\}', 'g');
  const before = s;
  s = s.replace(re, (block) => block.replace(/overflow:\s*auto;/, 'overflow-y: auto; overflow-x: hidden;'));
  if (s === before) console.log('  未命中:', sel);
  else console.log('  已改:', sel);
}

console.log('=== 去除横向滚动（正文主内容区 改为只竖向）===');
fix('\\.paper-stage');
fix('\\.fe-body\\.card-body');
fix('\\.fe-image-body');
fix('\\.log-view');

fs.writeFileSync(p, s);
console.log('OK styles.css 已更新');