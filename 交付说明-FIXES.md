# 「创作助手 · 剧本工坊」v2.33 修复交付说明

> 基底：权威完整源码 `creation-assistant-v2.33`（你上传的那份全功能主线）
> 方案：**① 轻量修复**——只做安全 / 发布 / 版本一致性 / 点状问题层面收敛，**不删任何功能、不动存储与协同架构**。
> 完工状态：前端 `tsc` 0 错、`vite build` 全绿；Android 壳改动均已静态核验通过。

---

## 一、这轮到底修了什么（共 4 项）

### 1. 版本号一致性（消除“版本错乱”的真 bug）
修复前：源码里同一套产品 `android/app/build.gradle` 的 `versionName` 仍是旧的 **`"1.50.16"`**，
而 `src/meta.ts` 已是 **`APP_VERSION = '2.33.0'` / `APP_BUILD = 177`** —— 壳与应用内版本“两张皮”，
打出的包名对不上、升级/渠道判断也会踩坑。
- 把 `android/app/build.gradle` 的 `versionName` **对齐为 `"2.33.0"`**，
  与 `src/meta.ts` 的 `APP_VERSION='2.33.0'` 完全一致。
- `versionCode 177` 保留，与 `APP_BUILD = 177` 一致（同一数值口径）。
- 同步说明：今后正式发版建议走 `scripts/bump-version.mjs`（它会顺带把 meta 与 shell 一起抬版本），
  避免再次两边脱节。

### 2. 发布基线加固：release 显式关闭可调试标记
修复前：官方壳的发布流程走的是 **debug** 装配（`android:apk` 脚本默认 `assembleDebug`），
这正是官方包会带着 `debuggable` 遗留的根源——发布包一旦可被附加调试/带 debug 信息，属于发布安全隐患。
- 在 `android/app/build.gradle` 的 `release {}` 中**显式声明 `debuggable false`**（加了中文注释说明意图），
  确保将来走正式 `assembleRelease` 时不会把可调试标记带进发布包。
- `minifyEnabled true / shrinkResources true / proguard` 保持原样（不砍功能，仅保留原压缩混淆设定）。

### 3. 明文流量收敛：从“AndroidManifest 里裸全局放行”收进集中配置文件
修复前：`AndroidManifest.xml` 上直接挂了全局 `android:usesCleartextTraffic="true"`，
等于整包任何明文 HTTP 一律放行，连 debug 期才该有的宽松也带进了发布。
- 把该**裸属性移除**，改由应用引用集中管控文件
  `android:networkSecurityConfig="@xml/network_security_config"`。
- 新建集中配置 `res/xml/network_security_config.xml`，其中：
  - `base-config cleartextTrafficPermitted="true"` —— 保留明文能力，确保
    **局域网协同服务器（server/index.js / 默认 8787）与自建 AI 网关（Ollama / LM Studio / OpenWebUI）等功能不缺失**；
  - `localhost` / `127.0.0.1` / `.local` 内网主机单独放行；
  - 文件中已注释说明：若 release 想进一步收紧，只须把 base-config 改成 `false`
    并在 `domain-config` 白名单逐个放行可信主机/IP。

### 4. XML 格式修复（本轮卡点已解决）
该 `network_security_config.xml` 曾被静态解析报 `not well-formed (line 5 col 4)`。
根因：注释正文里的**连排减号 `--`**（如 `====…` / `——` 装饰行）违反 XML 注释语法
（注释内容内不允许出现相邻的两个 `--`）。
- 已重写该文件，去除所有连排 `--` 风险、并改用尽量 ASCII 的安全注释；
- 现已通过校验：本目录下全部 11 个 `res/*.xml` + `AndroidManifest.xml` 均 XML 合法。

> 另注：`INTERNET` 权限保持不变（局域网协同 / AI 都要用）；本文件若需对 release 做最终收紧，
> 请按注释提示在白名单内填实际网段后，再走一次正式 `assembleRelease`。

---

## 二、修复后如何自己发正式包（避开 debuggable 的坑）

原壳脚本默认 **assembleDebug**（这就是含可调试标记的源头）。要打“干净”的正式包：

```bash
# 1. 装依赖
npm install

# 2. 前端构建（会在 android/app/src/main/assets 生成 dist）
npm run build         # 或后端直接 npx vite build

# 3. 走 Android 正式 Release（非 debug）
cd android
./gradlew app:assembleRelease
#   产物：android/app/build/outputs/apk/release/app-release.apk
#   （已配 release.keystore 签名的话会正常签名；需确认签名配置在 capacitor 环境可用）
```

发到“能打正式 APK”的一个替代脚本：若项目里 `npm run android:apk` 仍走 debug，
请改成切到 release 再装配，或手动调 `./gradlew assembleRelease`，以确保 `debuggable=false` 生效。

---

## 三、验证记录（为什么能放心拿去用）

| 验证项 | 结果 |
|---|---|
| 前端 TypeScript 体检 `npx tsc --noEmit` | 0 错误 ✅ |
| 前端打包 `vite build` | 全绿（229 模块；产物含 Workshop / LogPanel / StoryTimeline / CalendarBoard 等**全部功能 chunk**）✅ |
| `vendor` / `react` 框架 chunk | 与官方包哈希一致（代码同源佐证）✅ |
| 注入资源指纹 theme-overrides.js / select-inline.js / theme-overrides.css | `f1016c0a` / `1f84a416` / `5dcd21d9`——与官方·optimized‑34·本源码三方一致 ✅ |
| `android/` 全部 `res/*.xml` + `AndroidManifest.xml` | XML 均合法（上文 XML bug 已修）✅ |
| 版本号 | shell `2.33.0/177` = meta `2.33.0/177`，一致 ✅ |
| release `debuggable false` | 已显式声明 ✅ |

> 本轮属“① 轻量修复”，因此**未动**存储层（localStorage/IndexedDB 单键全量、Base64 图片内嵌配额）与
> 协同覆盖冲突等 P0 数据层架构问题——那是将来“② 数据层根治”的专项，需另开会话处理，避免放大改动面引入回归。

---

## 四、交付物

- 本文件夹即**修复后的完整 v2.33 源码**（可直接 `npm install` + 按上面发版）。
- 若需差异清单：改动集中在 4 个文件——
  1. `android/app/build.gradle`（版本 + release debuggable）
  2. `android/app/src/main/AndroidManifest.xml`（明文收敛引用）
  3. `android/app/src/main/res/xml/network_security_config.xml`（**新增**）
  4. `src/meta.ts`（未改动，仅作版本对照基准）
- 打整包交付：把本工程除 `node_modules/`、`dist/`、`.git/` 之外打包即得干净可构建的修复源码。

