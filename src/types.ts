/**
 * ============ 全局类型定义 ============
 * 应用数据模型核心：
 *  · 项目类型（小说/RPG/Galgame/影视/自定义）与标识
 *  · 卡片（note 文字卡 / image 图片卡）、分区、连线、批注、分组
 *  · 富文本文档（TipTap JSON 结构）、页面、设置、协同数据类型
 * 所有 store / 组件 / 导出模块共享此处的类型契约。
 */
/** 项目类型（= 创作板块，五大板块见需求文档第 2 章） */
export type ProjectType = 'novel' | 'rpg' | 'gal' | 'film' | 'custom';

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  novel: '小说 / 轻小说',
  rpg: 'RPG 游戏',
  gal: 'GAL 游戏',
  film: '影视',
  custom: '自由创作',
};

export const PROJECT_TYPE_EMOJI: Record<ProjectType, string> = {
  novel: '📖',
  rpg: '⚔️',
  gal: '💕',
  film: '🎬',
  custom: '✨',
};

/** 卡片类型 */
export type CardKind = 'note' | 'image';

/**
 * 纸张规格（需求 3.3 / 6.3 / A.23）：
 * 项目统一设置纸张规格，卡片文字面与正文稿纸共用同一规格（默认 A4）；
 * 每类纸张比例固定，画布上可缩放大小但比例不变。
 */
export type PaperSize = 'A3' | 'A4' | 'A5' | 'B4' | 'B5' | 'Letter' | '16K';

/** 纸张规格表：mm 宽 × 高（比例 = w / h） */
export const PAPER_SIZES: Record<PaperSize, { w: number; h: number; label: string }> = {
  A3: { w: 297, h: 420, label: 'A3（297×420）' },
  A4: { w: 210, h: 297, label: 'A4（210×297，默认）' },
  A5: { w: 148, h: 210, label: 'A5（148×210）' },
  B4: { w: 250, h: 353, label: 'B4（250×353）' },
  B5: { w: 176, h: 250, label: 'B5（176×250）' },
  Letter: { w: 216, h: 279, label: 'Letter（216×279）' },
  '16K': { w: 184, h: 260, label: '16K（184×260）' },
};

/** 分区 */
export interface Section {
  id: string;
  name: string;
  emoji: string;
  color: string;
  hidden?: boolean;
  /** 大纲面板中折叠 */
  collapsed?: boolean;
}

