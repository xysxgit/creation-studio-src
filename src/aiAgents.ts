/**
 * ============ AI 智能体预设 + 协同协议 ============
 *  · 内置 AI Agent（通用/大纲/角色/世界观/卡牌…）定义与获取（getAgent）
 *  · AI 端点预设（OpenAI 兼容 / 本地 Ollama 等），供设置页与调用方使用
 *  · AI 生成结果的协同编辑协议数据（与 sync 模块配合）
 */
import type { Card, JSONDoc } from './types';
import { docToHtml, mdToDoc } from './tiptap';
import { formalCardTitle, truncate } from './util';

export interface AIQuick {
  key: string;
  label: string;
  /** 生成提示词；sel 为当前选中的卡片（可能为空） */
  build: (sel: Card | null, ctx: { project: string; sections: string[] }) => string;
}

export interface AIAgent {
  key: string;
  name: string;
  emoji: string;
  desc: string;
  system: string;
  quick: AIQuick[];
}

function mdOf(card: Card): string {
  const html = docToHtml(card.content);
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim();
}

const selCtx = (sel: Card | null): string => {
  if (!sel) return '';
  return `\n\n【当前选中的卡片】标题：${sel.title || '（无标题）'}\n内容：\n${truncate(mdOf(sel), 1200)}`;
};

const T: Record<string, string> = {
  general: '你是资深剧本创作顾问，精通小说、轻小说、RPG 剧本、Galgame 脚本与影视脚本的结构、人物塑造、世界观搭建与对白写作。回答简洁、具体、有创意，使用简体中文。',
  world: '你是世界观架构师，擅长构建自洽、有辨识度的幻想/科幻/现实世界设定：核心规则、历史、势力、地理、独特现象与隐藏设定。回答分点、具体、可落地到创作中，使用简体中文。',
  character: '你是角色塑造师，擅长设计立体人物：外在形象、性格矛盾、动机欲望、背景创伤、关系网与成长弧光。避免脸谱化，给出可执行的人物小传，使用简体中文。',
  plot: '你是剧情策划师，精通三幕结构、冲突设计、节奏与钩子。擅长把点子扩展成章节大纲、桥段编排与反转设计，输出具体可用的分章/分场结构，使用简体中文。',
  polish: '你是文风润色师，文字功底深厚，擅长在保留原意与风格的前提下提升文学质感：更精准的用词、更生动的意象、更好的节奏与韵律。直接输出润色后的全文，使用简体中文。',
  dialogue: '你是对白编剧，擅长塑造人物语气差异、潜台词、节奏与停顿，让台词符合角色身份与关系，避免书面腔。直接输出对白文本（可标注说话人），使用简体中文。',
  editor: '你是严谨的编辑校对，擅长发现逻辑漏洞、设定冲突、语病、重复表达与节奏问题，并给出修改建议与改写版本。使用简体中文，先问题后建议。',
  brainstorm: '你是创意头脑风暴伙伴，思维发散又懂得收敛，每次给出多样化的选项（含出其不意的方向），并简要说明每个方向的潜力，使用简体中文。',
  rpg: '你是 RPG 游戏剧本与数值策划，熟悉任务链设计、难度曲线、奖励循环、装备技能体系与多结局分支，输出可直接录入游戏的表格化设计，使用简体中文。',
  gal: '你是 Galgame 脚本作家，擅长好感度分支、选项设计、路线拆分、日常与情感冲突的节奏控制，输出含选项与路线标注的脚本片段，使用简体中文。',
  film: '你是影视编剧，熟悉分场（场景/内景外景/日景夜景）、镜头感、对白潜台词与三幕结构，输出可直接拍摄的分场脚本格式，使用简体中文。',
  translate: '你是专业文学翻译，精通中英互译，保留原文风格、节奏与文化意象，译文自然流畅，必要时附简要注释。',
};

