#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "=================================================="
echo "   创作助手 · 剧本工坊   协同主控端 一键启动"
echo "=================================================="
echo

# 1) 优先使用便携包内置 Node，其次系统 Node
NODE_CMD=""
if [ -x "$(pwd)/runtime/node" ]; then NODE_CMD="$(pwd)/runtime/node"; fi
if [ -z "$NODE_CMD" ] && command -v node >/dev/null 2>&1; then NODE_CMD="node"; fi
if [ -z "$NODE_CMD" ]; then
  echo "[1/3] 未检测到 Node.js，请先安装 LTS 版：https://nodejs.org/"
  exit 1
fi
echo "[1/3] 运行环境已就绪"

# 2) 安装依赖
if [ -d node_modules ]; then
  echo "[2/3] 依赖已就绪"
else
  echo "[2/3] 正在安装依赖（首次约需几分钟）..."
  npm install
fi

# 3) 构建前端
if [ -f dist/index.html ]; then
  echo "[3/3] 前端已构建"
else
  echo "[3/3] 正在构建前端..."
  npm run build
fi

echo
echo "正在启动 创作助手 协同主控端（服务器）..."
echo "本机访问：http://localhost:8787"
echo "手机/平板 扫码 或 输入 本机IP:8787 即可协同创作。Ctrl+C 退出。"
echo
exec "$NODE_CMD" server/index.js