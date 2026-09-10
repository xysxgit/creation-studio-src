// ============ 创作助手 · 协同服务器 PM2 守护配置 ============
// 用途：让 server/index.js 常驻、崩溃自动拉起、限制内存上限。
// 用法：
//   npm i -g pm2
//   pm2 start deploy/pm2.ecosystem.config.cjs
//   pm2 save && pm2 startup   # 开机自启（按提示执行输出的命令）
//
// 安全/部署提示：
//   · 对外/公网部署务必设置 CORS_ORIGIN 收紧跨域（默认 * 便于局域网）。
//   · 需要更大请求体时调 BODY_LIMIT（默认 100mb）。
//   · max_memory_restart：超过阈值自动重启，防内存缓慢泄漏拖垮进程。
module.exports = {
  apps: [
    {
      name: 'creation-studio-server',
      script: 'server/index.js',
      cwd: __dirname + '/..',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: '512M',
      kill_timeout: 8000, // 给 flushAll() 落盘留时间
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
        // CORS_ORIGIN: 'https://example.com',  // ← 公网部署时取消注释并改成本来源
        // BODY_LIMIT: '200mb',
      },
      out_file: 'logs/server.out.log',
      error_file: 'logs/server.err.log',
      time: true,
    },
  ],
};