---
## 五、追加修复（用户体验/业务对齐）：折叠连线修复【bug#1】
> 用户预览后指出「卡片折叠后，连接线位置不对」——折叠卡的连线几何没随“折叠后的实际可见尺寸”更新。
**根因**：卡片折叠后 `CardView` 不再渲染正文（视觉只剩 `.card-topbar(36) + .card-header(36) + 上下边框(2) ≈ 74px`），
但连线几何 `edgeGeometry / anchorPoint` 仍把每张卡当成“展开的全高 `card.h`”求中心 / 边界中点 / 曲线控点，
于是折叠卡的连线起止与中点落在了过高的假想盒上，视觉对不上。
**修复**（`src/utils/geometry.ts`）：
- 新增常量 `COLLAPSED_H = 74` 与导出函数 `cardViewBox()` → 返回卡片“参与连线几何的可见盒”：
  折叠时高取 74（标题条），展开才用完整 `card.h`；宽 / 坐标总取卡片自身。
- `edgeGeometry`（直线 / 折线 / 贝塞尔曲线）与 `anchorPoint`（w/e/n/s 边界锚点）全部改读该可见盒。
- 结论：折叠后连线会贴到折叠标题条的真实四边与中点，与 `CardView` 渲染一致。

## 六、追加修复（缺功能对齐官方 1.50.16.1）：时间轴复活「伏笔账本」【bug#2】
> 用户预览后指出「时间轴缺伏笔回收那个」（对比官方 1.50.16.1 的 StoryTimeline）。官方该版 StoryTimeline
> 内有一套更重的伏笔账本（埋设→回收点→待回收🐣/已回收✅ 双向联动）。本工程 v2.33 的 types 已具备
> `evType('seed'=伏笔)` / `payDate(计划回收日)` / `date` 等伏笔所需字段，但**缺官方那条关联键 `seedFor`**，
> 因而无法把“某条伏笔在哪被回收”组织起来，账本无从联动——这正是要补的那层。
**改动（语义对齐官方、兼容 v2.33 数据与协同，不动存储/表单schema之外的架构）**：
- `src/types.ts`：在 `Card` 上新增**可选** `seedFor?: string`（本卡=“回收点”时指向被回收的伏笔卡 id）。默认不写，旧数据无感。
- `src/components/StoryTimeline.tsx`：
  1. 顶部工具条新增 **`📌 伏笔账本（N）`** 开关（N=当前伏笔数）；
  2. 新增浮层**伏笔账本**：左列列出全部伏笔（`埋设日期 · 计划回收日 · 🐣待回收 / ✅已回收 / ⚠已过回收点`），
     下列该伏笔的回收点；右列为**回收点一览**（`回收点 → 回收「伏笔名」`）。点任一条跳卡日仍聚焦该卡；
  3. 事件**底部详情**新增“🔗 回收的伏笔 / 🎣 伏笔状态”下拉：给当前卡设要回收的伏笔（回收点卡），
     或清空；伏笔卡自身则显示当前**是否已被回收 / 待回收**及计划回收日——改动即时 `updateCard` 落库，
     账本/状态实时联动（某伏笔被任一回收卡指向即自动变 `✅ 已回收`）。
  4. 徽标/配色仅内联 + `styles.css` 尾补 `tl-book-* / seed-ok / seed-wait / tl-seedfor` 一套样式（响应式窄屏单列）。
- 蓝色箭头闭环成立：**建一条 evType=伏笔 → 需要回收时另建事件卡设“回收的伏笔”指向它 → 伏笔自动 ✅已回收，账本与详情双向可见**。

## 七、验证记录（本两轮追加）
| 验证项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 ✅ |
| `vite build` | 全绿（229 模块；StoryTimeline chunk 已含新账本，25KB）✅ |
| `127.0.0.1:5176` dev 实时转换新增模块 | `伏笔账本`×3 / `回收的伏笔`×4 / `seedFor`×10 / `tl-book`×16 均在，HMR 已生效可即时预览 ✅ |
| 改动落点 | `src/types.ts`、`src/utils/geometry.ts`（上一轮连线）、`src/components/StoryTimeline.tsx`、`src/styles.css` |

> 注：相对上一版“① 轻量修复”4 项，本轮在用户验收中追加了 **折叠连线（几何 getter 化）** 与
> **伏笔账本（seedFor 关联+账本面板+详情下拉）** 两块业务/UI 对齐。仍是增量、向后兼容、tsc+build 双绿后打包。
> （用户点名的另一处“工坊（对应官方 Studio/地图试玩形态）”差异暂未动，如需继续按既定口径另开会话跟进。）

## 八、界面/交互三轮调整（用户验收追加，最后一批）
> 用户随后提出三项界面调整：**①去掉“项目”两字 ②修复项目下拉菜单位置 ③把“外观设置”完整收进设置里**。
**① 顶栏「🗂 项目 ▾」按钮不再显示“项目”二字** —— `src/components/TopBar.tsx`：按钮文案由 `🗂 项目 ▾` 精简为仅图标 `🗂`；
悬停 title 仍保留“项目菜单：新建/关闭/删除/设置”完整提示，可点性不改。
**② 项目下拉菜单位置与按钮不匹配 → 修复** —— 根因：`.project-menu`（CSS `position:absolute; right:0; top:calc(100%+6px)`）
与 TSX 内联 `position:fixed`+基于 `window.innerWidth` 的右对齐两套定位体系冲突（portal 到 body 后 CSS `right:0`
相对 body、内联 fixed 又覆盖；窄屏 innerWidth≠布局视口时横向跑偏）。改为以**按钮实际左下角**为锚点
（`getBoundingClientRect()` 取 `r.left/r.bottom`）左对齐向下弹出，`top:+6`、`left:clamp(6, r.left, vw-218)` 钳制防溢出，
内联加 `right:auto; transform-origin:top left` 覆盖 CSS 侧——任何屏宽下都紧贴按钮对齐。
**③ “外观设置”完整收进 设置 → 🎨 外观** —— 原先外观段把“深色主题(checkbox)+画布网格+昵称(协同身份)+屏幕方向(安卓端)”
无差别混排。现重组为**纯外观分区**：
- **主题模式**由原二态 checkbox 升级为三选（`☀️亮色 / 🌙深色 / 🖥️跟随系统`）；
  - `src/types.ts`：`AppSettings.theme` 由 `'light'|'dark'` 扩展为 `'light'|'dark'|'system'`（旧数据无感，向后兼容）；
  - `src/App.tsx`：主题应用 effect 把 `system` 运行时解析为实际亮/暗（`prefers-color-scheme`），
    并挂 `change` 监听在系统深/浅切换时即时联动；`data-theme` 始终写入已解析的亮或暗，原生状态栏逻辑同步跟随。
