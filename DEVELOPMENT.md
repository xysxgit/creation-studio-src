# 创作助手 · 剧本工坊 —— 开发文档

> 版本：v1.50.16（构建号 177）｜ 更新：2026-09-05
> 面向：本机开发、二次维护、版本发布

---

## 1. 项目概述

画板式剧本创作工具（Android 应用 + 同源 Web 端 PWA）：
- **画布卡片**：便签/图片/模板卡片自由拖放、缩放、连线（思维导图）
- **富文本编辑**：Tiptap 全屏写作（标题/表格/图片/颜色/格式）
- **故事日历**：排期、备注、状态管理（日历只做排期，卡片在画布创建）
- **分区与大纲**：组织项目结构；**灵感库**：模板/素材/角色卡一键插入
- **局域网协同**：WebSocket 多人实时共创（光标/操作同步/回收站）
- **云盘同步**：WebDAV 自动备份；**导出**：Word / Markdown / JSON

## 2. 技术栈

| 层 | 技术 |
|---|---|
| UI | React 18 + TypeScript（strict）+ Vite |
| 状态 | Zustand（src/store.ts 单仓库） |
| 富文本 | Tiptap（src/tiptap.ts / RichEditor） |
| 画布 | 自研坐标系 + Pointer 事件（CanvasBoard/EdgesLayer） |
| 原生 | Capacitor 6（Android） |
| 协同 | WebSocket（src/sync.ts） |
| 云盘 | WebDAV（src/cloudSync.ts） |

## 3. 目录结构

```
src/
├─ store.ts           # Zustand 全局仓库（项目/卡片/连线/设置/协同/撤销栈）
├─ meta.ts            # ★ 版本元信息唯一事实源（APP_VERSION/APP_BUILD/APP_NAME）
├─ types.ts           # 领域类型（Card/Edge/Project…）
├─ util.ts            # 纯函数工具（uid/clamp/countWords/fmtTime/toast/log…）
├─ tiptap.ts          # Tiptap 编辑器封装与 doc 工具
├─ cloudSync.ts       # WebDAV 云盘备份
├─ sync.ts            # 局域网协同（WS 客户端/服务端）
├─ defaults.ts        # 项目初始内容/模板种子
├─ inspiration.ts     # 灵感库（模板/素材）
├─ templates.ts       # 卡片模板系统
├─ editorAiStore.ts   # AI 写作状态（独立小仓库）
└─ components/
   ├─ App.tsx             # 应用壳（顶栏/画布/面板/弹窗分发）
   ├─ TopBar.tsx          # 顶栏（项目菜单/布局/协同状态）
   ├─ StatusBar.tsx       # 底部状态栏（★ 左下角版本号 = meta.ts）
   ├─ CanvasBoard.tsx     # 画布（指针交互/缩放/平移/选中）
   ├─ CardView.tsx        # 卡片视图（便签/图片/模板/节点模式）
   ├─ EdgesLayer.tsx      # 连线渲染与交互
   ├─ RichEditor.tsx      # 卡片内富文本
   ├─ FullscreenEditor.tsx# 全屏写作
   ├─ LeftSidebar.tsx     # 分区/大纲抽屉
   ├─ RightPanel.tsx      # 检查器/灵感/属性面板
   ├─ MiniMap.tsx         # 迷你地图
   ├─ Modals.tsx          # ★ 弹窗集合（ModalShell 外壳 + 新建/回收站/设置…）
   ├─ HelpModal.tsx       # 操作说明（卡片折叠式）
   ├─ CalendarMode.tsx    # 故事日历（排期/备注/状态，无新建入口）
   ├─ SystemDialog.tsx    # csConfirm/csPrompt 系统对话框
   └─ AIAssistant.tsx     # AI 写作助手
public/
├─ theme-overrides.css    # ★ 优化覆盖层（见 §6，必须最后加载）
├─ theme-overrides.js / select-inline.js / sw.js
└─ icon.svg / manifest.webmanifest
android/                  # Capacitor Android 工程（gradle versionCode/Name）
scripts/                  # bump-version.mjs 等发布脚本
```

## 4. 构建与发布流程

```bash
# 1) 类型检查（须 0 错误）
npx tsc --noEmit
# 2) Web 构建
npx vite build          # 输出 dist/
# 3) 同步原生（Capacitor）
npx cap sync android
# 4) Android APK（产物: android/app/build/outputs/apk/debug/app-debug.apk）
cd android && ./gradlew assembleDebug
```

发布命名：`creation-studio-v1.50.16-optimized-N.apk`
本机开发目录：`/sdcard/Download/Operit/work/creation-assistant-v1.50.15/`
构建环境：Ubuntu（proot，Node 24），工作副本 `/root/optbuild12/`（含 node_modules）。

## 5. 版本管理规范（★ 重要）

版本号四处必须一致，**meta.ts 为唯一事实源**：

| 位置 | 值 |
|---|---|
| src/meta.ts | APP_VERSION='1.50.16'、APP_BUILD=177 |
| android/app/build.gradle | versionName="1.50.16"、versionCode 177 |
| package.json | "version": "1.50.16" |
| public/sw.js | 缓存名 creation-studio-v177（改版本号须同步） |

