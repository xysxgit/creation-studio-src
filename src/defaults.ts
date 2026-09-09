/**
 * ============ 默认分区 / 样例项目 / 灵感生成器 ============
 *  · SECTION_PRESETS / TYPE_SECTIONS：各项目类型的默认分区方案
 *  · buildSectionsForType / buildSampleProject / DEMO_CARDS：新建项目样例
 *  · PROJECT_TYPE_ENV_DESC：各类型的环境描述（AI 用）
 */
import type { Card, Edge, Section } from './types';
import type { ProjectType } from './types';
import { emptyDoc, pick, pickN, randInt, uid } from './util';
import { fieldsToDoc, textToDoc } from './tiptap';
import {
  TEMPLATE_BOARD_KEYS, cardTemplates, dialogueLines, eventSeeds, hookParts, inspirationSamples, itemSeeds,
  namePools, placeSeeds, questSeeds, sampleOutlines, traits, worldSeeds,
} from './contentData';

// ---------- 分区预设 ----------
export const SECTION_PRESETS: { name: string; emoji: string; color: string }[] = [
  { name: '世界观', emoji: '🌍', color: '#6a5cf5' },
  { name: '大纲', emoji: '📋', color: '#0984e3' },
  { name: '章纲', emoji: '📖', color: '#00b894' },
  { name: '重要角色', emoji: '⭐', color: '#e17055' },
  { name: '次要角色', emoji: '👤', color: '#fdcb6e' },
  { name: '事件', emoji: '⚡', color: '#e84393' },
  { name: '任务', emoji: '🎯', color: '#e67e22' },
  { name: '道具', emoji: '🎒', color: '#f39c12' },
  { name: '装备', emoji: '⚔️', color: '#d63031' },
  { name: '技能', emoji: '✨', color: '#00cec9' },
  { name: '等级', emoji: '📈', color: '#00a381' },
  { name: '地图', emoji: '🗺️', color: '#74b9ff' },
  { name: '伏笔', emoji: '🕳️', color: '#a29bfe' },
  { name: '分支', emoji: '🌿', color: '#fd79a8' },
  { name: '场景', emoji: '🎬', color: '#636e72' },
  { name: '对白', emoji: '💬', color: '#00b894' },
  { name: '好感度', emoji: '💗', color: '#F783AC' },
  { name: '结局', emoji: '🚩', color: '#D6336C' },
  { name: '便签', emoji: '📝', color: '#f8c291' },
];

export const TYPE_SECTIONS: Record<ProjectType, string[]> = {
  novel: ['世界观', '大纲', '章纲', '重要角色', '次要角色', '事件', '道具', '伏笔', '地图', '便签'],
  rpg: ['世界观', '大纲', '重要角色', '次要角色', '事件', '任务', '道具', '装备', '技能', '等级', '地图', '便签'],
  gal: ['世界观', '大纲', '重要角色', '次要角色', '分支', '事件', '伏笔', '对白', '好感度', '结局', '便签'],
  film: ['大纲', '场景', '重要角色', '次要角色', '对白', '事件', '世界观', '便签'],
  custom: ['世界观', '大纲', '章纲', '重要角色', '次要角色', '事件', '道具', '装备', '技能', '等级', '地图', '伏笔', '分支', '场景', '对白', '好感度', '结局', '便签'],
};


export const PROJECT_TYPE_ENV_DESC: Record<ProjectType, string> = {
  novel: '适配小说/轻小说：自动配置世界观、大纲、章纲、角色、事件、伏笔、地图等分区；模板库优先展示大纲、章节、角色、伏笔卡；生成器提供标题、人物、事件等灵感。',
  rpg: '适配 RPG 游戏剧本：自动配置任务、装备、技能、等级、地图等分区；模板库优先展示任务、装备、技能、等级、地图卡；生成器提供任务、装备、技能、地名等灵感。',
  gal: '适配 GAL 游戏：自动配置分支、对白、角色、事件、伏笔等分区；模板库优先展示分支、对白、角色、事件卡；生成器提供对白、分支、名字、事件等灵感。',
  film: '适配影视脚本：自动配置场景、对白、大纲、角色、事件等分区；模板库优先展示场景、对白、分场大纲、角色卡；生成器提供场景、对白、事件、标题等灵感。',
  custom: '自由创作模式：保留全部分区与全部模板，适合任意体裁的混合创作。',
};
export function buildSectionsForType(type: ProjectType): Section[] {
  return (TYPE_SECTIONS[type] || []).map((name) => {
    const p = SECTION_PRESETS.find((x) => x.name === name);
    // 找不到预设时退化为通用分区样式（不因预设缺失而中断建项目）
    return { id: uid('sec'), name, emoji: p?.emoji || '📦', color: p?.color || '#b2bec3' };
  });
}