- **画布网格、屏幕方向（安卓端观感）** 继续如实保留在外观下；
- **昵称**（协同身份）从外观挪到其归属处 **`🌐 局域网协同`** 分区（在服务器地址上方）——不再混在外观里。
**验证**：`npx tsc --noEmit`=0 错；`vite build` 全绿；`127.0.0.1:5176` dev 实时转换（root/Modals 均 200）效果可即看。

## 九、验证记录（本最后一批）
| 验证项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 ✅ |
| `vite build` | 全绿（229 模块，~3.0s）✅ |
| `127.0.0.1:5176` | root=200、Modals 模块转换 200（HMR 即时预览生效） ✅ |
| 改动落点 | `src/components/TopBar.tsx`（去字+菜单锚定）、`src/types.ts`（theme 加 system）、`src/App.tsx`（system 解析联动）、`src/components/Modals.tsx`（外观分区重组+昵称归协同） |
|> 本轮为纯界面/交互归拢，不改存储/schema 之外架构，完成后连同前两轮一起整包交付。

## 十、把「护眼主题」从悬浮面板并入「设置 → 外观」（用户验收追加）
> 用户预览时指出：画布上弹出的「护眼主题」浮窗（默认/豆沙绿/米白/暖夜/墨蓝）应改到「设置」里，不要悬浮在画布/顶栏右侧。
**背景**：该「护眼主题」此前是 `public/theme-overrides.js` 注入的一个独立悬浮「🎨」按钮 + `cz-theme-pop` 弹层，
独立用 `localStorage['cz-theme']` 存值、`data-cztheme` 属性驱动配色（CSS 在 `public/theme-overrides.css` 的
`[data-cztheme="green/paper/warm/ink"]`）。它与 React 应用设置彼此独立、游离于设置体系外。
**改动（并入 AppSettings，彻底收进设置面板）**：
- `src/types.ts`：新增 `EyeTheme = ''|'green'|'paper'|'warm'|'ink'`，`AppSettings` 新增 `czTheme?: EyeTheme`。
- `src/store/persistence.ts`：`DEFAULT_SETTINGS.czTheme=''`；`loadSettings()` 兼容迁移——若新设置里没有 `czTheme`，
  则读取旧版 `localStorage['cz-theme']` 一次性并入（老用户护眼主题不丢）。
- `src/App.tsx`：新增 effect 监听 `settings.czTheme`，向 `<html>` 写入/移除 `data-cztheme`（沿用原配色 CSS，观感不变）。
- `src/components/Modals.tsx`：设置 →「🎨 外观」新增「护眼主题（观感预设）」色板选择器（含 默认/豆沙绿/米白/暖夜/墨蓝
  五个色块），点击即 `updateSettings({czTheme})`，与主题模式/画布网格/屏幕方向同在一个纯外观分区。
- `src/styles.css`：新增 `.cz-theme-picker/.cz-theme-pick/.cz-theme-swatch` 选择器样式。
- `public/theme-overrides.js`：**移除**原悬浮 🎨 按钮注入与 `cz-theme-pop` 弹层逻辑（不再在顶栏/画布侧浮出），
  不再自设 `data-cztheme`（交给 React 设置驱动）；保留图片缩放等其余交互守卫；`public/theme-overrides.css` 的
  `data-cztheme` 配色不变。
**验证**：`npx tsc --noEmit`=0；`vite build` 全绿；`127.0.0.1:5176` 各模块转换 200，设置面板即可看到「护眼主题」。

## 十一、验证记录（本批）
| 验证项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 ✅ |
| `vite build` | 全绿（229 模块，~3.5s）✅ |
| `127.0.0.1:5176` | root/Modals/App/theme-overrides 均 200 ✅ |
| 改动落点 | `src/types.ts`、`src/store/persistence.ts`、`src/App.tsx`、`src/components/Modals.tsx`、`src/styles.css`、`public/theme-overrides.js` |
| 悬浮 🎨 按钮/弹层 | 已移除（`public/theme-overrides.js`），护眼主题改由「设置 → 🎨 外观」色板驱动 ✅ |




## 十二、「日志」统一收敛为设置内一个「够用不炫技」的简版（方案 B 终稿）
> 用户指示：「日志合并到设置的日志里」；并在我给设置内嵌了带筛选条/模块/等级开关/错误码的“全功能查看器”后，
> 明确否掉了：「感觉就一开始那样就好，这种合并后的看不懂」→ 敲定**方案 B**：设置里只留一个够用、不加控件的简版。
**改动（终稿：直接文本日志 + 四个按钮，撤销炫技式内嵌）**：
- `src/components/Modals.tsx` 设置 →「📋 日志」：恢复原本**轻量形态**——仅 `🔄 刷新 / 📋 复制 / ⬇ 导出 / 🗑 清空`
  四个按钮 + 一个 `<pre className="log-view">` 原文框（空时显示“暂无日志”），不铺筛选下拉、不显示等级/模块/错误码。
- `src/components/Modals.tsx`：为上述简版在 SettingsModal 内自持有轻量状态与工具函数（`logs/setLogs/refreshLogs/
  formatLogs/copyLogs/exportLogs`，util 回引入 `getLogs/clearLogs`），与本机日志读写逻辑一致。
- `src/components/LogPanel.tsx`（曾为带完整筛选的独立查看器）：**已整文件删除**——它正是“看不懂”的那套卡片式高级界面，
  不再有任何入口指向它，删之以免残留难读控件。
- `src/styles.css`：移除上一轮为内嵌 LogPanelInline 临时加的 `.log-kpi` 与 `.cz-settings-log` 规则。
**结果**：日志只在「设置 → 📋 日志」一处；打开即是“状态原文 + 复制/导出/清空”，简单直白、使用者一眼能读懂。

## 十三、护眼主题选择器布局优化（紧凑颜色圆点行）
> 用户指示：「主题的那个布局优化一下」。上一轮刚并入设置的「护眼主题」是五个**竖排大卡片**（外框 + 三色小条 +
> 长名称，`min-width:118px` 卡片横向换行），明显偏高、占位笨重。
**改动（改成一按即选的紧凑圆形色板行）**：
- `src/components/Modals.tsx`：「🎨 外观 → 护眼主题」由 5 张竖排 `cz-theme-pick` 卡片，改为一行**紧凑圆形色板**
  `eyetheme-opt`（34px 圆形、内嵌 双色渐变 `eyetheme-dot`，`role=radio`）；标签一行同时显示当前选中项名称
  `eyetheme-cur`（如「暖夜 · 低刺激」），未占用纵向空间、排版更清晰。
