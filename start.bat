@echo off
chcp 65001 >nul
title 创作助手 · 协同主控端（服务器版）
cd /d %~dp0

echo ==================================================
echo    创作助手 · 剧本工坊   协同主控端 一键启动
echo ==================================================
echo.

rem ---------- 1) 优先使用便携包内置 Node，其次系统 Node ----------
set "NODE_CMD="
if exist "%~dp0runtime\node.exe" set "NODE_CMD=%~dp0runtime\node.exe"
if not defined NODE_CMD (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_CMD=node"
)

if not defined NODE_CMD (
  echo [1/3] 未检测到 Node.js。
  echo       - 若为本「便携内置版」：请确认 zip 内自带 runtime\node.exe（免安装）。
  echo       - 若为源码方式：请下载安装 Node.js LTS 版：https://nodejs.org/
  echo         安装完成后重新双击本脚本即可。
  echo.
  pause
  exit /b 1
)
echo [1/3] 运行环境已就绪

rem ---------- 2) 安装依赖 ----------
if exist "%~dp0node_modules" (
  echo [2/3] 依赖已就绪
) else (
  echo [2/3] 正在安装依赖（首次约需几分钟，请耐心等待）...
  call npm install
)

rem ---------- 3) 构建前端 ----------
if exist "%~dp0dist\index.html" (
  echo [3/3] 前端已构建
) else (
  echo [3/3] 正在构建前端...
  call npm run build
)

echo.
echo ==================================================
echo  正在启动 创作助手 协同主控端（服务器）...
echo  本机访问：     http://localhost:8787
echo  局域网主页：   http://<本机IP>:8787
echo  手机/平板 扫码 或 输入 本机IP:8787 即可协同创作。
echo  关闭本窗口即退出主控端。
echo ==================================================
echo.
"%NODE_CMD%" "%~dp0server\index.js"
pause