// ---------- 样例项目 ----------
export function buildSampleProject(type: ProjectType, sections: Section[]): { cards: Record<string, Card>; edges: Record<string, Edge> } {
  const sample = (sampleOutlines as unknown as Record<string, typeof sampleOutlines.novel>)[type] || sampleOutlines.novel;
  const cards: Record<string, Card> = {};
  const edges: Record<string, Edge> = {};
  const now = Date.now();
  const W = 300;
  const H = 240;
  const GAPX = 340;
  const GAPY = 300;

  sample.cards.forEach((sc, i) => {
    const sec = sections.find((x) => x.name === sc.section);
    const col = i % 5;
    const row = Math.floor(i / 5);
    const card: Card = {
      id: uid('card'),
      kind: 'note',
      sectionId: sec?.id || sections[0]?.id || '',
      title: sc.title,
      content: textToDoc(sc.body),
      x: 80 + col * GAPX + randInt(-15, 15),
      y: 60 + row * GAPY + randInt(-15, 15),
      w: W,
      h: H,
      z: i + 2,
      createdAt: now + i,
      updatedAt: now + i,
    };
    cards[card.id] = card;
  });

  // 用名字建索引，方便连线
  const byTitle: Record<string, string> = {};
  for (const c of Object.values(cards)) byTitle[c.title] = c.id;
  const link = (a: string, b: string) => {
    const fa = byTitle[a];
    const fb = byTitle[b];
    if (!fa || !fb || fa === fb) return;
    if (Object.values(edges).some((e) => e.from === fa && e.to === fb)) return;
    const eid = uid('edge');
    edges[eid] = { id: eid, from: fa, to: fb, label: '', curve: 0.25, createdAt: now, updatedAt: now };
  };

  const outlines = sample.cards.filter((c) => c.section === '大纲').map((c) => c.title);
  const chapters = sample.cards.filter((c) => c.section === '章纲').map((c) => c.title);
  const mains = sample.cards.filter((c) => c.section === '重要角色').map((c) => c.title);
  const events = sample.cards.filter((c) => c.section === '事件').map((c) => c.title);
  const scenes = sample.cards.filter((c) => c.section === '场景').map((c) => c.title);
  const branches = sample.cards.filter((c) => c.section === '分支').map((c) => c.title);

  for (const o of outlines) for (const ch of chapters) link(o, ch);
  for (const o of outlines) for (const m of mains) link(m, o);
  for (const o of outlines) for (const e of events) link(o, e);
  for (const s of scenes) link(outlines[0], s);
  for (const b of branches) link(outlines[0], b);
  const world = sample.cards.find((c) => c.section === '世界观')?.title;
  if (world && outlines[0]) link(world, outlines[0]);
  const quests = sample.cards.filter((c) => c.section === '任务').map((c) => c.title);
  for (const q of quests) link(outlines[0], q);

  return { cards, edges };
}