- `src/styles.css`：删除旧 `.cz-theme-picker/.cz-theme-pick/.cz-theme-swatch`，新增 `.eyetheme-fld/.fld-row-h/.fld-lbl/
  .eyetheme-cur/.eyetheme-picker/.eyetheme-opt/.eyetheme-dot`（选中项高亮描边 + 悬停微放大）。
**效果**：外观区纵向占用明显下降，5 个观感预设单行选择、当前项名称随选高亮。

## 十四、验证记录（本批终稿）
| 验证项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 ✅ |
| `vite build` | 全绿（229 模块，~3.3s）✅ |
| `127.0.0.1:5176` | 运行中，HMR 热更生效（HTTP 200）✅ |
| 日志 | 「设置 → 📋 日志」恢复为简版（刷新/复制/导出/清空 + 原文框）；复杂 LogPanel.tsx 已删、无入口 ✅ |
| 护眼主题 | 「🎨 外观」改为紧凑圆形色板 + 当前项名称高亮（`.eyetheme-*`）✅ |
| 改动落点 | `src/components/Modals.tsx`、`src/components/TopBar.tsx`、`src/styles.css`、`交付说明-FIXES.md`；删除 `src/components/LogPanel.tsx` |

> **补充（方案 i 实时化）**：用户反馈设置里日志“不更新”，并提到想要类似 ComfyUI 的实时感。已在简版基础上加**自动刷新**：
> 设置在开时用 `setInterval` 每 1s 重读一次 `getLogs()`，仅在日志确有新增/变化时才更新 `logs`（避免无意义重渲），
> 并让 `<pre>` 在有新日志时自动滚动到最底部跟随最新一行（`logEntries` 为按时间追加，最新在末尾），
> 无需再手动点“🔄 刷新”。改动在 `src/components/Modals.tsx` 的 SettingsModal。

---

## 十五、日志「两用视图：排查 / 实时」（方案 C，用户验收追加）

> 用户反馈：即便加了实时刷新，点开设置日志，看到的仍只是
> `[INFO] [store] openProject {...}` 这类 INFO 消息，**看不出“有没有出错、错在哪”。**
> 用户原话：“日志就这？这怎么排查错误。” → 在方案 B（简版 + 实时化）基础上改进为**两用视图**：

**核心设计（既保留 ComfyUI 式实时原文，又提供问题导向的排查视图）**：
- 设置 →「📋 日志」顶部按钮行（🔄 刷新 / 📋 复制 / ⬇ 导出 / 🗑 清空）之下，新增一行 `.log-sum`：
  - 左侧 `.log-vtabs` 分段页签：`🔍 排查`（默认激活）/ `🖥 实时`，二选一即可切换。
  - 右侧 `.log-count` 状态徽标：`✗ 错误 N`（有则红 `count-bad.err`，否则灰 `count-ok`）、
    `⚠ 警告 N`（有则橙 `count-bad.warn`，否则灰）、`共 N 条`（灰字）。**一眼看出是否健康。**

**🔍 排查（diag）视图**（顶部 `.diag-lv` 过滤胶囊：✗ 错误 / ⚠ 警告，红 / 橙各自高亮）：
- 过滤后无问题 → 绿色提示 `✅ 当前没有错误/警告，运行正常。`
- 有问题 → `.diag-list`（可滚动，max-height 260px）列出逐条 `.diag-item`：
  - 行内 `.diag-med` = 错误码（如 `E_store_001`），无错误码的 error 显示 `ERR`、warn 显示 `WARN`；
  - `.diag-msg` = 消息正文、`.diag-src` = 来源模块（超长省略号截断）、`.diag-chev` 折叠箭头；
  - **点某行展开**：`.diag-detail`（提示“错误码 · 也可用于本页搜索定位”）与 `.diag-stack`（黑色终端风 `<pre>`，
    深色 rgba(10,10,20,.85) 底 + 浅色等宽字，显示 message + stack + data，max-height 180px 可滚动），方便直接复制给维护者。
- 底部 `.diag-tip`：明示“日志只在设备本地、不上传/不收集；点开某条看细节，或 📋 复制整份发给维护者。”

**🖥 实时（live）视图**：维持既有简版原文框 `<pre className="log-view" ref={preRef}>`，开设置后每 1s 自动刷新、
新日志自动滚底跟随（沿用方案 i 的 setInterval + 签名比对 + scrollTop 滚底）。

**改动落点**：
- `src/components/Modals.tsx`（SettingsModal）：新增 state `logView='diag'|'live'`、`lv='error'|'warn'`、`openRow:string|null`；
  派生 `errN/warnN`（按 logs.level 计数）与 `problems=logs.filter(l.level===lv).slice().reverse()`（最新在前）；渲染 `log-sum / diag-* / live` 条件区块。
- `src/styles.css` 末尾新增约 23 条样式：`.log-sum/.log-vtabs/.log-count/.count-bad/.count-ok/.diag-panel/.diag-filter/.diag-lv/.diag-empty/.diag-list/.diag-item/.diag-row/.diag-med/.diag-msg/.diag-src/.diag-chev/.diag-detail/.diag-stack/.diag-tip/.count-info`。

**验收口径**：打开「设置 → 📋 日志」默认停在「🔍 排查」，把错误/警告各以红/橙标出来、可筛、可点开看堆栈，还能 📋 复制整份发给维护者；
切「🖥 实时」则回到逐行往上滚的原文。本批 tsc = 0、`vite build` 全绿。

---

## 十六、移动端触控体验「手感统一加固」（方案 E / 触控卫生一次收口）

> 用户在既有触屏适配（≥44px 触控目标、画布手柄加大、“⋯”收起行操作、双击缩放抑制、
> safe-area/竖屏单列等）基础上，回“E”要求**对全界面再做一次系统性触控手感加固**。
> 本批不改任何交给流程/逻辑，仅追加一段 `styles.css` 触控层，命中两类设备且不影响纯键鼠布局：

**命中途径（语法安全，分两段写）**：
- **纯触屏**（手机/平板主指针触控）：`@media (pointer: coarse)`。
- **触屏笔记本/触摸平板**（指针是鼠标但也支持触控）：沿用 App 在根元素打的 `.touch-capable`
  标记（`App.tsx` 按 `navigator.maxTouchPoints>0` 或首次 touch 事件加上），以 `.touch-capable` 后代选择命中，
  不影响纯键鼠桌面。

