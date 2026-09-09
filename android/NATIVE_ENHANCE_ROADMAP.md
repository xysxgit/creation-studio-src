# 创作助手 · 安卓原生增强工程（方案 A：原生外壳 + WebView 内容区）

## 目标
在现有 Capacitor 6 + WebView 架构上，通过原生层（Kotlin + Compose + 自定义 Capacitor 插件）
实现"去壳感"的全套原生增强，同时保留核心编辑能力（WebView 承载）并做数据兼容。

## 方案 A 说明
- 原生产品外壳：原生启动页、原生返回/退出、原生系统能力、Material You 主题、沉浸式状态栏
- WebView 内容区：保留核心编辑器（无限画布/卡片/富文本），让内容区与原生壳无缝衔接
- 数据兼容：WebView localStorage → 原生存储的迁移桥，旧数据可读

## 分阶段实施计划

### 阶段 1：原生工程地基
- [x] 引入 Kotlin 插件 + Compose 依赖（build.gradle / variables.gradle）
- [x] 增强 MainActivity（原生启动体验、返回拦截、沉浸式、主题）
- [x] 创建原生增强模块结构（Kotlin 源集）并验证编译通过

### 阶段 2：原生启动与导航体验
- [ ] 原生启动页动画（非 WebView 白屏）
- [x] 原生返回拦截（协调 WebView/Capacitor）
- [x] 原生沉浸式状态栏/导航栏、动态主题（ThemePlugin）

### 阶段 3：系统级原生能力（Capacitor 插件）
- [x] 原生分享插件（作品/导出分享微信/QQ）
- [x] 原生文件系统访问（SD 卡/目录读写）
- [x] 原生相册/相机选图
- [x] 原生通知/创作提醒
- [x] 应用内版本检测 + APK 更新下载

### 阶段 4：核心编辑体验增强
- [ ] 画布手势原生增强（更跟手）

### 阶段 5：数据兼容
- [ ] WebView localStorage → 原生迁移桥（待做）
- [ ] 旧数据导入测试

### 阶段 6：全链构建与发布
- [ ] 全链验证（tsc → vite → cap sync → gradle assembleDebug）
- [ ] 生成新版本 APK / 版本号递增
- [ ] 三端同步（Gitee 源码 / 标签 / GitHub 官网）

## 数据存储现状
- 数据全部存 WebView localStorage，键：`cs.project.*`（项目）、`cs.current`（当前项目）、
  `cs.k_ai_history`、`cs.skills` 等
- 数据迁移需从 WebView localStorage 导出到原生存储（或原生存取 localStorage）

## 技术栈
- Kotlin 1.9.x + Jetpack Compose（原生外壳）
- Capacitor 6 自定义插件（系统能力）
- AGP 8.6.1 / Gradle 8.7 / JDK 17 / SDK 34 / minSdk 22
