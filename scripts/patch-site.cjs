const fs = require('fs');
const p = '/sdcard/Download/cloudbase_site/index.html';
let s = fs.readFileSync(p, 'utf8');

const WIN_ZIP = 'https://github.com/xysxgit/creation-studio/releases/download/portable-v1.48/creation-studio-portable.zip';

// 1) 下载区：在安卓下载 note 后追加 Windows 桌面版下载按钮
const note = '版本号 <b>v1.47</b> · 大小 4.4 MB</div>';
if (s.includes(note)) {
  const winBtn = [
    '版本号 <b>v1.47</b> · 大小 4.4 MB</div>',
    `<a class="dl-btn alt" href="${WIN_ZIP}" target="_blank" rel="noopener">`,
    '      <span class="ic">🖥️</span> 下载 Windows 便携版',
    '    </a>',
    '    <div class="dl-note">Windows x64 · 免装 Node · 解压后双击 <b>启动.bat</b>，浏览器打开 http://localhost:8787</div>',
  ].join('\n');
  s = s.replace(note, winBtn);
  console.log('  已加 Windows 下载按钮');
} else {
  console.log('  警告: 下载 note 未命中');
}

// 2) 卡片区：在 Windows 桌面版卡片加在「跨平台移动端」卡后
const cardAnchor = '<p>基于 Capacitor 构建，一次开发多端运行，横竖屏自适应，触控友好，数据本地存储、离线可用。</p></div>';
if (s.includes(cardAnchor)) {
  const winCard =
    cardAnchor +
    '<div class="card"><div class="emoji">🖥️</div><h3>Windows 便携版（ComfyUI 式）</h3>' +
    '<p>解压即用：内置运行环境（免装 Node），双击「启动.bat」即启动协同服务器，浏览器打开 http://localhost:8787 使用；本机即协同主控端，与安卓/网页端实时协同。</p></div>';
  s = s.replace(cardAnchor, winCard);
  console.log('  已加 Windows 桌面版卡片');
} else {
  console.log('  警告: 卡片锚点未命中');
}

fs.writeFileSync(p, s);
console.log('OK 官网 index.html 已更新');