export const AI_AGENTS: AIAgent[] = [
  {
    key: 'general', name: '全能创作顾问', emoji: '🧙', desc: '结构·人物·世界观·对白全能的创作搭子', system: T.general,
    quick: [
      { key: 'idea', label: '💡 灵感', build: (sel) => '请给我 3 个新颖的故事灵感（一句话一个，附类型标签）' + (sel ? `，尽量贴合当前卡片「${sel.title}」的主题` : '') },
      { key: 'world', label: '🌍 世界观', build: (sel) => '请创作一个完整的世界观设定：世界名称、核心规则（魔法/科技/法则）、历史大事、主要势力、独特现象，分点列出，简洁具体。' + selCtx(sel) },
      { key: 'char', label: '👤 角色', build: (sel) => '请创作一个立体的人物设定：姓名、年龄、外貌、性格（含矛盾点）、背景故事、目标与动机、弱点、成长弧光。' + selCtx(sel) },
      { key: 'chapter', label: '📖 章纲', build: (sel) => '请为当前故事起草一份章节大纲：8-12 章，每章一句话核心事件 + 结尾钩子，并标注三幕结构位置。' + selCtx(sel) },
      { key: 'polish', label: '✨ 润色', build: (sel) => '请润色并优化下面这段内容，保持原意但提升文学质感：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片，请给出一个通用的润色示例说明）') },
      { key: 'advice', label: '🧭 建议', build: (sel) => '请以专业编剧的视角，对下面的故事梗概给出结构建议、冲突建议和下一步情节走向：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（当前没有选中卡片，请给出一个通用的大纲创作建议）') },
    ],
  },
  {
    key: 'world', name: '世界观架构师', emoji: '🌍', desc: '规则·历史·势力·地理·独特现象', system: T.world,
    quick: [
      { key: 'build', label: '🛠 搭建世界', build: (sel) => '从零搭建一个完整世界观：名称、核心规则、时间线（含 3 个关键历史事件）、主要势力（含立场关系）、地理/地图要点、独特现象。' + selCtx(sel) },
      { key: 'expand', label: '🔍 深化设定', build: (sel) => '围绕现有设定做深度扩展：找出 3 个可深挖的设定点并展开（如力量体系的社会影响、历史事件的真相与谎言），每个点给出具体设定。' + selCtx(sel) },
      { key: 'conflict', label: '⚔ 势力冲突', build: (sel) => '基于当前世界观设计一组势力冲突：至少 3 方势力，各自目标、资源、弱点，以及两两之间的核心矛盾与可能的结盟/背叛走向。' + selCtx(sel) },
      { key: 'magic', label: '✨ 力量体系', build: (sel) => '设计一套有代价、有等级、有社会影响的力量/魔法体系：来源、分类、修炼或获取方式、限制与代价、对普通人的影响。' + selCtx(sel) },
    ],
  },
  {
    key: 'character', name: '角色塑造师', emoji: '👤', desc: '立体人物·动机·弧光·关系网', system: T.character,
    quick: [
      { key: 'create', label: '🆕 新角色', build: (sel) => '创作一个立体角色：姓名、年龄、外貌、性格（含内在矛盾）、背景故事、目标与动机、弱点、关系网、成长弧光。' + selCtx(sel) },
      { key: 'deepen', label: '🔬 深化角色', build: (sel) => '为当前角色做深度剖析：他的核心欲望与恐惧、行为逻辑、三个反差细节、与主角关系的演变、适合他的三个剧情转折。' + selCtx(sel) },
      { key: 'voice', label: '🗣 说话方式', build: (sel) => '为当前角色设计独特的说话方式：口头禅、用词习惯、语速节奏、在不同对象面前的语言差异，并给出 5 句示范台词。' + selCtx(sel) },
      { key: 'arc', label: '📈 成长弧光', build: (sel) => '为当前角色设计一条完整成长弧光：起点状态、致命缺陷、触发事件、内心挣扎、关键抉择、终点转变，分阶段描述。' + selCtx(sel) },
    ],
  },
  {
    key: 'plot', name: '大纲与剧情策划', emoji: '📖', desc: '三幕结构·冲突·节奏·反转', system: T.plot,
    quick: [
      { key: 'outline', label: '📋 章节大纲', build: (sel) => '起草章节大纲：8-12 章，每章一句核心事件 + 结尾钩子，标注三幕位置与节奏起伏。' + selCtx(sel) },
      { key: 'twist', label: '🌀 反转设计', build: (sel) => '基于当前剧情设计 2-3 个反转：每个反转给出铺垫线索（前期如何埋）、引爆时机、真相揭示后的连锁反应与读者情绪曲线。' + selCtx(sel) },
      { key: 'scene', label: '🎬 场景扩展', build: (sel) => '把当前片段扩展成一个完整场景：场景目标、入场状态、冲突升级（至少 3 个节拍）、转折、离场状态，附人物动作与对白要点。' + selCtx(sel) },
      { key: 'pacing', label: '⏱ 节奏诊断', build: (sel) => '诊断当前剧情的节奏问题：哪段拖沓、哪段太赶、张力峰值是否合理，并给出具体的删减/扩充建议与调整后的节奏表。' + selCtx(sel) },
    ],
  },
  {
    key: 'polish', name: '文风润色师', emoji: '✨', desc: '用词·意象·节奏·韵律', system: T.polish,
    quick: [
      { key: 'polish', label: '✨ 润色全文', build: (sel) => '润色下面这段内容，保持原意与叙事视角，提升用词精度、画面感与节奏。直接输出润色后的全文：\n\n' + (sel ? truncate(mdOf(sel), 2500) : '（未选中卡片）') },
      { key: 'style', label: '🎨 风格改写', build: (sel) => '用更诗意的文学风格改写下面这段内容（保留情节，重写表达），并简要说明改写了哪些手法：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
      { key: 'concise', label: '✂️ 精简压缩', build: (sel) => '把下面这段内容压缩到原长度一半以内，保留所有关键信息与语气，去除冗余：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
      { key: 'sensory', label: '👁 感官增强', build: (sel) => '为下面这段内容增强五感描写（视觉/听觉/嗅觉/触觉/味觉）与氛围感，保持视角一致：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
    ],
  },
  {
    key: 'dialogue', name: '对白编剧', emoji: '💬', desc: '潜台词·语气·节奏·身份感', system: T.dialogue,
    quick: [
      { key: 'scene', label: '🎭 对白场景', build: (sel) => '写一段两人的关键对白场景（不少于 12 句）：带潜台词、语气提示与动作描写，体现两人的关系与情绪变化。' + selCtx(sel) },
      { key: 'conflict', label: '🔥 争吵戏', build: (sel) => '写一段激烈但不说破的争吵对白：双方都觉得自己有理，步步升级，最后一句收在意味深长的沉默上。' + selCtx(sel) },
      { key: 'subtext', label: '🕳 潜台词', build: (sel) => '把下面这段直白内容改写成充满潜台词的对白：表面谈A，实际在谈B，每个角色都有不能明说的心思。\n\n' + (sel ? truncate(mdOf(sel), 1500) : '（未选中卡片）') },
      { key: 'banter', label: '😄 日常逗趣', build: (sel) => '写一段轻松日常对白（伙伴/家人/师徒关系皆可）：有来有回的节奏、一个贯穿的小梗、结尾一个暖心的点。' + selCtx(sel) },
    ],
  },
  {
    key: 'editor', name: '编辑校对', emoji: '📝', desc: '逻辑漏洞·设定冲突·语病·节奏', system: T.editor,
    quick: [
      { key: 'check', label: '🔎 全面审校', build: (sel) => '审校下面这段内容：列出逻辑漏洞、设定冲突、语病、重复表达与节奏问题（按严重程度排序），并给出修正后的版本：\n\n' + (sel ? truncate(mdOf(sel), 2500) : '（未选中卡片）') },
      { key: 'continuity', label: '🧩 一致性检查', build: (sel) => '检查当前内容与项目设定的一致性：找出可能与前文冲突的细节（时间线、人物行为、物理规则），并给出修复建议。' + selCtx(sel) },
      { key: 'hook', label: '🪝 钩子检查', build: (sel) => '检查这段内容的开头吸引力与结尾钩子：开头 3 句能否抓住读者？结尾是否留下继续阅读的欲望？给出改写建议与示范版本。' + selCtx(sel) },
    ],
  },
  {
    key: 'brainstorm', name: '头脑风暴', emoji: '💡', desc: '发散灵感·多样化方向·潜力评估', system: T.brainstorm,
    quick: [
      { key: 'spark', label: '🎲 灵感连发', build: (sel) => '围绕下面这个主题给出 8 个风格迥异的故事灵感（含一个黑暗向、一个治愈向、一个荒诞向），每个一句话+潜力评估。' + (sel ? `主题参考：${sel.title}` : '（主题自拟：一个有趣的切入点）') + selCtx(sel) },
      { key: 'whatif', label: '❓ 如果…会怎样', build: (sel) => '围绕当前设定提出 8 个「如果…会怎样」的假设，每个假设推演 2-3 步连锁反应，挑出最有戏剧性的 2 个展开成故事方向。' + selCtx(sel) },
      { key: 'title', label: '🏷 标题党', build: (sel) => '为当前内容设计 10 个不同风格的标题：爆点型、悬念型、文艺型、网文型、极简型，各附一句理由。' + selCtx(sel) },
      { key: 'incident', label: '⚡ 开场事件', build: (sel) => '为当前故事设计 5 个开场事件（打破日常的第一次扰动）：每个给出发生方式、主角反应、引出主线的方式，并推荐最优解。' + selCtx(sel) },
    ],
  },
  {
    key: 'rpg', name: 'RPG 任务数值', emoji: '⚔️', desc: '任务链·数值·装备技能·多结局', system: T.rpg,
    quick: [
      { key: 'questline', label: '🗺 任务链', build: (sel) => '设计一条 8-12 步的任务链：每步包含目标、地点、敌人/障碍、奖励、与主线的关联，标注难度曲线与节奏峰谷。' + selCtx(sel) },
      { key: 'loot', label: '🎒 装备掉落', build: (sel) => '为当前区域设计 5 件装备/道具：名称、稀有度、数值（攻防/效果）、获取方式、背景小故事，注意数值平衡与成长曲线。' + selCtx(sel) },
      { key: 'branch', label: '🌿 多结局', build: (sel) => '设计一套多结局分支体系：至少 3 个结局，标注关键抉择点、达成条件、玩家心理预期管理，以及各结局的回收伏笔清单。' + selCtx(sel) },
      { key: 'balance', label: '⚖ 数值平衡', build: (sel) => '审校当前数值体系：给出角色成长曲线建议（等级-属性-敌人强度对照表）、经济系统（获取/消耗比）、常见平衡陷阱与修正方案。' + selCtx(sel) },
    ],
  },
  {
    key: 'gal', name: 'Galgame 分支', emoji: '🌿', desc: '好感度·选项设计·路线拆分·日常节奏', system: T.gal,
    quick: [
      { key: 'route', label: '🗂 路线设计', build: (sel) => '设计一套多女主/多路线分支结构：共通线→个人线的拆分点、各线主题与情绪曲线、隐藏线解锁条件，附线路图文字版。' + selCtx(sel) },
      { key: 'choices', label: '🎯 选项设计', build: (sel) => '为当前场景设计 3-4 组选项：每个选项的即时反馈、好感度/属性影响、对后续剧情的影响，以及「看似无用实则关键」的选项设计。' + selCtx(sel) },
      { key: 'daily', label: '☀ 日常章节', build: (sel) => '写一段 Galgame 式日常章节脚本：时间轴、事件编排、搞笑/温馨/铺垫三要素配比、结尾一个微妙的感情进展。' + selCtx(sel) },
      { key: 'confess', label: '💘 告白场景', build: (sel) => '写一段告白场景脚本（含选项与分支）：氛围铺垫、两人心理、告白台词、成功/失败两种走向、后续场景衔接。' + selCtx(sel) },
    ],
  },
  {
    key: 'film', name: '影视分镜', emoji: '🎬', desc: '分场格式·镜头感·潜台词·三幕', system: T.film,
    quick: [
      { key: 'script', label: '🎞 分场脚本', build: (sel) => '把当前内容改写成标准分场脚本格式：场景标题（内/外景·日/夜景）、人物动作描写、对白（含潜台词提示）、镜头建议。\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
      { key: 'storyboard', label: '🎥 分镜表', build: (sel) => '为当前场景制作分镜表：8-12 个镜头，每个镜头给出景别（远景/中景/特写）、运镜方式、画面内容、声音设计、时长。' + selCtx(sel) },
      { key: 'coldopen', label: '🎬 冷开场', build: (sel) => '为当前故事设计一个 2 分钟内的冷开场：先声夺人的画面与声音、人物出场方式、悬念植入，并说明如何衔接第一幕。' + selCtx(sel) },
      { key: 'logline', label: '📌 一句话梗概', build: (sel) => '为当前故事打磨 Logline（一句话梗概）与 3 个备选卖点：突出类型定位、主角困境与独特性，适合拿去推介。' + selCtx(sel) },
    ],
  },
  {
    key: 'translate', name: '翻译官', emoji: '🌐', desc: '中英互译·保留风格与意象', system: T.translate,
    quick: [
      { key: 'zh2en', label: '🇨🇳→🇺🇸 中译英', build: (sel) => '将以下内容翻译成英文，保留格式、风格与意象，自然地道：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
      { key: 'en2zh', label: '🇺🇸→🇨🇳 英译中', build: (sel) => '将以下内容翻译成简体中文，保留原文风格与节奏，避免翻译腔：\n\n' + (sel ? truncate(mdOf(sel), 2000) : '（未选中卡片）') },
      { key: 'name', label: '🏷 译名设计', build: (sel) => '为以下专有名词设计译名方案：音译/意译/音意结合三种方案各一个，说明理由与潜在双关：\n\n' + (sel ? truncate(mdOf(sel), 800) : '（未选中卡片，请给出通用译名方法论）') },
    ],
  },
];

export const DEFAULT_AGENT_KEY = 'general';

export function getAgent(key: string): AIAgent {
  return AI_AGENTS.find((a) => a.key === key) || AI_AGENTS[0];
}

/** 本地模型 / 常见服务商预设（OpenAI 兼容） */
export const AI_ENDPOINT_PRESETS: { label: string; endpoint: string; model: string; local?: boolean; hint?: string }[] = [
  { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Kimi (Moonshot)', endpoint: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '🧠 Ollama 本地', endpoint: 'http://localhost:11434/v1', model: 'qwen2.5:7b', local: true, hint: '本机已安装 Ollama 且已拉取模型时无需密钥' },
  { label: '💻 LM Studio 本地', endpoint: 'http://localhost:1234/v1', model: 'local-model', local: true, hint: 'LM Studio 开启本地服务器后无需密钥' },
];

// ---------- AI 协同编辑协议 ----------
export interface AIAction {
  op: 'update' | 'create';
  title?: string;
  content?: string;
  section?: string;
}

/** 从 AI 回复中提取 JSON 操作块（```json {...}``` 或首个 {...}） */
export function parseAiActions(text: string): { actions: AIAction[]; rest: string } | null {
  if (!text) return null;
  let block = '';
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    block = fenced[1].trim();
  } else {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) block = text.slice(start, end + 1);
  }
  if (!block) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(block);
  } catch {
    return null;
  }
  let actions: AIAction[] | null = null;
  if (Array.isArray(obj.actions)) {
    actions = (obj.actions as AIAction[]).filter((a) => a && (a.op === 'update' || a.op === 'create'));
  } else if (obj.op === 'update' || obj.op === 'create') {
    actions = [obj as unknown as AIAction];
  }
  if (!actions || !actions.length) return null;
  const rest = text.replace(fenced ? fenced[0] : block, '').trim();
  return { actions, rest };
}

/** 把 AI 操作应用到画布；返回执行描述。selId 为当前选中卡片 */
export function applyAiActions(actions: AIAction[], selId: string | null, st: {
  cards: Record<string, Card>;
  sections: { id: string; name: string }[];
  updateCard: (id: string, patch: Partial<Card>) => void;
  addCard: (partial: Partial<Card> & { x?: number; y?: number }, opts?: { center?: boolean }) => string;
  setSelection: (ids: string[]) => void;
  viewport: { x: number; y: number; zoom: number };
}): string[] {
  const done: string[] = [];
  const secByName = (name: string | undefined) => st.sections.find((x) => x.name === name)?.id || '';
  for (const a of actions) {
    if (a.op === 'update') {
      const card = selId ? st.cards[selId] : null;
      if (!card) {
        done.push('未选中卡片，跳过修改');
        continue;
      }
      const patch: Partial<Card> = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.content !== undefined && a.content.trim()) patch.content = mdToDoc(a.content) as JSONDoc;
      st.updateCard(card.id, patch);
      done.push(`已修改卡片「${patch.title ?? card.title}」`);
    } else if (a.op === 'create') {
      const vp = st.viewport;
      const id = st.addCard({
        // 落卡命名规则（5.6）：AI 生成内容必须给出 `[类型] · [名称]` 正式标题
        title: formalCardTitle(a.title || 'AI 新建', a.section || 'AI 新建'),
        content: a.content ? (mdToDoc(a.content) as JSONDoc) : null,
        sectionId: secByName(a.section),
        w: 320,
        h: a.content ? Math.min(420, 180 + Math.ceil(a.content.length / 40) * 18) : 180,
        x: vp.x + (window.innerWidth / 2 - 160) / vp.zoom,
        y: vp.y + (window.innerHeight / 2 - 100) / vp.zoom,
      }, { center: false });
      st.setSelection([id]);
      done.push(`已新建卡片「${formalCardTitle(a.title || 'AI 新建', a.section || 'AI 新建')}」`);
    }
  }
  return done;
}

export { selCtx };

// ---------- AI 模型切换（对话框统一） ----------
const AI_MODELS_CACHE_KEY = 'cs.aiModels';

/** 读取「设置 → 读取模型」时缓存的模型列表（仅本机，不越界） */
export function getCachedModels(): string[] {
  try {
    const raw = localStorage.getItem(AI_MODELS_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 保存读取到的模型列表（供各 AI 对话框复用） */
export function saveCachedModels(list: string[]): void {
  try {
    localStorage.setItem(AI_MODELS_CACHE_KEY, JSON.stringify(Array.from(new Set(list)).slice(0, 200)));
  } catch {
    /* ignore */
  }
}

/** 构造模型选择分组：当前使用 → 本服务已读取（不再混入常用兜底） */
export function buildModelGroups(cur: string): { label: string; items: string[] }[] {
  const groups: { label: string; items: string[] }[] = [];
  const cached = getCachedModels();
  if (cur && !cached.includes(cur)) groups.push({ label: '当前使用', items: [cur] });
  const rest = cached.filter((m) => m !== cur);
  if (rest.length) groups.push({ label: `本服务（已读取 ${rest.length}）`, items: rest });
  // 兜底：即使从未读取过模型，也提供常用预设，避免下拉只剩当前一项而无法切换
  const presets = Array.from(new Set(AI_ENDPOINT_PRESETS.map((p) => p.model)));
  const presetRest = presets.filter((m) => m !== cur && !cached.includes(m));
  if (presetRest.length) groups.push({ label: '常用预设', items: presetRest });
  return groups;
}