- 应用内所有展示（画布左下角状态栏、云盘备份文件名）一律 `import { APP_VERSION } from './meta'`
- 禁止在组件内硬编码版本号（历史教训：StatusBar 曾硬编码 v1.48.99/v0.1 造成三处不一致）
- 发版建议用 `node scripts/bump-version.mjs <新版本>`（如脚本存在且可用）

## 6. 样式体系（★ 覆盖层加载顺序是硬约束）

- `styles.css`：主样式（Vite 打包为 assets/index-*.css）
- `public/theme-overrides.css`：优化/主题覆盖层 —— **必须在 index-*.css 之后加载**

`index.html` 中该 link 位于 `<script type="module">` 之后（构建后即位于 CSS 之后），
**请勿把该 link 移回 <head> 前部**，否则同优先级覆盖失效（2026-09 实坑：弹窗卡片化曾被全屏规则压制）。

新增覆盖规则时遵循：同优先级、后加载、仅用类选择器；如需覆盖媒体查询内规则，
由于同 specificity 时"后加载者胜"，覆盖层天然生效。

## 7. 专业名词规范（UI/注释/文档统一用词）

| 规范词 | 避免 | 说明 |
|---|---|---|
| 卡片 | 便签/节点（节点=脑图模式下的紧凑卡片） | 画布基本单位 |
| 分区 | 分组/栏 | 左侧大纲组织单元 |
| 协同 | 协作/协作者 | 局域网多人实时共创；成员=协同成员 |
| 思维导图 | 脑图 | 布局功能全称（按钮可用短标签） |
| 回收站 | 垃圾桶 | 项目/卡片删除的中间态 |
| 灵感 | 素材/点子 | 右侧灵感库 |
| 排期 | 日程/排程 | 日历侧功能 |

## 8. 响应式断点规范

| 断点 | 用途 |
|---|---|
| max-width: 1024px | 手机/平板（触屏）适配档 |
| max-width: 768px | 更窄适配 |
| max-width: 640px | 小屏手机 |
| orientation: landscape | 横屏全局优化 |
| pointer: coarse | 触屏命中区/避 hover 粘滞 |
| （功能专属）780/860px | 故事日历；900px 桌面小窗（侧栏收窄） |

功能专属断点允许保留，但手机布局主档位统一走 1024px。

## 9. 稳定性与一致性要点

- 类型检查：`npx tsc --noEmit` 必须 0 错误（strict 开启；noUnusedLocals 当前为 false，
  未使用声明清理已执行一轮，剩余为回调参数/多行解构等无害项，见 §11）
- 交互事件：统一 Pointer 事件（onPointer*），仅保留 1 处 onTouch* 兜底
- 弹窗：统一走 `ModalShell`（mask 居中卡片式，高度随内容，86dvh 上限内滚动）
- 误删保护：项目/卡片删除进回收站（TrashModal / CardTrashModal）
- Storage：localStorage 键集中在 store.ts 顶部常量（K_*）；云盘备份名用 APP_VERSION

## 10. 本版变更记录（自优化-19 起 → 优化-23）

1. 帮助弹窗重构为**折叠卡片**（HelpModal.tsx：Card 组件，默认首张展开，CSS 箭头）
2. 弹窗**卡片化**：覆盖"窄屏模态框全屏"规则 → 居中圆角、高度随内容、86dvh 内滚动
3. **修复 theme-overrides.css 加载顺序**（移到主 CSS 之后，覆盖恢复生效）
4. 版本号统一：状态栏左下角/备份文件名统一走 meta.ts；package.json、sw.js 缓存名、gradle versionCode=177 对齐
5. 术语统一："协作→协同""脑图→思维导图"；注释规范更新（util/meta/StatusBar 等）
6. 死代码清理：移除一批未使用 import 与常量（store/templates/RightPanel/TopBar 等）

## 11. 已知待优化（非阻塞）

- 约 21 处"声明未读取"（回调参数、解构、多行函数等，自动工具无法安全删除）：
  RightPanel（sec/genBtn/setMobilePanel 等）、store.ts（forEach 回调 i）、defaults.ts（map 回调 i）
  等，均不影响运行，后续人工清理。
- 全局横屏规则（styles.css 6189 处）与窄屏 1024 规则存在少量叠加，需真机回归。

## 12. 验收清单（Android 真机）

- [ ] 打开应用 → 进入项目（首次自动弹出操作说明，卡片可折叠）
- [ ] 画布左下角版本号显示 **v1.50.16**
- [ ] 回收站（项目）弹窗为居中卡片（高度贴合内容）
- [ ] 操作说明各 Tab 折叠/展开正常
- [ ] 新建项目 / 设置 / 确认框均为卡片式
- [ ] 横竖屏切换、深浅色主题无布局错乱
- [ ] 协同（两台设备）光标/同步正常
- [ ] 云盘备份文件名含 v1.50.16