// ---------- 自定义项目的欢迎卡片 ----------
export function DEMO_CARDS(sections: Section[], origin: { x: number; y: number }): Record<string, Card> {
  const now = Date.now();
  const sec = (name: string) => sections.find((x) => x.name === name)?.id || '';
  const mk = (title: string, sectionId: string, x: number, y: number, lines: string[], w = 320, h = 200, order?: number): Card => ({
    id: uid('card'), kind: 'note', sectionId, title, content: textToDoc(lines),
    x, y, w, h, z: 1, createdAt: now, updatedAt: now, order,
  });
  const cards: Record<string, Card> = {};
  const add = (c: Card) => { cards[c.id] = c; };
  add(mk('欢迎使用创作助手 🪄', sec('便签'), origin.x, origin.y, [
    '这是一个画板式的剧本创作空间：',
    '• 双击空白处，在此新建一张便签卡',
    '• 拖动卡片任意摆放，拖动四角任意缩放',
    '• 选中卡片后，拖动边缘的 ● 锚点，与其他卡片连线',
    '• 双击卡片正文进入富文本编辑（支持标题/表格/图片）',
  ], 340, 240));
  add(mk('✨ 常用快捷键', sec('便签'), origin.x + 380, origin.y + 30, [
    '空格 + 拖拽：平移画布',
    'Ctrl + 滚轮：缩放画布',
    'Ctrl+C / V / D：复制 / 粘贴 / 复制卡片',
    'Ctrl+Z / Y：撤销 / 重做',
    'Delete：删除选中卡片或连线',
    'Ctrl+A：全选',
  ], 320, 220));
  add(mk('💡 从模板开始', sec('便签'), origin.x + 760, origin.y + 60, [
    '右侧「灵感」面板里有大量现成模板：',
    '世界观设定卡、重要角色卡、章节卡、等级表……',
    '一键插入画布，像搭积木一样拼出你的故事。',
    '灵感生成器可以随机产出名字、剧情钩子、世界观种子。',
  ], 320, 220));
  add(mk('🌐 局域网协同', sec('便签'), origin.x + 380, origin.y + 290, [
    '在同一 Wi-Fi 下：',
    '1. 一台电脑运行 npm start，其他人浏览器访问其局域网地址',
    '2. 在「设置 → 协同」中连接服务器并上传项目',
    '3. 协作者打开同一项目，即可实时看到彼此的编辑与光标',
  ], 340, 220));
  return cards;
}

// ---------- 灵感生成器 ----------
const CULTURES = Object.keys(namePools);
export function genName(cultureHint?: string): { name: string; culture: string } {
  const hint = (cultureHint || '').trim();
  const culture = CULTURES.find((c) => hint.includes(c)) || pick(CULTURES);
  const pool = namePools[culture];
  const name = pick(pool.surnames) + pick(pool.given);
  return { name, culture };
}

export function genHook(): string {
  return `${pick(hookParts.人物)}，目标是${pick(hookParts.目标)}，但${pick(hookParts.阻碍)}。关键反转：${pick(hookParts.反转)}`;
}

export function genWorld(): string {
  return pick(worldSeeds);
}

export function genCharacter(): string[] {
  const { name } = genName();
  return [
    `姓名：${name}`,
    `性格：${pick(traits.性格)}`,
    `爱好：${pick(traits.爱好)}`,
    `缺点：${pick(traits.缺点)}`,
    `秘密：${pick(traits.秘密)}`,
  ];
}

export function genEvent(): string {
  return pick(eventSeeds);
}
const PLACE_NAMES = [
  '雾城', '星港', '灰塔', '月湾', '风谷', '雪镇', '霞关', '云台', '石桥', '灯塔',
  '旧港', '白桦林', '回声谷', '落日镇', '晨星镇', '夜泊城', '霜落村', '虹桥', '铜钟镇', '青石巷',
];
const ITEM_NAMES = [
  '怀表', '指南针', '羽毛笔', '旧皮箱', '贝壳', '玻璃瓶', '童话书', '戒指', '针线', '保温杯',
  '收音机', '放大镜', '印章', '许愿硬币', '哨子', '八音盒', '日历', '天平', '雨伞', '钥匙',
];

export function genItem(): string {
  return pick(ITEM_NAMES);
}
export function genPlace(): string {
  return pick(PLACE_NAMES);
}
export function genQuest(): string {
  return pick(questSeeds);
}
export function genDialogue(): string {
  return pick(dialogueLines);
}

