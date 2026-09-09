/**
 * annotate-headers.mjs —— 为项目所有源码文件补齐「完整文件头注释」
 * 运行：node scripts/annotate-headers.mjs
 * 规则：①已有完整 /* 块注释 → 跳过；②开头单行注释或空 → 替换/插入为本脚本定义的完整块
 * 纯注释操作，不改变任何可执行代码。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const HEADERS = {
  'src/App.tsx': `/**
 * ============ 应用根组件 App ============
 * 职责：
 *  · 无打开项目 → 渲染 Welcome（最近项目/新建/入口）
 *  · 已打开项目 → 渲染编辑器主布局（TopBar + LeftSidebar + CanvasBoard + RightPanel + StatusBar）
 * 全局副作用：主题↔系统状态栏联动、屏幕方向、安卓返回键拦截（只关应用自己的层）、
 *            打开项目后自动重连协同 + 首次帮助提示。
 * 重量级组件（AIAssistant / FullscreenEditor）懒加载。
 */`,

  'src/main.tsx': `/**
 * ============ 应用入口 ============
 * 职责：
 *  · 挂载 React 根（StrictMode + 全局 ErrorBoundary）
 *  · window 错误 / 未处理 Promise 拒绝 → 写入应用日志
 *  · 浏览器/PWA 环境注册 Service Worker（原生 WebView 跳过，避免旧缓存）
 */`,

  'src/components/SystemDialog.tsx': `/**
 * ============ 系统对话框 ============
 * 应用内 确认/输入/选择 对话框，替代浏览器原生 confirm/prompt：
 *  · 主题化外观、多按钮支持、Promise 风格 API
 *  · 导出：csConfirm（确认/取消）、csPrompt（输入）、csAlert / csChoice 等
 *  · 宿主组件 SystemDialogHost 挂在 App 根部，全局单例
 */`,

  'src/components/cardStatus.ts': `/**
 * ============ 卡片故事状态常量 ============
 * 卡片状态标签与颜色圆点定义（未开始/连载中/已完结/待修改/搁置 等），
 * 供画布卡片角标与故事日历状态标记共用。
 */`,

  'src/util.ts': `/**
 * ============ 通用工具函数集 ============
 * 纯函数 / 无 UI 依赖的小工具：
 *  · 尺寸：A4_RATIO、paperRatio、paperSizeForCard（卡纸比例）
 *  · 通用：uid（唯一 id）、clamp、countWords（富文本字数）、fmtTime、toast
 *  · 日志：logError / getLogs / clearLogs（环形缓冲 + localStorage 兜底）
 *  · 文件：fileToDataURL（图片本地化，避免 base64 拖动重复读取）
 * 注意：APP_VERSION 已迁移至 src/meta.ts，此处保留历史常量用于兼容。
 */`,

  'src/types.ts': `/**
 * ============ 全局类型定义 ============
 * 应用数据模型核心：
 *  · 项目类型（小说/RPG/Galgame/影视/自定义）与标识
 *  · 卡片（note 文字卡 / image 图片卡）、分区、连线、批注、分组
 *  · 富文本文档（TipTap JSON 结构）、页面、设置、协同数据类型
 * 所有 store / 组件 / 导出模块共享此处的类型契约。
 */`,

  'src/tiptap.ts': `/**
 * ============ TipTap 富文本统一封装 ============
 * 所有编辑器的共用层：
 *  · extensions：全局扩展集合（斜体/下划线/表格/高亮/图片/占位符…）
 *  · docToHtml / textToDoc / fieldsToDoc：JSON ↔ HTML/文本/字段文档互转
 *  · docWordCount / docWordCountCached：字数统计（带按 id 缓存，供列表高频调用）
 *  · cleanDoc / setDocIndent：文档清洗与段落缩进
 * 供卡片编辑器、全屏编辑器、写作模式、导出模块共同使用。
 */`,

  'src/aiAgents.ts': `/**
 * ============ AI 智能体预设 + 协同协议 ============
 *  · 内置 AI Agent（通用/大纲/角色/世界观/卡牌…）定义与获取（getAgent）
 *  · AI 端点预设（OpenAI 兼容 / 本地 Ollama 等），供设置页与调用方使用
 *  · AI 生成结果的协同编辑协议数据（与 sync 模块配合）
 */`,

  'src/canvasBus.ts': `/**
 * ============ 画布轻量事件总线 ============
 * 组件间解耦通知（无参数、无状态）：
 *  · busOn('layout-done')：自动布局完成后通知（如通知视图复位）
 *  · busOn('cancel-long-press')：取消长按（如拖动开始时）
 * 返回取消订阅函数；用于跨组件且不经过 store 的一次性事件。
 */`,

  'src/cloudSync.ts': `/**
 * ============ 云盘备份同步（WebDAV） ============
 *  · 支持坚果云 / Nextcloud 等主流 WebDAV 云盘
 *  · 浏览器直连常受 CORS 限制 → 优先经应用内置代理转发（server 端），
 *    直连失败时提示配置代理地址
 *  · 备份命名/清理（BACKUP_MAX）、备份列表、拉取/恢复
 */`,

  'src/contentData.ts': `/**
 * ============ 内容素材库 ============
 * 灵感生成器的数据源（纯静态数据）：
 *  · 名字池（中式/日式/西式/奇幻）、hook 部件（人物/目标/阻碍/反转）
 *  · 世界观种子、性格/缺点/爱好/秘密、事件种子
 * 结构与「灵感生成器」UI 的字段一一对应，增删素材只改此文件。
 */`,

  'src/defaults.ts': `/**
 * ============ 默认分区 / 样例项目 / 灵感生成器 ============
 *  · SECTION_PRESETS / TYPE_SECTIONS：各项目类型的默认分区方案
 *  · buildSectionsForType / buildSampleProject / DEMO_CARDS：新建项目样例
 *  · PROJECT_TYPE_ENV_DESC：各类型的环境描述（AI 用）
 */`,

  'src/editorAiStore.ts': `/**
 * ============ 富文本编辑器 ↔ 悬浮 AI 桥 ============
 * 富文本编辑器（卡片/正文/全屏）挂载时注册 EditorAIBridge，
 * 全局悬浮 AI 助手通过它读取/替换当前文档内容。
 * 无编辑器挂载时为 null（悬浮 AI 自动降级为整卡操作）。
 */`,

  'src/inspiration.ts': `/**
 * ============ 自定义灵感文库 ============
 * 把任意卡片收藏为灵感素材（localStorage 持久化）：
 *  · loadInspirations / saveInspiration / deleteInspiration
 *  · 供「灵感」面板展示与一键生成卡片
 */`,

  'src/layout.ts': `/**
 * ============ 自动布局算法（纯函数） ============
 * 输入卡片与连线关系，输出卡片位置映射（PosMap）：
 *  · treeLayout：树形（自上而下）；radialLayout：辐射（环状）
 *  · gridLayout：网格（按行排布）；mindMapLayout：思维导图（左右分支）
 * 不依赖 DOM / store，便于单独测试与复用。
 */`,

  'src/orientation.ts': `/**
 * ============ 屏幕方向控制（原生端生效） ============
 *  · applyOrientation('portrait' | 'landscape' | 'auto')
 *  · auto：跟随设备当前方向；非原生环境静默忽略
 */`,

  'src/skills.ts': `/**
 * ============ AI 创作技能（Skill）系统 ============
 * 兼容 goink-skills 社区格式（Markdown + YAML frontmatter）：
 *  · parseSkillMd：frontmatter 解析（名称/描述/分类/图标）
 *  · loadSkills / saveSkills：localStorage 持久化
 *  · makeSkill：创建技能（写入本地库）
 */`,

  'src/templates.ts': `/**
 * ============ 自定义卡片模板 ============
 * 把任意卡片存为模板（localStorage 持久化）：
 *  · loadTemplates / saveCardAsTemplate / deleteTemplate
 *  · customTemplateToCard：实例化模板到指定分区与位置
 */`,

  'src/store.ts': `/**
 * ============ 全局状态 Store（zustand）============
 * 单例 useStudio，覆盖：项目/画布数据/选区/设置/历史快照/协同 op。
 * 代码已按职责拆分为：
 *  · src/store/persistence.ts —— localStorage 读写（纯函数）
 *  · src/store/history.ts     —— 撤销/重做快照
 *  · src/store/ops.ts         —— 协同操作流（op 生成/去重）
 * 持久化策略：高频变更只标记脏 + 1.5s 防抖落盘；页面隐藏/关闭/30s 兜底强制落盘。
 */`,

  'src/store/history.ts': `/**
 * ============ 历史快照工具（撤销/重做） ============
 * 从 store.ts 抽取：
 *  · Snapshot：一次可撤销状态的完整快照（卡片/连线/分组/分区/页面数据）
 *  · historySnapshot / applySnapshot：生成与恢复
 *  · describeCardPatch / describeEdgePatch：操作描述（UI 提示用）
 *  · 常量：HISTORY_MAX(100) / UNDO_REDO_STEP_LIMIT / HISTORY_COALESCE_MS(2s 合并)
 *  · shouldPushEditHistory：拖拽/输入等场景的节流判定
 */`,

  'src/store/ops.ts': `/**
 * ============ 协同操作流（op） ============
 * 从 store.ts 抽取，负责与 WebSocket 协同层对接：
 *  · bindOpSink：绑定 op 上报回调（ws 客户端连接时注入）
 *  · emitOps：广播本地变更 op；rememberOp / seenOps：接收端去重（幂等）
 *  · getClientId：本机协同身份（随机持久化）
 */`,

  'src/store/persistence.ts': `/**
 * ============ 本地持久化（localStorage 读写） ============
 * 从 store.ts 抽取：纯函数，不依赖 zustand store（无循环依赖）。
 *  · 键名常量：K_SETTINGS / K_PROJECTS / K_PROJECT(id) / K_TRASH / K_AI_HISTORY…
 *  · load*/save*：设置、项目列表、项目页面数据（含旧格式迁移）、回收站、AI 历史
 *  · DEFAULT_SETTINGS：全局默认设置（含 AI 与云盘子配置）
 * 所有读写均 try/catch 容错（localStorage 满/损坏时静默降级）。
 */`,

  'src/sync/ws.ts': `/**
 * ============ 局域网协同 WebSocket 客户端 ============
 *  · connectServer / disconnect：连接/断开协同服务器（项目级）
 *  · publishPresence：光标位置上报；isConnected：连接状态
 *  · maybeAutoReconnect：打开项目后自动重连（记住的服务器）
 *  · 项目拉取/上传（fetchServerProject / uploadProject / listServerProjects）
 *  op 级同步细节见 store/ops.ts。
 */`,

  'src/export/export.ts': `/**
 * ============ 导出模块 ============
 * 卡片/项目 → 多种格式：
 *  · Markdown（含小说排版 projectToNovelMarkdown）、HTML（可打印/网页）
 *  · Word(.doc)、TXT、JSON（项目备份）、画布图片 exportCanvasImage
 *  · docToMarkdown / cardToMarkdown：富文本 → Markdown 基础转换
 * 纯函数为主；下载动作在调用方（Modals 导出弹窗）处理。
 */`,

  'src/utils/coords.ts': `/**
 * ============ 视口 / 坐标工具（纯函数） ============
 * 从 CanvasBoard 抽取：
 *  · toWorldPoint：屏幕坐标 → 世界坐标（含容器偏移与缩放）
 *  · computeZoomAnchor：以某点为锚的缩放（滚轮缩放时保持鼠标下内容不动）
 */`,

  'src/utils/geometry.ts': `/**
 * ============ 连线几何工具（纯函数） ============
 * 从 CanvasBoard / EdgesLayer 抽取：
 *  · anchorPoint：卡片四边锚点定位；edgeGeometry：连线起止/控制点
 *  · segIntersects / segIntersectsRect：线段/矩形相交检测（框选命中）
 *  · edgeMidOffset：连线中部偏移（标签位置）
 */`,

  'src/components/icons.tsx': `/**
 * ============ 轻量内联 SVG 图标 ============
 * 应用内图标集（TrashIcon / DeleteIcon 等），内联 SVG 避免引入图标库体积。
 * 新图标直接按同模式追加即可（stroke 当前色、可配 size）。
 */`,

  'src/components/AIAssistant.tsx': `/**
 * ============ 悬浮 AI 助手面板 ============
 * 全局悬浮按钮 → 打开右侧 AI 面板：
 *  · 快捷指令（续写/扩写/润色/大纲）、Agent 选择、技能库、灵感/模板入口
 *  · 生成结果写入当前卡片/文档（经 editorAiStore 桥），支持“替换/追加”
 *  · 与富文本编辑器联动；无编辑器时操作整卡正文
 */`,

  'src/components/AIModelSelect.tsx': `/**
 * ============ AI 模型选择器 ============
 * 设置页/区域用：端点 + 模型下拉，支持预设端点（OpenAI 兼容/本地）与自定义模型，
 * 选择结果写入 settings.ai.model（详见 aiAgents.ts 的预设表）。
 */`,

  'src/components/CalendarBoard.tsx': `/**
 * ============ 故事日历（排期视图） ============
 * 专注「排期 / 备注 / 状态」——卡片在画布创建，日历只做时间管理：
 *  · 月历上点两日框选时间段 → 从卡片池选卡排期
 *  · 卡片可拖拽改期；周视图/月视图；按状态筛选
 *  · 多选批处理：移动到卷/上移下移/删除（不提供新建卡片入口）
 */`,

  'src/components/CardView.tsx': `/**
 * ============ 单张卡片渲染（性能敏感，已 memo） ============
 *  · 展示卡片内容/封面/状态角标/批注数，处理选中与拖拽视觉
 *  · customCompare：仅当尺寸/位置/内容等关键字段变化才重渲染
 *  · 交互事件（点击/拖动/右键）由 CanvasBoard 统一处理，此处只负责呈现
 */`,

  'src/components/EdgesLayer.tsx': `/**
 * ============ 连线渲染层（SVG） ============
 *  · 渲染全部连线：贝塞尔曲线、单向/双向箭头、选中高亮、颜色按分区
 *  · 命中检测（靠近曲线可选中/删除），虚线表示进行中连线
 */`,

  'src/components/FullscreenEditor.tsx': `/**
 * ============ 全屏卡片编辑器（覆盖层） ============
 *  · 编辑卡片正文/大纲/字段，富文本 + 字数统计
 *  · 带顶部保存/关闭与底部工具栏，适配横屏大屏（CanvasApp 风格）
 *  · 与画布状态联动（编辑中的卡片实时同步）；懒加载组件
 */`,

  'src/components/HelpModal.tsx': `/**
 * ============ 操作说明弹窗 ============
 * 展示应用操作指南（新建/拖动/连线/协同/导出…）。
 * showHelpOnce：首次进入项目自动展示一次（localStorage 标记/可重置）。
 */`,

  'src/components/LeftSidebar.tsx': `/**
 * ============ 左侧栏 ============
 *  · 分区/页面树：展开收起、增删改分区、页面切换
 *  · 事件/卡片搜索、卡片池（未排期）、排序入口
 * 移动端折叠为抽屉（App 内 mobilePanel 控制）。
 */`,

  'src/components/MiniMap.tsx': `/**
 * ============ 小地图导航 ============
 * 画布全局缩略图：显示所有卡片位置与当前视口矩形，点击/拖动跳转视口。
 * 性能敏感：仅订阅 viewport 与卡片位置摘要（由 CanvasBoard 传入）。
 */`,

  'src/components/Modals.tsx': `/**
 * ============ 模态框宿主（所有弹窗统一入口） ============
 *  · ModalHost 根据 useStudio.modal 渲染对应弹窗：
 *    新建/打开/项目设置/设置/导出导入/协同/回收站/卡片回收站/写作模式/时间轴
 *  · 写作模式、时间轴（含日历）为懒加载子块
 *  · cmPrompt/csConfirm 等系统对话框见 SystemDialog.tsx
 */`,

  'src/components/RichEditor.tsx': `/**
 * ============ 富文本编辑器（TipTap 封装） ============
 * 卡片/正文/全屏共用：工具栏（标题/加粗/列表/表格/高亮/图片…）、
 * 字数统计、目录/段落缩进；通过 EditorAIBridge 与悬浮 AI 联动。
 */`,

  'src/components/RightPanel.tsx': `/**
 * ============ 右侧属性面板 ============
 *  · 未选中：项目信息/统计/操作入口
 *  · 单卡选中：属性编辑（标题/分区/状态/尺寸/图片/备注/样式…）
 *  · 多选：批量操作栏（统一样式/移动到卷/上移下移/删除/全选…）
 * 移动端折叠为抽屉。
 */`,

  'src/components/StatusBar.tsx': `/**
 * ============ 底部状态栏 ============
 * 全局状态展示与常用操作：字数统计、保存状态、协同在线人数、
 * 撤销/重做、缩放/适应画布、筛选计数等。
 */`,

  'src/components/StoryTimeline.tsx': `/**
 * ============ 故事时间轴视图 ============
 * 按时间组织卡片（日期/阶段），支持：
 *  · 时间缩放拖动、卡片聚焦（联动画布选中）
 *  · 按状态/分区筛选、标注时间段（排期提示）
 */`,

  'src/components/Toasts.tsx': `/**
 * ============ 轻提示（toast） ============
 * 全局 toast 队列：短暂显示后自动消失（util.ts 的 toast() 触发），
 * 支持类型（ok/err/warn）与主题化样式；单例挂载 App 根部。
 */`,

  'src/components/TopBar.tsx': `/**
 * ============ 顶栏 ============
 *  · 项目名/类型徽标、保存/导入导出、时间轴入口、设置
 *  · 页面切换器（PageSwitcher，画布多页面）、分类筛选、合作方模式开关
 * 移动端精简为图标按钮。
 */`,

  'src/components/WritingMode.tsx': `/**
 * ============ 写作模式（专注写作） ============
 * 全屏连续写作视图：单卡/多卡流式编辑、自动保存、
 * 字数/目标进度、分区导航、防干扰（隐藏画布）。
 * 懒加载组件；从画布“写作”入口打开。
 */`,

  'src/components/TimelineHub.tsx': `/**
 * ============ 日历 · 时间轴 统一入口 ============
 * 「时间轴 / 日历排期」双 Tab 宿主：
 *  · 由 ModalHost 的 modal==='hub' 打开
 *  · 子页懒加载（默认时间轴，切到日历时才加载日历组件）
 *  · hubFocus：从画布跳转时的聚焦参数（日期/卡片）
 */`,

  'public/theme-overrides.js': `/**
 * theme-overrides.js —— 主题/交互补丁注入（原生 WebView 环境生效）
 * 职责：全局行为微调（滚动条样式、文本选择、双击缩放、橡皮筋回弹等），
 *       与 CSS 主题变量联动；纯增量注入，不修改业务组件代码。
 * 注意：文件内容变更后由构建插件自动更新 index.html 的 ?v= 指纹，无需手改。
 */`,

  'public/theme-overrides.css': `/**
 * theme-overrides.css —— 全局主题补丁样式
 * 职责：覆盖/增强系统默认样式（滚动条、选中色、输入控件、暗色主题细节），
 *       使用 CSS 变量（--panel/--accent/--text…）与主题联动。
 * 注意：文件内容变更后由构建插件自动更新 index.html 的 ?v= 指纹，无需手改。
 */`,

  'server/index.js': `/**
 * ============ 局域网协同服务器（Node） ============
 * 职责：WebSocket 协同（op 广播/在线状态）、WebDAV 代理（云盘 CORS 绕行）、
 *      静态资源服务（生成 dist 后可直接访问）。
 * 用法：npm run server（默认 8787；PORT=8787 node server/index.js）
 * 客户端入口：应用内「局域网协同」弹窗 → 连接 ws://<ip>:8787。
 */`,
};

let ok = 0, skipped = 0;
for (const [rel, hdr] of Object.entries(HEADERS)) {
  const p = join(root, rel);
  let src;
  try {
    src = readFileSync(p, 'utf8');
  } catch (e) {
    console.log('MISSING', rel);
    continue;
  }
  // 已有完整 /* 块注释 → 跳过（如 CanvasBoard TOC、ErrorBoundary 等）
  const first = src.split('\n').find((l) => l.trim() !== '');
  if (first && first.trim().startsWith('/*')) {
    skipped++;
    continue;
  }
  // 去掉开头的空行与单行注释，插入完整头注释
  const lines = src.split('\n');
  let j = 0;
  while (j < lines.length) {
    const t = lines[j].trim();
    if (t === '' || t.startsWith('//')) { j++; continue; }
    break;
  }
  writeFileSync(p, hdr + '\n' + lines.slice(j).join('\n'));
  ok++;
}
console.log(`✅ 已注释 ${ok} 个文件，跳过（已有完整注释）${skipped} 个`);