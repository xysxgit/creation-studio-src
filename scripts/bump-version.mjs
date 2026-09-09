// 每次打包 APK 前自动递增版本号：versionCode+1，versionName+0.1
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = join(root, 'android/app/build.gradle');
let src = readFileSync(gradle, 'utf-8');

const codeMatch = src.match(/versionCode\s+(\d+)/);
const nameMatch = src.match(/versionName\s+"([^"]+)"/);
if (!codeMatch || !nameMatch) {
  console.error('❌ 未找到 versionCode/versionName');
  process.exit(1);
}
const oldCode = parseInt(codeMatch[1], 10);
const oldName = nameMatch[1];
const newCode = oldCode + 1;
// versionName：形如 "1.0" 的数值 → +0.1；非纯数字则追加 .1
let newName;
if (/^\d+(\.\d+)?$/.test(oldName)) {
  const parts = oldName.split('.');
  const last = parseInt(parts[parts.length - 1], 10) + 1;
  parts[parts.length - 1] = String(last);
  newName = parts.join('.');
} else {
  newName = `${oldName}.1`;
}
src = src.replace(/versionCode\s+(\d+)/, `versionCode ${newCode}`);
src = src.replace(/versionName\s+"([^"]+)"/, `versionName "${newName}"`);
writeFileSync(gradle, src, 'utf-8');

// 同步 src/meta.ts（版本元信息入口，供运行时展示/调试使用）
const metaPath = join(root, 'src/meta.ts');
try {
  let meta = readFileSync(metaPath, 'utf-8');
  meta = meta.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${newName}'`);
  meta = meta.replace(/APP_BUILD = \d+/, `APP_BUILD = ${newCode}`);
  writeFileSync(metaPath, meta, 'utf-8');
} catch (e) {
  console.warn('⚠️ 未同步 src/meta.ts：', e.message);
}
console.log(`🔖 版本号：${oldName} (${oldCode}) → ${newName} (${newCode})`);