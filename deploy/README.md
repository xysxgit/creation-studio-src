# 部署与运维（协同服务器）

本目录提供 `server/index.js` 的守护进程模板，解决"进程挂了没人拉 / 内存缓慢增长拖垮服务"的稳定性问题。

## 一、PM2（推荐，跨平台）

```bash
npm i -g pm2
pm2 start deploy/pm2.ecosystem.config.cjs
pm2 save
pm2 startup          # 按提示执行它输出的那条命令，实现开机自启
pm2 logs creation-studio-server
```

- 崩溃自动重启（`autorestart`）、最大内存超限自动重启（`max_memory_restart: 512M`）
- `kill_timeout: 8000` 给服务端 `flushAll()` 落盘留时间，避免退出丢数据

## 二、systemd（Linux 服务器）

```bash
sudo cp deploy/creation-studio-server.service /etc/systemd/system/
# 编辑该文件，改 WorkingDirectory / ExecStart / User 为你的实际路径
sudo systemctl daemon-reload
sudo systemctl enable --now creation-studio-server
journalctl -u creation-studio-server -f
```

## 三、可配置的环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | 监听端口 |
| `CORS_ORIGIN` | `*`（全放开） | **公网部署务必收紧**，逗号分隔白名单，如 `https://a.com,https://b.com` |
| `BODY_LIMIT` | `100mb` | 请求体上限（大项目/内嵌图片可调大） |
| `RELAY_TIMEOUT_MS` | `60000` | WebDAV/云盘代理上游超时（毫秒） |

## 四、安全部署检查清单

- [ ] 对外/公网：设置 `CORS_ORIGIN` 为你的来源白名单（否则任意站点可跨域调用本服务）
- [ ] 需要时调小 `BODY_LIMIT`，避免异常大包抬内存
- [ ] 用 systemd/pm2 常驻，并设置内存重启阈值
- [ ] 数据目录 `data/`、备份 `data-backups/` 定期离线备份
- [ ] 服务端已内置基础安全头（CSP / nosniff / DENY / no-referrer）与 API `no-store`