/** 卡片 */
export interface Card {
  id: string;
  /**
   * 一卡两面（需求 3.3 / 3.4）：每张卡都有「文字面（正面）」与「图片面（反面）」，
   * kind 只表示当前翻到哪一面（note=文字面 / image=图片面），不再代表两种独立卡片；
   * 翻面 = setCardKind(id, 另一面)，两面内容互不干扰、不产生第二张卡。
   */
  kind: CardKind;
  sectionId: string;
  title: string;
  /** TipTap JSON 文档（文字面正文） */
  content: JSONDoc | null;
  /** 图片面：图片地址（dataURL / URL）；可为空（纯文字卡） */
  imageSrc?: string;
  /** 图片面显示方式 */
  imageFit?: 'contain' | 'fill';
  /** [兼容旧数据] 旧版单卡纸张模式；v2.33 起纸张规格由项目统一设置（meta.paper） */
  paper?: 'a4' | 'a4-double';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  color?: string; // 覆盖分区颜色
  collapsed?: boolean;
  locked?: boolean;
  /** 大纲排序序号（章纲等使用） */
  order?: number;
  /** 卡片模式：note=便签卡片（默认）；node=思维导图节点（紧凑显示） */
  mode?: 'note' | 'node';
  /** 卡片正文字号（px，默认 14；仅便签/正文卡显示用，不受画布缩放影响） */
  fontSize?: number;
  /** 卡片圆角：sm=小圆角 / md=默认 / lg=大圆角 */
  radius?: 'sm' | 'md' | 'lg';
  /** 所属编组 id */
  groupId?: string;
  /** 预览模式：完整显示排版格式（只读渲染，随编辑实时同步） */
  preview?: boolean;
  /** 模板卡标识：用于在卡片上提供“随机生成内容”功能 */
  templateKey?: string;
  /** [兼容旧数据] 旧版「正文=卡片」标记；v2.33 正文已独立存储（Manuscript，见 6.6），加载时一次性迁移 */
  writingOnly?: boolean;
  /** 故事日历日期（YYYY-MM-DD）：把卡片排进日历，按日查看事件/角色/伏笔 */
  date?: string;
  /** 事件发生结束日期（YYYY-MM-DD，可选）：> date 表示跨多日的事件时间段 */
  endDate?: string;
  /** 一天内的时段：morning=早 / noon=午 / night=晚 */
  daypart?: 'morning' | 'noon' | 'night';
  /** 故事日历时刻（HH:mm，可选）：排期到更精确的时间点 */
  time?: string;
  /** 故事状态：todo=待定 doing=推进中 done=已完成 hold=搁置 */
  status?: string;
  /** 备注短文（日历内轻量补充，不进入正文正文） */
  note?: string;
  /** 事件类型：main=主线 side=支线 daily=日常 seed=伏笔 */
  evType?: 'main' | 'side' | 'daily' | 'seed';
  /** 事件等级：high=高 mid=中 low=低 */
  evRank?: 'high' | 'mid' | 'low';
  /** 伏笔（evType=seed）计划回收日期 YYYY-MM-DD：日历在回收点提示，到点未回收会标「已过回收点」 */
  payDate?: string;
  /**
   * 回收指向：本卡（“回收点”）设置要回收的伏笔卡 id（关联键）。
   * 只有 evType='seed' 且带有 date 的伏笔可作为被回收对象；回收卡设置 seedFor 后，
   * 时间轴伏笔账本即可双向联动：伏笔侧标记「已回收」，回收点侧显示「回收『伏笔名』」。
   * 可选字段、默认不写；为空 = 本卡不是回收点。
   */
  seedFor?: string;
  /** 关联的事件卡 id 列表（联动：可跳到对应卡的日期） */
  relIds?: string[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  /** 更新来源客户端（协同用） */
  by?: string;
}

/** TipTap 文档（JSON 节点树） */
export interface JSONMark { type: string; attrs?: Record<string, unknown> }
export interface JSONDoc {
  type?: string;
  content?: JSONDoc[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: JSONMark[];
  [key: string]: unknown;
}
export type JSONNode = JSONDoc;

/** 连线 */
export interface Edge {
  id: string;
  from: string; // 卡片 id
  to: string;
  label?: string;
  /** 曲线弯曲度 0=直线 */
  curve?: number;
  color?: string;
  dashed?: boolean;
  /** 线型：straight=直线（默认）；curve=曲线；elbow=折线 */
  lineStyle?: 'curve' | 'straight' | 'elbow';
  /** 关系类型（画布父子/同级）：parent=父→子（from=父, to=子）；peer=同级（并列，无层级）；
   *  缺省视为 peer，向后兼容旧数据 */
  kind?: 'parent' | 'peer';
  /** 线宽（屏幕像素，默认 2.2） */
  width?: number;
  /** 箭头样式：end=末端箭头（默认）；start=起点箭头；both=双向；none=无箭头 */
  arrow?: 'end' | 'start' | 'both' | 'none';
  createdAt: number;
  updatedAt: number;
}

/** 卡片编组 */
export interface CardGroup {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  /** 大纲/编组面板中折叠 */
  collapsed?: boolean;
  /** 卷/编组排序 */
  order?: number;
  /** 仅存在于正文创作中，不出现在主画布 */
  writingOnly?: boolean;
}

/** 画笔标注（自由涂鸦） */
export interface Annotation {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
  createdAt: number;
}

/** 项目页面（同一项目内的多块画布，各自拥有卡片/连线/画笔） */
export interface PageMeta {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
}

/** 项目文件夹（用于在「打开项目」中分组整理项目） */
export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: number;
}
/** 故事时间轴：过去 / 现在 / 未来 三段中某一段的起止设定 */
export interface EraRange {
  /** 起始日期 YYYY-MM-DD */
  start?: string;
  /** 结束日期 YYYY-MM-DD */
  end?: string;
}
/** 时间轴三段时间设定（各自起止，可自由设定，不随真实日期变化） */
export interface EraSetting {
  past?: EraRange;
  now?: EraRange;
  future?: EraRange;
}
/** 项目 */
export interface ProjectMeta {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: number;
  updatedAt: number;
  /** 所属文件夹 id（可选） */
  folderId?: string;
  /** 项目封面（dataURL / URL），未设置时使用名称生成默认封面 */
  cover?: string;
  /** 故事时间轴：过去/现在/未来三段起止设定（未设则按卡片实际日期铺开） */
  calEras?: EraSetting;
  /** 日历：每天可写一条备注（多张卡共享） */
  calNotes?: Record<string, string>;
  /** 事件类型标签颜色（主线/支线/日常/伏笔），未设则用内置默认色 */
  evTypeColors?: Partial<Record<'main' | 'side' | 'daily' | 'seed', string>>;
  /** 项目纸张规格（3.3 / 6.3）：卡片文字面与正文稿纸共用，默认 A4 */
  paper?: PaperSize;
  /** [迁移标记] 旧版 writingOnly 卡片是否已迁移到独立正文（Manuscript） */
  manuscriptMigrated?: boolean;
}

export interface ProjectState {
  meta: ProjectMeta;
  sections: Section[];
  cards: Record<string, Card>;
  edges: Record<string, Edge>;
  /** 页面（可选，协同服务器透传） */
  pages?: Record<string, { cards: Record<string, Card>; edges: Record<string, Edge>; annotations?: Record<string, Annotation>; groups?: Record<string, CardGroup>; viewport?: Viewport }>;
  pageOrder?: PageMeta[];
}

/** 视图（平移缩放） */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 操作（协同广播的最小单元） */
export interface Op {
  id: string;
  client: string;
  ts: number;
  type: 'card.upsert' | 'card.remove' | 'edge.upsert' | 'edge.remove' | 'section.upsert' | 'section.remove' | 'meta';
  payload: Record<string, unknown>;
}

/** 在线成员 */
export interface Peer {
  id: string;
  name: string;
  color: string;
  lastSeen: number;
  /** 世界坐标中的鼠标位置 */
  px?: number;
  py?: number;
  viewport?: Viewport;
  editingCardId?: string;
}
/** AI 设置 */
export interface AISettings {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
  /** 思考模式开关（reasoning） */
  thinking?: boolean;
  /** 思考等级 */
  thinkLevel?: 'low' | 'medium' | 'high';
  /** 是否在回复中显示思考过程（流式） */
  showThinking?: boolean;
}

/** AI 生成历史条目（每次 AI 替换/追加正文记录，可回退对比） */
export interface AiEditLog {
  id: string;
  cardId: string;
  title: string;
  /** replace=替换正文 / append=追加 / restore=从历史恢复 */
  mode: 'replace' | 'append' | 'restore';
  /** AI 写入后的新正文 */
  content: JSONDoc;
  /** 写入前的原文（用于对比 / 找回） */
  prevContent: JSONDoc | null;
  /** 来源：writing=正文创作模式 / canvas=画布卡片 */
  source: 'canvas' | 'writing';
  ts: number;
}


/** 云盘同步（WebDAV：坚果云 / Nextcloud 等主流云盘） */
export interface CloudSettings {
  enabled: boolean;
  /** WebDAV 地址，如 https://dav.jianguoyun.com/dav/创作助手 */
  url: string;
  user: string;
  pass: string;
  /** 自动同步间隔（分钟） */
  intervalMin: number;
}

/** 护眼主题（观感预设，覆盖在亮/暗主题之上的配色）：''=默认（跟随应用）；绿/纸/暖夜/墨蓝 */
export type EyeTheme = '' | 'green' | 'paper' | 'warm' | 'ink';

/** 应用设置 */
export interface AppSettings {
  /** 主题模式：light=亮色；dark=深色；system=跟随系统（运行时解析为亮/暗） */
  theme: 'light' | 'dark' | 'system';
  /** 护眼主题：空白=默认（跟随应用）；green=豆沙绿·护眼；paper=米白·纸质；warm=暖夜·低刺激；ink=墨蓝·冷静 */
  czTheme?: EyeTheme;
  grid: boolean;
  autoSave: boolean;
  ai: AISettings;
  serverUrl: string;
  nickname: string;
  /** 屏幕方向：auto=跟随系统；portrait=竖屏；landscape=横屏（原生端生效） */
  orientation: 'auto' | 'portrait' | 'landscape';
  /** 自动保存间隔（秒），0=每次修改立即保存 */
  autoSaveInterval: number;
  /** 云盘同步设置 */
  cloud: CloudSettings;
  /** 最近打开的服务器项目 id */
  lastServerProject?: string;
}

// ============================================================================
// ============ 独立正文（Manuscript，需求 4.3 / 6.1 / 6.6） ============
// 正文是独立创作界面与独立数据资产：项目 → 卷 → 章 三层结构，
// 与画布卡片体系平行、独立存储（不借用卡片承载章节）。
// ============================================================================

/** 正文·卷 */
export interface ManuscriptVolume {
  id: string;
  name: string;
  /** 排序序号 */
  order: number;
  createdAt: number;
}

/** 正文·章 */
export interface ManuscriptChapter {
  id: string;
  /** 所属卷 id；空 = 未分卷 */
  volumeId?: string;
  title: string;
  /** TipTap JSON 文档（章正文） */
  content: JSONDoc | null;
  /** 卷内排序序号 */
  order: number;
  /** 章节摘要（可选，自动生成 / 手动填写） */
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

/** 正文回收站条目（删除的章可找回，6.2.6） */
export interface ManuscriptTrashItem {
  chapter: ManuscriptChapter;
  deletedAt: number;
}

/** 独立正文数据（随项目 JSON 保存，与画布数据互不污染） */
export interface Manuscript {
  volumes: ManuscriptVolume[];
  chapters: ManuscriptChapter[];
  /** 正文回收站（6.2.6 废纸篓） */
  trash: ManuscriptTrashItem[];
}

// ============================================================================