export function genTitle(): string {
  const a = pick(['雾中', '永夜', '盛夏', '灰烬', '星尘', '锈蚀', '无声', '逆光', '深海', '纸鸢', '第九', '未竟']);
  const b = pick(['信使', '钟楼', '剧场', '约定', '名单', '诗篇', '王座', '谜题', '回声', '列车', '花园', '誓言']);
  const c = pick(['', '', '', '', '', '物语', '编年史', '手札']);
  return `${a}${b}${c}`;
}

export function genCardIdeas(count: number, title?: string): string[] {
  let pool = inspirationSamples;
  if (title) {
    const t = title.trim();
    const exact = inspirationSamples.filter((sm) => sm.title === t);
    if (exact.length) {
      pool = exact;
    } else {
      // 去掉“名场面：”“范例：”等前缀后，尝试按标题关键词匹配
      const key = t.replace(/^.+[：:]\s*/, '').trim() || t;
      const related = inspirationSamples.filter(
        (sm) => sm.title.includes(key) || key.includes(sm.title) || sm.body.some((line) => line.includes(key))
      );
      if (related.length) pool = related;
    }
  }
  return pickN(pool, Math.min(count, pool.length)).map((sm) => sm.body.join('\n') || sm.title);
}

/** 按灵感文库标题找到对应默认文本，并参考模板做法把带“标签：”的句子随机化 */
export function randomizeInspirationText(title: string): string[] {
  const t = (title || '').trim();
  let sample = inspirationSamples.find((sm) => sm.title === t);
  if (!sample) {
    const key = t.replace(/^.+[：:]\s*/, '').trim() || t;
    sample = inspirationSamples.find(
      (sm) => sm.title.includes(key) || key.includes(sm.title) || sm.body.some((line) => line.includes(key))
    );
  }
  const source = sample || pick(inspirationSamples);
  return source.body.map((line) => {
    const m = line.match(/^([^：:]{1,14})[：:]\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      const original = m[2].trim();
      const value = tryRandomFieldValue(label) ?? original;
      return `${label}：${value}`;
    }
    return line;
  });
}

export { cardTemplates, inspirationSamples, dialogueLines, TEMPLATE_BOARD_KEYS };

/** 模板 → 可插入的卡片 */
export function templateToCard(tpl: (typeof cardTemplates)[number], sectionId: string, pos: { x: number; y: number }): Card {
  const now = Date.now();
  const doc = fieldsToDoc(tpl.fields);
  if (tpl.sample) {
    doc.content = [...(doc.content || []), { type: 'paragraph' }, ...tpl.sample.split('\n').map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))];
  }
  return {
    id: uid('card'),
    kind: 'note',
    sectionId,
    title: tpl.title,
    content: doc,
    x: pos.x,
    y: pos.y,
    w: 240,
    h: 340,
    z: 1,
    paper: 'a4',
    templateKey: tpl.key,
    createdAt: now,
    updatedAt: now,
  };
}


const lastRandomByTemplate = new Map<string, string>();

