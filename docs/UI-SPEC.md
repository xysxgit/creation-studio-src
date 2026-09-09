# 创作助手 · UI 规范（v1）

> 目标：所有界面的视觉、排版、布局统一语言。新增/修改界面时**必须**遵循本规范。
> 变量统一在 `src/styles.css :root` 与 `public/theme-overrides.css`（主题档）中定义，业务样式一律引用变量，禁止硬编码色值/圆角/间距。

---

## 1. 色彩

| 令牌 | 用途 | 值（浅色） |
|---|---|---|
| `--accent` | 唯一强调色：主按钮/选中/焦点 | `#6c5ce7` |
| `--accent-strong` | 强调色按压/深档 | `#5a4bd1` |
| `--accent-soft` | 强调色浅底（选中背景） | `rgba(108,92,231,.12)` |
| `--accent-contrast` | 主色底上的文字/图标色 | `#fff`（暖/墨主题自动深字） |
| `--ok` `--warn` `--danger` | 语义色 | `#00b894` `#f39c12` `#d63031` |
| `--ok-soft` `--warn-soft` `--danger-soft` | 语义色浅底 | 8%~12% 透明度 |
| `--text` / `--muted` / `--border` | 文本/次级文本/边框 | 见 `:root` |
| `--bg` / `--panel` / `--panel2` | 页面/面板/面板次级 | 见 `:root` |

**规则**：状态表达只用语义色+soft 底；同一界面强调色只能出现 `--accent` 系。

## 2. 圆角（5 档）

| 令牌 | 值 | 用在哪 |
|---|---|---|
| `--radius-xs` | 4px | 小型标签、色点、徽标 |
| `--radius-sm` | 8px | 按钮、输入框、图标钮、列表行 |
| `--radius-md` | 12px | 卡片、面板、菜单（右键/下拉） |
| `--radius-lg` | 14px | 弹窗、大浮层 |
| `999px` | 胶囊 | Toast、状态徽章、胶囊按钮 |

## 3. 字号（5 档，以 `--fs` 为基座）

| 令牌 | 基准 | 用在哪 |
|---|---|---|
| `--fs-xs` | 11px | 角标、徽章、辅助说明 |
| `--fs-sm` | 12px | 默认控件、次要文本 |
| `--fs-md` | 13px | 正文强调、行标题 |
| `--fs-lg` | 14px | 面板标题、按钮主文案 |
| `--fs-title` | 16px+ | 页面/弹窗主标题（仅一级） |

## 4. 间距（4 档 + 自适应）

`--sp-1:4px` `--sp-2:8px` `--sp-3:12px` `--sp-4:16px`；
大屏布局可用变量 `--u`（`calc(var(--u) * n)`）。禁止 6/9/10/14px 等离散值新增样式。

## 5. 控件规格

| 控件 | 规格 |
|---|---|
| 按钮 `.btn` | 高 ≥34px，圆角 `--radius-sm`，内边距 `calc(var(--u)*1.6 ~ 2.7)`，主按钮 `--accent` 底 + `--accent-contrast` 字 |
| 图标按钮 `.tb-btn/.tool-btn/.cz-theme-btn` | 34×34，圆角 `--radius-sm`，hover `--panel2`，active `--accent-soft` |
| 输入框/下拉/文本域 | 高 ≥34px，圆角 `--radius-sm`，边框 `--border`，focus 光环 `--ring` |
| 列表行（分区/页面/模板/菜单项） | 高 ≥36px，圆角 `--radius-sm`，hover `--panel2`，选中 `--accent-soft` |
| 标签/徽章 | 高 20px，字号 `--fs-xs`，圆角 999px，内边距 1px 8px |

## 6. 阴影与浮层

`--shadow`（卡片/面板）、`--shadow-lg`（弹窗/菜单/浮层）。
浮层 z-index 阶梯：画布内容 < 日历(26000) < 写作(30000) < 侧栏(35000) < AI(48000) < 弹窗(50000)。

## 7. 交互态（四态统一）

- hover：背景 `--panel2` 或亮度 +5%（禁用于触屏只读元素）
- active：`scale(var(--press-scale))`（0.97）+ 底色加深；卡片/画布除外
- disabled：`opacity:.45` + 默认光标
- focus（键盘）：`box-shadow: var(--ring)`，仅 `:focus-visible`

## 8. 布局规则

- 面板头：`flex; align-items:center; gap:8px`，标题 `--fs-title` 600，副标题 `--fs-sm` `--muted`
- 按钮组：`flex; gap:8px`，主按钮靠右；同一按钮组只出现一个主按钮
- 表单：标签左对齐（144px 内自适应），控件 `flex:1`；分组用 `--panel2` 卡片化（`.modal-sec`）
- 列表：单行超过 3 个操作按钮收纳进「…」菜单；行内图标 16px
- 移动端：触控目标 ≥40px，侧栏抽屉化，底部状态栏精简

## 9. 动效

入场 `--dur-2`(200ms) `--spring-soft`；反馈 `--dur-1`(120ms) `--press`；
尊重 `prefers-reduced-motion`（降级为无位移淡出）。

## 10. 文本与图标

- 中文正文行高 1.6；数字使用 `font-variant-numeric: tabular-nums`（统计/缩放值）
- emoji 图标 16px（行内）/22px（图标钮）/40px（空态大图标）
- 空态：容器垂直居中 + 40px 图标 + 说明文字（`--fs-sm` `--muted`）

---
*执行方式：规范层落在 `public/theme-overrides.css` 末尾「UI 规范统一层 v1」，不改业务结构，仅统一令牌使用。*