**加固内容（四件事）**：
1. **阻隔长按系统行为**：对工具栏/侧栏标签/菜单/浮层/列表行/卡片顶栏/行操作键等“操作面”
   统一 `user-select:none` + `-webkit-touch-callout:none` + 透明 `tap-highlight`，
   避免 iOS 长按弹放大镜/删除菜单、图片长按菜单误触。富文本正文、编辑器、输入框/文本域/下拉
   仍保留 `user-select:text`（可长按选词/正常输入）。
2. **统一按压回馈**：触屏无 hover，把 tb-btn/tool-btn/btn/vt-btn/zc-fab/sb-tabs/ctx-menu/
   project-menu/layer-toolbar/行内操作钮(.sec/.page/.outline-actions)/wm-item/.row-more/.ai-agent/
   .ai-mini-quick/.ai-msg-copy/.ai-his-ops/.cal-chip/.diag-row 等 :active 统一为 **轻缩 0.96 + 变暗**（0.07s），
   防止“点下去没反应”，与既有 danger 按钮下沉反馈风格一致。
3. **补足可点区**：纯手机(coarse)下把 `.sec-actions/.page-actions/.outline-actions/.wm-item-actions` 里的行内小钮、
   `.modal-x/.card-collapse-btn/.row-more/.ai-msg-copy/.ai-his-ops/.ai-mini-quick` 补到 **约 30–32px 圆形可点区**
   （`inline-flex` 居中），并给 `.diag-row/.cal-chip` 增一点可点高；密集网格（日历周格/调色板色块等）刻意不改，避免挤爆。
4. **清理触屏常驻 hover 干扰**：触感设备没有 hover，把行内操作项盖成不“卡亮”（opacity 收敛 + 由 :active 顶起反馈）。

**改动落点**：仅 `src/styles.css` 末尾追加约 120 行（含头注释说明命中途径），无 TS/逻辑改动。
**验收口径**：tsc = 0、`vite build` 全绿；预览 127.0.0.1:5176 在手机/触屏宽度下：
工具栏图标与行内“⋯/复制/关闭/删除”点按有明显下沉反馈、不再长按弹放大镜、触控目标更易命中；
键鼠桌面（纯 pointer:fine 且无触控）不受影响。若浏览器无法模拟触控，可在开发者工具开“设备仿真”或以触屏笔记本实测。

---


## 十七、卡片「所见图标语义」：👁眼睛=预览(能拖/正文不滑)，📖书=浏览(不能拖/正文可滑)

> 修正口径（用户 0908 明确）：此前的“预览/浏览”概念反了。以**卡片右上角当前显示哪个图标**来定，二者是同一开关的两种状态：
> - **👁 眼睛**（普通画布态，内部 `card.preview=false`）＝「**预览**」：卡身**可拖动**；**正文不能在卡内纵向滑动**（长文只显到卡下沿，避免“滚字抢拖卡”的手势冲突；要看更多就放大卡或切到浏览态）。
> - **📖 书**（排版只读态，内部 `card.preview=true`，class `.preview-mode`）＝「**浏览**」：像成品阅读——**卡片不可拖动**；**正文可卡内滚动**看长文；也**允许双击进全屏**读。

**改动**：
- `src/styles.css`：把之前那段（错标成向浏览只读/书态屏蔽滚动）**整段删掉**，改成仅命中“普通预览态的直接正文”把它**不内滚**：
  `.card .card-face-note > .rich-static { overflow:hidden; touch-action:none; }`
  （`card-face-note` 的**直接** `.rich-static` 才是👁眼睛/预览的正文；📖浏览排版态包在 `.card-preview-body` 内、外层本身可滚，不受此影响。）
- `src/components/CanvasBoard.tsx`：移动判定把「📖浏览/排版只读」卡（`card.preview=true`）排除出可拖动集合——
  `ids = ids.filter(id => cards[id] && !cards[id].locked && !cards[id].preview)`；仍可选中、可双击进全屏（双击路径在 CardView 的预览分支另有处理并保留）。

**改动落点**：`src/styles.css`（新增 1 条直接子级命中）、`src/components/CanvasBoard.tsx`（拖卡过滤）。
**验收口径**：tsc = 0、`vite build` 全绿；预览 127.0.0.1:5176 画布上：
- 卡片当前右上角是 **👁**（预览）时，点正文可整卡拖动，正文不再出现卡内上下滚；
- 点卡片右上角切成 **📖**（浏览）后，卡身拖不动（可选中），长文可上下滚动看，双击进全屏；
- 再点回 👁 即可恢复拖动。锁定卡行为不变。

**【补·👁预览态正文自动软换行】**（用户 0908 追加：预览模式自动换行）
因👁预览正文在 `.card-face-note > .rich-static` 上 `overflow:hidden` + `touch-action:none`，且正文**不产生卡内滚动**，
长**连续字符串**（如 URL、无空格的超长英文、长数字/路径）默认不换行会横向溢出卡宽、被裁切且永远看不到。
故在该预览态规则上补三件软化（`overflow-wrap:anywhere; word-break:break-word; white-space:normal;`），
让这类长串在**串内任意处断行以贴住卡宽**，普通中文/带空格段落照常按词/字软换行，两者互不影响；
仅改动这条直接子级规则（关键特殊性 0,3,0 不变），📖浏览排版态 `.card-preview-body` 与编辑态均不受影响。
**改动落点**：`src/styles.css` 第 705 行 `.card .card-face-note > .rich-static` 由 1 行展开为多行并新增上述换行属性（仅 CSS，无 TS 改动）。
**验收口径**：tsc = 0、`vite build` 全绿；预览 127.0.0.1:5176 在👁（预览）态卡片里贴入一段含长 URL / 超长英文词 / 长数字的正文，
把卡宽拉到略窄后：长串会在卡宽边缘自动折断换行、不再从右侧溢出被裁；普通中文整段排版与换行不受影响；📖浏览态与编辑态外观不变。

---
## 十八、放大/滚轮缩放去闪（eliminate zoom flicker）
> 反馈：画布放大/缩放时内容会闪（放大闪烁）。两处主要成因并分别处理：
> **成因 1（手感/渲染抖动）**：画布滚轮缩放原来在每个原生 `wheel` 事件里**同步直接 `setViewport`**。高精度触控板 / 高速滚轮一帧内会派发多条 wheel，
> 导致同一帧内 React 把整板（所有卡片/连线/标注）**重复重渲多次**，形成肉眼可见的闪跳/卡顿。
> **成因 2（视觉闪跳）**：缩放以鼠标位置为锚时，光标扫过卡片边界会连续触发每张卡 `:hover` 的 `translateY(-2px)` 抬升 + 0.13s 过渡，
> 卡片“浮起↔落下”反复；且每张卡的 `.card-flip` 都带 3D 翻转上下文（`perspective` + `preserve-3d` + `backface-visibility`），
> 在父级 `scale(zoom)` 逐帧变化时让 GPU 反复重建 3D 层，进一步加剧闪动。
**改动**：
- `src/components/CanvasBoard.tsx`：
  - 新增滚轮 rAF 合帧缓冲（`wheelBuf`/`wheelFrame`/`wheelSettle` + `flushWheelBuf`）：同一帧内多条 wheel 先累计缩放系数/平移量，
    **帧末只 requestAnimationFrame 提交一次 viewport**；横向平移按累计 dx 一次性应用。滚动窗口期在 `<body>` 挂 `.cs-zooming`（约 110ms 后移除）。
  - onWheel 改为缓冲提交；effect 卸载时清理 raf/timeout 并移除 `.cs-zooming`。