function tryRandomFieldValue(label: string): string | undefined {
  const L = label;
  if (L.includes('姓名') || L.includes('名字')) return genName().name;
  if (L.includes('年龄')) return String(randInt(14, 65));
  if (L.includes('身份') || L.includes('职业')) return pick(['邮差', '侦探', '骑士', '法师', '医生', '教师', '商人', '佣兵', '图书管理员', '旅店老板']);
  if (L.includes('外貌')) return pick(['高瘦，常穿旧风衣', '眼神锐利，左眉有一道疤', '总是戴着一顶旧帽子', '笑容温和但很少说话', '银发，瞳色很浅', '手上有很多细小伤痕']);
  if (L.includes('性格')) return pick(['外冷内热', '怕麻烦但心软', '固执又温柔', '表面开朗内心敏感', '谨慎多疑却重情义', '嘴硬心软']);
  if (L.includes('弱点') || L.includes('软肋')) return pick(['无法拒绝别人求助', '害怕黑暗', '容易心软', '太相信熟人', '不善表达', '对过去耿耿于怀']);
  if (L.includes('目标') || L.includes('动机')) return pick(['寻找失散的家人', '洗清不白之冤', '守护重要的人', '完成未竟的约定', '逃离过去的阴影', '证明自己的价值']);
  if (L.includes('背景') || L.includes('故事')) return genCharacter().join('；');
  if (L.includes('世界') || L.includes('世界观')) return genWorld();
  if (L.includes('事件')) return genEvent();
  if (L.includes('道具') || L.includes('物品')) return genItem();
  if (L.includes('地名') || L.includes('地图')) return genPlace();
  if (L.includes('任务') || L.includes(' quest')) return genQuest();
  if (L.includes('台词') || L.includes('对白')) return genDialogue();
  if (L.includes('标题') || L.includes('作品名')) return genTitle();
  if (L.includes('章') || L.includes('情节') || L.includes('冲突') || L.includes('钩子') || L.includes('结局')) return genHook();
  // 灵感文库常用标签：尽量用现有随机素材填充，保持模板式随机效果
  if (L.includes('对白') || L.includes('台词') || L.includes('回答') || L.includes('对方说') || L.includes('说')) return genDialogue();
  if (L.includes('反转') || L.includes('悬念') || L.includes('铺垫') || L.includes('伏笔') || L.includes('结尾') || L.includes('收尾')) return genHook();
  if (L.includes('开场') || L.includes('第一句') || L.includes('开局') || L.includes('冷开场')) return genHook();
  if (L.includes('转场') || L.includes('时间')) return genEvent();
  if (L.includes('环境') || L.includes('空城') || L.includes('天气')) return genWorld();
  if (L.includes('动作') || L.includes('剑斗') || L.includes('攻城') || L.includes('大场面')) return genEvent();
  if (L.includes('人物') || L.includes('登场') || L.includes('角色')) return genCharacter().join('；');
  if (L.includes('情绪') || L.includes('不舍') || L.includes('告别') || L.includes('独白')) return genDialogue();
  if (L.includes('甜宠') || L.includes('浪漫')) return genDialogue();
  if (L.includes('原则') || L.includes('要点') || L.includes('进阶')) return pick([
    '用动作代替形容词，让细节代替感叹号',
    '先接住情绪，再给具体细节，最后落到行动',
    '让读者比角色多知道一点点，又比真相少知道很多',
    '自然到不显眼、具体到可回忆、克制到不解释',
  ]);
  return undefined;
}

function randomFieldValue(label: string): string {
  return tryRandomFieldValue(label) ?? genHook();
}

/** 模板 → 随机生成内容的卡片（带 templateKey，卡片上可再次随机） */
export function templateToCardRandom(tpl: (typeof cardTemplates)[number], sectionId: string, pos: { x: number; y: number }): Card {
  const values = tpl.fields.map((f) => randomFieldValue(f.label));
  const sig = tpl.key + '|' + values.join('|');
  // 避免连续两次生成完全一样的内容
  if (lastRandomByTemplate.get(tpl.key) === sig) {
    const again = tpl.fields.map((f) => randomFieldValue(f.label));
    values.splice(0, values.length, ...again);
  }
  lastRandomByTemplate.set(tpl.key, tpl.key + '|' + values.join('|'));
  const doc = fieldsToDoc(tpl.fields.map((f, i) => ({ ...f, sample: values[i] })));
  return {
    id: uid('card'),
    kind: 'note',
    sectionId,
    title: tpl.title,
    content: doc,
    x: pos.x,
    y: pos.y,
    w: 240,
    h: 340,
    z: 1,
    paper: 'a4',
    templateKey: tpl.key,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 空便签卡 */
export function stickyNote(sectionId: string, pos: { x: number; y: number }): Card {
  const now = Date.now();
  return {
    id: uid('card'),
    kind: 'note',
    sectionId,
    title: '',
    content: emptyDoc(),
    x: pos.x,
    y: pos.y,
    w: 220,
    h: 312,
    z: 1,
    paper: 'a4',
    color: '#fff8b8',
    createdAt: now,
    updatedAt: now,
  };
}
