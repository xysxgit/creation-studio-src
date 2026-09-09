const fs = require('fs');
const path = '/root/创作助手/package.json';
const p = JSON.parse(fs.readFileSync(path, 'utf8'));
p.main = 'electron/main.js';
p.scripts.electron = 'electron .';
p.scripts['electron:dev'] = 'npm run build && electron .';
p.scripts['electron:build'] = 'electron-builder --win';
p.build = {
  appId: 'io.creation.studio',
  productName: '创作助手',
  asar: false,
  directories: { output: 'release' },
  files: ['electron/**/*', 'dist/**/*', 'server/**/*', 'package.json'],
  win: { target: ['nsis', 'portable'] },
};
fs.writeFileSync(path, JSON.stringify(p, null, 2));
console.log('OK package.json 已更新');
