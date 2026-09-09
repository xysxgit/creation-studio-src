@echo off
chcp 65001 >nul
title 构建创作助手 · 便携服务包
cd /d %~dp0

echo ==================================================
echo  正在构建「创作助手 · 便携服务包」(ComfyUI 式)
echo  结果是一个 zip：解压 → 双击启动 → 浏览器使用
echo ==================================================
echo.

rem ---------- 0) 构建前端 ----------
if exist "%~dp0dist\index.html" (
  echo [1/5] 前端已构建
) else (
  echo [1/5] 正在构建前端...
  call npm run build
  if errorlevel 1 (echo !! 前端构建失败 & exit /b 1)
)

rem ---------- 1) 整理便携目录 ----------
echo [2/5] 整理便携目录...
if exist "%~dp0portable" rmdir /s /q "%~dp0portable"
mkdir "%~dp0portable\server" "%~dp0portable\data" "%~dp0portable\runtime"
xcopy /e /i /y "%~dp0dist" "%~dp0portable\dist" >nul
copy /y "%~dp0server\index.js" "%~dp0portable\server\" >nul
copy /y "%~dp0start.bat" "%~dp0portable\启动.bat" >nul

rem ---------- 2) 获取内置 Node 运行时 ----------
echo [3/5] 获取内置 Node 运行时 (约 30MB)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://npmmirror.com/mirrors/node/v20.18.0/node-v20.18.0-win-x64.zip'; $z=Join-Path $env:TEMP 'node-rt.zip'; if(!(Test-Path $z)){Invoke-WebRequest -Uri $u -OutFile $z -UseBasicParsing}; $d=Join-Path $env:TEMP 'node-rt'; if(-not (Test-Path (Join-Path $d 'node.exe'))){Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive -Path $z -DestinationPath $d -Force}; Copy-Item (Join-Path $d 'node.exe') '%~dp0portable\runtime\node.exe' -Force"
if not exist "%~dp0portable\runtime\node.exe" (echo !! Node 运行时下载/解压失败 & pause & exit /b 1)

rem ---------- 3) 安装服务器运行时依赖 ----------
echo [4/5] 安装服务器依赖...
pushd "%~dp0portable"
>package.json echo {"type":"module"}
call npm install --omit=dev express@4.19.2 ws@8.18.0 qrcode@1.5.4 --no-audit --no-fund
if errorlevel 1 (popd & echo !! 依赖安装失败 & pause & exit /b 1)
popd

rem ---------- 4) 打包 zip ----------
echo [5/5] 打包 zip...
powershell -NoProfile -Command "Compress-Archive -Path 'portable\*' -DestinationPath '创作助手便携版.zip' -Force"

echo.
echo ==================================================
echo 完成！已生成：%~dp0创作助手便携版.zip
echo 用法：解压 → 双击「启动.bat」→ 浏览器打开 http://localhost:8787
echo 手机/平板输入本机IP:8787 可协同。
echo ==================================================
echo.
pause