- `src/styles.css`：新增 `.cs-zooming` 去闪块——窗口期暂停卡片 hover 抬升/描边过渡、把 `.card-flip` 3D 上下文退化为 2D
  （`transform-style:flat` + 关 `backface-hidden`），缩放停止即恢复（静态卡面在 rotateY(0) 平面视觉无差）。
**改动落点**：`src/components/CanvasBoard.tsx`（滚轮合帧 + 缩放窗口标记）、`src/styles.css`（`.cs-zooming` 去闪块）。无其它组件/逻辑改动。
**验收口径**：tsc = 0、`vite build` 全绿；预览 127.0.0.1:5176 用触控板双指/高速滚轮在画布上缩放：
整板缩放跟手不再一下一下跳闪，光标经过卡片边缘时卡片也不再“浮起↔落下”闪；离散鼠标滚轮（逐档、高频低）手感与原一致。

**【补·覆盖拖动与捏合】**（用户复测：放大和拖动仍闪 → 扩展统一手势去闪）
首版去闪只挂滚轮的 110ms 窗口。复测后把 `.cs-zooming` 去闪改为**统一去闪开关 `gestureOn()`**，在**所有会持续移动画布/卡片的入口都悬挂该标记**，
停手约 160ms 才移除，从而把去闪覆盖到拖动：
- 抽取 `bodyCls` + `gestureOn/Release/Clear/T` 面板：挂/延后移除 body 类；
- 滚轮：`onWheel` 每事件 `gestureOn()`，`flushWheelBuf()`（rAF 帧末提交）后也 `gestureOn()`；
- **拖动/平移/拖卡/改尺寸**：`attachDrag.move` 中 `pan/cards/resize` 态每 move `gestureOn()`（鼠标与触屏走同一 `attachDrag`，一并覆盖）；
- **触控捏合缩放/双指平移**：pinch else 分支每帧 `gestureOn()`。
被抑制的正是拖动时“卡片在光标下滑过界 → hover 抬升反复播放”，以及 3D 层逐帧重建的闪。
**改动落点（补）**：`src/components/CanvasBoard.tsx`（抽 `gestureOn` 统一开关，并在 wheel/attachDrag/pinch 处调用；移除旧 110ms 定时器）。CSS `.cs-zooming` 规则不变。
**验收口径（补）**：tsc = 0、`vite build` 全绿；预览画布上：①滚轮/触控板缩放不再跳闪；②按住拖动画布平移（含画布内容滑过光标）时卡片不再闪；③拖动一张卡 / 改尺寸 / 触屏捏合时同样不再闪。

**【重要修正·撤销会“跳出图片卡”的 3D 压平规则】**（用户复测：放大卡片时闪，并跳出图片卡画面）
查明放大/拖动持续闪且偶发“跳出图片卡”的真实元凶 = 上版我在 `.cs-zooming` 里加的**3D 压平规则**：
```
body.cs-zooming .card-flip { transform-style: flat !important; perspective: none !important; }
body.cs-zooming .card-face { backface-visibility: visible !important; ... }
```
卡片是“一卡两面”翻转：正面=文字面，反面=图片面，`.card-flip` 需 `preserve-3d` 且 `.card-face` 需 `backface-visibility:hidden` 才能把**反面的图片面始终藏在 rotateY(180) 不穿帮**。
而我又把 3D 上下文压平 + 背面对外可见——只要 `.cs-zooming` 一挂（缩放/拖动/放大卡片期间），**每张都叠在正下方的图片面就穿帮露出来/闪一下**，看起来正是“放大时跳出图片卡”。
**处理**：把这组 3D 压平规则**整段删除**，`.cs-zooming` 只保留无害的“暂停卡片 hover 抬升过渡”。这样既不闪、又不破坏翻转几何，图片面不会再穿帮。
**改动落点**：`src/styles.css`（`.cs-zooming` 块仅保留 hover 过渡抑制，注释写明勿动 `preserve-3d/backface`）。CanvasBoard 的 `gestureOn` 调用不变。
**验收口径（修正后）**：tsc = 0、`vite build` 全绿；预览画布上放大某张卡 / 画布缩放 / 拖动：不再闪、也不再冒出图片面；图片卡的日常正反翻转仍正常。

**【内容变多变闪·合成层策略尝试与回退】**（用户复测：改成手势门控后“闪得更厉害了”）
上一版把 `.canvas-cards`
常驻 `will-change: transform`（整块巨层）临时改成**手势门控**——平时 `will-change:auto`、
仅当 `.cs-zooming` 手势窗口内 `translateZ(0)` 提升。**用户复测结果：反而更闪**。
**为何退步**：手势每帧“进窗口才提升→停手释放”，整块巨层在手势中被反复**临时提升→释放**，
每次升降都触发一次整层重新分类/重栅格，放大/拖动期间等于额外引入了成串闪点；且 .cs-zooming 本身在缩放/拖动全程挂着。
**处理（回退）**：撤销该门控试验，`.canvas-cards/.edges-svg/.annotations-layer svg` 恢复**常驻**
`will-change: transform`（画布层稳定合成一次，不在手势中反复升降层）；`.cs-zooming` 只保留“暂停卡片 hover 过渡”项。
**改动落点**：`src/styles.css` 4333 段恢复常驻 will-change（去掉 body.cs-zooming 门控与 translateZ）。无 TS 改动。
**结论**：画布整层在手势中“临时提升/释放”会引起更重的闪，故不在该层做门控；后续若仍闪，需按闪的**精确形态**
（整屏闪白/整板刷新 / 文字或卡片轮廓抖动模糊 / 仅在接近整倍率或放大某张卡时 / 图片底纹呼吸）分到具体某一层（culling = 复用了裁剪的卡片被反复进出渲染、卡片内文字重排、或 svg 连线重几何）再定点修，避免整层级的猜测。

