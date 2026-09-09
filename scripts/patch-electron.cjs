const fs = require('fs');
const mainPath = '/root/创作助手/electron/main.js';
let s = fs.readFileSync(mainPath, 'utf8');

// 1) 引入 ipcMain
s = s.replace(
  "import { app, BrowserWindow, shell } from 'electron';",
  "import { app, BrowserWindow, shell, ipcMain } from 'electron';"
);
// 2) 引入 os
s = s.replace(
  "import path from 'path';\nimport { fileURLToPath } from 'url';",
  "import path from 'path';\nimport os from 'os';\nimport { fileURLToPath } from 'url';"
);
// 3) 注入 preload
s = s.replace(
  "      contextIsolation: true,\n      sandbox: false,\n    },",
  "      contextIsolation: true,\n      sandbox: false,\n      preload: path.join(__dirname, 'preload.cjs'),\n    },"
);
// 4) 注入 lanIps + ipc handler（在 createWindow 前）
s = s.replace(
  'function createWindow() {',
  [
    'function lanIps() {',
    '  const ips = [];',
    '  try {',
    '    const osI = os.networkInterfaces();',
    '    for (const name of Object.keys(osI)) {',
    '      for (const i of osI[name] || []) {',
    "        if (i.family === 'IPv4' && !i.internal) ips.push(i.address);",
    '      }',
    '    }',
    '  } catch {}',
    '  return [...new Set(ips)];',
    '}',
    '',
    "ipcMain.handle('get-lan-info', () => {",
    '  const urls = lanIps().map((ip) => `http://${ip}:${PORT}`);',
    '  const wsUrls = lanIps().map((ip) => `ws://${ip}:${PORT}`);',
    '  return { port: PORT, urls, wsUrls, local: `http://localhost:${PORT}` };',
    '});',
    '',
    'function createWindow() {',
  ].join('\n')
);
fs.writeFileSync(mainPath, s);

const preload = [
  "const { contextBridge, ipcRenderer } = require('electron');",
  "contextBridge.exposeInMainWorld('creationDesktop', {",
  '  isDesktop: true,',
  "  getLanInfo: () => ipcRenderer.invoke('get-lan-info'),",
  '});',
].join('\n');
fs.writeFileSync('/root/创作助手/electron/preload.cjs', preload + '\n');

console.log('OK main.js & preload.cjs 已更新');