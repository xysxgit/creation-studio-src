// 打印局域网可用的访问与安卓 APK 下载地址
import os from 'os';

const PORT = Number(process.env.PORT || 8787);

function lanIps() {
  const ips = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
      }
    }
  } catch { /* ignore */ }
  return [...new Set(ips)];
}

const ips = lanIps();
console.log('🪄 创作助手 · 局域网下载地址');
console.log(`   本机访问：      http://localhost:${PORT}`);
if (ips.length === 0) {
  console.log('   (未检测到局域网 IPv4 地址，请确认已连接 Wi-Fi/网线)');
}
for (const ip of ips) {
  console.log('');
  console.log(`   局域网主页：    http://${ip}:${PORT}`);
  console.log(`   安卓 APK 直链：http://${ip}:${PORT}/apk/creation-studio.apk`);
  console.log(`   安卓下载页：    http://${ip}:${PORT}/apk/`);
}