**【内容增多“卡片变透明”·整板巨纹理假设（当前试探）】**（用户：内容一多 ≥20% 就闪，卡片会变透明）
新线索＝不是单纯抖闪，而是**卡片整张变透明/内容消失**（负载相关：内容一过约 20% 就出现）。
根因假设：`.canvas-cards` 内心是上百张独立卡片+各自 3D 翻转层（`.card-flip` preserve-3d / `.card-face` backface），
若把这整块 DOM **常驻 will-change 强合成成一个巨大纹理**，内容一多、缩放/拖动逐帧重建时更易被浏览器因
合成/显存压力**丢表面 → 卡片纹理丢失渲染成透明**（与“内容越多越明显”吻合）。
**处理（本轮试探，无门控、不碰 3D 翻转几何）**：仅把 `.canvas-cards` 的 will-change 改为 `auto`（=默认，不再强制
成单一大纹理，交给浏览器做 2D 平铺+区域重绘，减少整板纹理/面数压力）；`.edges-svg / .annotations-layer svg`
仍保留 will-change（薄矢量层无害）。**不用** .cs-zooming 门控，也不改 `.card-flip/.card-face` 的 3D/backface。
**注意与上版“更闪”门控的区别**：上版会“手势中反复提升/释放层”造成抖动；本版 canvas-cards 全程无 will-change，
不升降层，只为观测“去掉整板巨纹理”是否止住卡片变透明。
**验收口径**：tsc = 0、`vite build` 全绿；预览内容较多（≥20%）的画布上缩放/拖动/放大，观察是否仍出现“卡片整张变透明”。
请如实反馈：透明是**文字卡也会**还是**仅图片卡**；是**动态中瞬间消失又回来**还是**停下仍透明**（决定是 3D/backface 故障
还是合成纹理丢失），据此再定下一处，避免继续整层级盲改。

**【进度确认 + 图片编辑大图原生缩放锁死·修复】**（用户：文字卡不闪了；图片卡“双指成图片内容放大、缩不回、画布不能动、地图无用”）
- **文字卡已确认稳定**：去掉 `.canvas-cards` 整板巨纹理(`will-change:auto`)后，用户在 ≥20% 内容的画布上缩放/拖动，**文字卡不再闪/透明**。此改动保留。
- **图片卡新症状定位**：不是“某张图在画布上书卡里被放大”，而是**双击/连击图片卡会进入全屏「🖼 图片编辑」覆盖层**
  （`.fullscreen-editor`，`position:fixed; inset:0; z-index:20000`，整层盖住画布）。覆盖层一开，底层画布的拖动/捏合/右下角
  缩放、MiniMap/地图自然全部被遮→“画布不能动、地图按钮无用”。而该覆盖层里那张很大的 `<img>`(`.image-edit-preview img`，
  object-fit:contain) **没禁浏览器原生双指/双击页级缩放**，一旦被原生放大即锁死 → 观感“只有图片被放大且缩不回”。
- **处理（本轮）**：给 `.image-edit-preview` 及其 `img` 加 `touch-action:none; user-select:none; -webkit-user-drag:none`，
  关掉该大图上的浏览器原生页级缩放，图片无法再被原生放大锁死。**不改**画布缩放/`.card-flip` 3D，不动 .cs-zooming。
- **改动落点**：`src/styles.css`（`.image-edit-preview` 块 + img 子规则；修正横屏 media 块括号）。无 TS 改动。
- **已在覆盖层内的退回方式**：顶部「⬇ 收起」按钮，设备返回/Esc 也能退回画布（App/CanvasBoard 的 Esc 已接 setFullscreenCard(null)）。
- **验收口径**：tsc = 0、`vite build` 全绿；在图片编辑全屏里对那张大图做双指/双击不再把图原生放大锁死，能正常用「⬇收起/Esc」回到画布。
- **待你确认**：若你实际看到的是带“🖼 图片编辑 / ⬇ 收起”的**整屏**（说明进了全屏编辑 = 本修复目标）；若你是**在板面上**、那角落图变大，则请告诉我是不是 **双击** 蹦出来的整屏，据此再收敛。

**【点 1:1/缩放按钮“乱跳看不到卡片”·视口安全护栏（sanitizeViewport）】**（用户：**与🔒无关，点 1:1 等直接乱跳都看不到卡片了**）
- **诊断**：用户否定了“🔒锁定缩放”与“全屏编辑覆盖层”两条假设。核对 `zoomBy`/`computeZoomAnchor`/`pinch` 各锚点数学后，
  各路径内部均自洽（`zoomAtAnchor` 调 `zoomBy(factor, cx-ox, cy-oy)` 已把 `ox` 减去；pinch 路径也正确减 `ox`）。
  于是判断“点 1:1 直接乱跳看不到卡片”的成因：**某条路径已把 `viewport.x/y` 污染成巨大值（或 NaN）**，
  而右下角 **1:1 按钮**用 `setViewport({...vpRef.current, zoom:1})` **保留被污染的 x/y** → 一按就跳到空白区、看不到任何卡片。
- **处理（store.ts）**：新增 `sanitizeViewport(vp, cards, fallbackZoom?)` 护栏函数并**接入所有写 viewport 的路径**：
  - `sanitizeViewport`：zoom 取有限正值否则回退（NaN/Infinity→fallback 或 1）；x/y 非有限回退 0，并钳制到
    `bound = max(100000, span × max(zoom,1) × 200)`（span 为卡片世界坐标跨度，日场平移远小于此，只拦“甩飞/NaN/空白”）。
  - **接入**：`setViewport` 改为 `set({viewport: sanitizeViewport(vp, get().cards, vp.zoom)})`；
    `zoomBy` 的目标 viewport 也经 `sanitizeViewport(..., get().cards, zoom)` 写入。
- **改动落点**：`src/store.ts`（58-67 行新增 `sanitizeViewport`；`setViewport`/`zoomBy` 均经由它写 viewport）。无 CSS 改动。
- **为什么不再继续猜**：多轮假设（全屏覆盖层、zoomLocked、CSS 锁/门控）均被用户与代码否决。此护栏**不依赖猜测具体污染路径**，
  只做兜底——任何一条路径把视口算飞/算 NaN，都会在写入前一瞬被钳回有限且量级合理的坐标，从而避免“点 1:1/缩放就跳空”。
- **验收口径**：tsc = 0、`vite build` 全绿；在已出现“异常大/已放大过”的画布上反复点 1:1 / − / + / ⛶适配 及滚轮、双指缩放，
  观察视口不再**跳到看不见任何卡片的空白区**（若仍有乱跳，需再精确定位是哪条路径污染了 viewport.x/y —— 疑似某路径把坐标放大，
  1:1 保留污染值所致）。

**【切换🔒后出现缩放/手势异常·锁定状态闭包修复（zoomLockedRef）】**（用户：**切换🔒后开始出现缩放或手势问题**）
- **定位**：`zoomLocked` 是组件本地 `useState`。但滚轮缩放绑定的 `onWheel`/`flushWheelBuf` 所在 `useEffect` **依赖数组为空**
  （只绑定一次），其中调用的 `zoomAtAnchor` 闭包捕获的是**首次渲染**时的 `zoomLocked`（恒为初始 `false`）。
  于是**切换🔒后，滚轮缩放仍不受锁定控制、照常生效**，与按钮 −/+/1:1（走组件最新 `zoomAtAnchor`）以及双指（走最新 `!zoomLocked`）
  的锁定行为**不一致** → 表现为“切换🔒后缩放/手势异常”。
- **处理（CanvasBoard.tsx）**：新增 `zoomLockedRef`（useRef，渲染时 `zoomLockedRef.current = zoomLocked` 同步），
  并把 `zoomAtAnchor` 里的 `if (zoomLocked) return;` 改为 `if (zoomLockedRef.current) return;`。
  这样即便 wheel 的 `useEffect` 只绑定一次、闭包捕获了旧的 `zoomAtAnchor`，该函数内部读 ref 也能拿到**最新锁定状态**，
  使滚轮锁定与按钮/双指行为一致。双指路径的 `!zoomLocked` 走组件最新闭包，无需改动。
- **改动落点**：`src/components/CanvasBoard.tsx`（新增 `zoomLockedRef`；`zoomAtAnchor` 改读 `zoomLockedRef.current`）。
- **验收口径**：tsc = 0、`vite build` 全绿；切换到 🔒 锁定后，滚轮缩放**不再生效**（与 −/+/1:1/双指一致被锁定），
  解锁后恢复正常缩放；无“锁定后滚轮仍缩放/手势行为不一”的异常。


---

## 旧「工坊」移除 + 新「🧪 娱乐场 · Playground」（2026-09）

产品方向调整：把原「正经专业工具气质」的旧工坊（Novel/RPG/Gal/Film 多形态二级世界、产不了成稿却端着一整套界面）整体移除，
换成一个**拿画布现有卡片当素材、做低门槛二次开发/脑洞实验的游乐场**。

### A. 旧工坊彻底移除（数据层 + UI + 类型，tsc 全绿无残留）
- **删目录**：`src/workshop/`（6 文件：NovelBoard/RpgBoard/GalBoard/FilmBoard/Workshop/shared）。
- **UI 入口清干净**：`Modals.tsx` 移除 workshop 的 lazy import 与 `modal==='workshop'` 渲染分支；`TopBar.tsx` 移除菜单项与工具栏「🛠 工坊」按钮。
- **数据层瘦身**：`persistence.ts` 移除 import/`EMPTY_WORKSHOP` 常量/load/save 里的 workshop 读写；
  `store.ts` 移除 `workshop` 状态字段、`setWorkshop`/`msSaveSlot` action、以及 6 处初始化/迁移/返回里的 workshop；
  `types.ts` 用脚本把从「工坊（第 7 章）」注释起整块 14 个类型（WorkshopData/RpgScript/GalPlayState/FilmSceneBoard…）一次性截除。
- 全库 `grep` 无 `workshop/WorkshopData/msSaveSlot/setWorkshop/RpgSaveSlot/EMPTY_WORKSHOP` 任何残留；`styles.css` 的死规则 `.ws-*/.workshop-modal`
  也已逐行清理干净（大括号计数 2384=2384 保持平衡）。tsc = 0、`vite build` 全绿。

### B. 新「🧪 娱乐场 · Playground」——一个独立、轻薄、自包含的新板块
- **定位**：不复刻旧工坊的“专业/成稿”气质，而是纯**拿素材玩**——把画布卡片当积木，发散发散、想留才留、可一键丢回画布。
- **三个玩法 tab（同一轻实验层）**：
  1. **碰撞台 Mix**：勾 ≥2 张画布卡片 → 启发式“碰撞”生成剧情脑洞（A 撞上 B / 谁在搅局 / 可留伏笔 等句式）。
  2. **换皮预览 Skin**：把勾选素材同一坨设定渲染成 **RPG 旁白 / GAL 选项 / 分镜脚本** 三种容器预览，看值不值得往玩法上追。
  3. **点子骰子 Dice**：随机抽画布 1~2 个设定 + 随机「如果…会怎样」抛灵感（含偶尔带上一张图卡标题）；纯抛火种、不想写就不算掷中。
- **素材来源**：全部实时读 `useStudio(s=>s.cards)` 现成卡片，左侧一栏点选；绝不动画布/正文任何正式数据结构。
- **另存为画布便签**：每块结果有「💾 另存为画布便签」，用 `textToDoc` 转 TipTap 文档后经 `store.addCard` 落一张 note 卡
  （标题冲突自动加 `•副本N`），丢回画布继续长。纯本地、不新建沉重持久化。
- **集成方式（最小侵入）**：新组件 `src/components/Playground.tsx`（342 行，自有卡片文本解析/碰撞/换皮/骰子模板 + `ModalShell` 壳）仿 `HelpModal`：
  自身读 `modal==='playground'` 才渲染，不匹配返回 null；作为**常驻组件**挂到 `App.tsx` 两条分支（欢迎页 & 主工程，与 `<HelpModal/>` 并列）。
  顶栏 `TopBar.tsx` 加 🧪 按钮 `setModal('playground')`（desktop-only，与 正文/导出 一致）。三块共用轻薄抽屉式布局（非旧工坊整屏盖画布），不挡编辑。
- **样式**：`styles.css` 尾部新增 `.pg-*` 类，全部复用现成主题变量（`--accent/--panel/--border/--text/--muted`），含窄屏纵排自适应。
- **改动落点**：新增 `src/components/Playground.tsx`；`App.tsx`（import + 两处挂载）；`TopBar.tsx`（🧪 入口）；
  `styles.css`（尾部 .pg-* + 清理旧 .ws-* 死 CSS）。
- **验收口径**：`npm run typecheck` = 0、`npx vite build` 全绿；dev(127.0.0.1:5176) HMR 已热更。
  请在一个有卡片的项目里从 🧪 进 Playground：分别玩 1 碰撞（勾2+张出脑洞）、2 换皮（三风格预览）、3 骰子（掷好几次看出不同点子），
  并点「另存为画布便签」确认回画布生成了便签卡——确认三块玩法是否贴合“拿素材玩”的 1/2/3 气质，据此再迭代。
