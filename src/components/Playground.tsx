/**
 * ============ 娱乐场 · Playground（v2 · 接 AI + 本地规则引擎） ============
 * · 定位：把画布卡片当积木做低门槛二次开发/脑洞的游乐场。
 * · 玩法：
 *     1) Mix 碰撞台 —— 多张卡撞剧情脑洞
 *     2) Skin 换皮预览—— 同一坨设定换 RPG/GAL/分镜 三种容器
 *     3) Dice 点子骰子 —— 随机抽设定 + 随机「如果…会怎样」
 * · 生成结果 =「AI 优先」：settings.ai 已启用则把素材全文件 + 玩法 + 用户规则发给模型；
 *   AI 未配/失败/超时 → 自动降级到本地规则引擎（读懂卡片结构线索再套骨架，非瞎套）。
 * · 规则折叠面板：主题偏向/长度/绕开元素——同时约束 AI intent 与本地兜底。
 * · 结果可「另存为画布便签」（addCard 写回）。
 * · 挂载沿用 HelpModal 通道：常驻组件读 modal==='playground' 渲染。
 */
import { useMemo, useRef, useState } from 'react';
import { useStudio } from '../store';
import { FlaskIcon, GearColorIcon, PuzzleIcon, EyeIcon, PaintbrushIcon, PencilIcon, LockColorIcon, SparkleIcon, FlashIcon, DiceIcon, CheckIcon, SaveIcon, FolderIcon, ExclaimIcon, PinColorIcon, TalkIcon, CloseIcon, RobotIcon, ImportIcon, BrainIcon, BoxIcon } from './icons';
import { ModalShell } from './Modals';
import type { Card, ProjectType } from '../types';
import { randInt, truncate, pick } from '../util';
import { docToHtml, textToDoc } from '../tiptap';
import { aiChatOnce } from '../aiChat';
import { SPARK_BUTTONS, SPARK_DIRECTIONS } from '../sparkButtons';
import { genName } from '../defaults';

/* ============================================================
 * 素材 纯文本/结构化 解析
 * ============================================================ */
function plainOf(doc: Card['content']): string {
  if (!doc) return '';
  try {
    const html = docToHtml(doc);
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/[ \t]+/g, ' ')
      .trim();
  } catch { return ''; }
}
/** 标签短文本（供左侧 chip title） */
function cardText(card: Card): string {
  const t = (card.title || '').trim();
  const plain = plainOf(card.content);
  return (t ? t + (plain ? ' / ' + plain : '') : plain) || '（空白卡）';
}
/** 结构线索：事件类型/伏笔/日期等（本地规则引擎用） */
function cardSignals(card: Card): string {
  const s: string[] = [];
  const et = card.evType
    ? ({ main: '主线事件', side: '支线事件', daily: '日常', seed: '伏笔' } as Record<string, string>)[card.evType] || card.evType
    : undefined;
  if (et) s.push(et);
  if (card.tags && card.tags.length) s.push('标签:' + card.tags.join('/'));
  if (card.date) s.push('排期' + card.date + (card.time ? ' ' + card.time : ''));
  if (card.payDate) s.push('伏笔回收点:' + card.payDate);
  return s.join('，');
}

/** 规则引擎 vs AI 公用的「素材卷宗」（含正文，供模型读懂） */
function dossier(materials: Card[], secName: (id: string) => string, textMax = 1400): string {
  if (!materials.length) return '（画布暂无卡片，可先加一些便签/角色/事件卡再玩）';
  return materials
    .map((c, i) => {
      const head = `${i + 1})「${c.title || '未命名'}」`;
      const sec = c.sectionId ? secName(c.sectionId) : '';
      const sig = cardSignals(c);
      const body = truncate(plainOf(c.content) || '', textMax);
      const meta = [sec, sig, c.kind === 'image' ? '(这张主要是图片)' : ''].filter(Boolean).join('｜');
      return `${head}${meta ? '　[' + meta + ']' : ''}\n${body}`;
    })
    .join('\n\n');
}

/* ============================================================
 * 本地规则引擎（读懂素材 → 挑骨架套用，非瞎套）
 * ============================================================ */
export type GenreId = '悬疑推理' | '都市情感' | '古风权谋' | '科幻奇想' | '玄幻仙侠' | '现实成长' | '轻喜甜系' | '惊悚暗黑';
export type DeviceId = '反转' | '伏笔回收' | '双线并行' | '倒叙' | '身份错位' | '误会错过' | '倒计时' | '反讽';
export type ToneId = '轻盈' | '浓烈' | '冷峻' | '温情' | '黑色幽默' | '治愈';
export type PovId = '上帝全知' | '主角限知' | '群像多线';
export type LenId = '金句' | '小段' | '成段';
export type VoiceId = '平实' | '华丽修辞' | '冷幽默短句' | '留白含蓄';

/** 专业创作规则集：分组对应 题材/叙事装置/情绪/篇幅/语风 + 文字约束 */
export interface PlayRules {
  /** 主打题材（单选） */
  genre: GenreId;
  /** 叙事装置/钩子（多选 ≤3） */
  device: DeviceId[];
  /** 叙述视角 */
  pov: PovId;
  /** 情绪基调（多选） */
  tone: ToneId[];
  /** 篇幅密度 */
  len: LenId;
  /** 语风 */
  voice: VoiceId;
  /** 必须保留/体现的元素词（换行分隔，生成时必须覆盖） */
  must: string;
  /** 禁区：不得引入的元素词（换行分隔） */
  avoid: string;
}
export const DEFAULT_RULES: PlayRules = {
  genre: '现实成长', device: ['反转'], pov: '主角限知', tone: ['浓烈'],
  len: '小段', voice: '平实', must: '', avoid: '',
};

/** 把规则文字（must/avoid）按分隔符拆成非空词条 */
function splitRuleWords(s: string): string[] {
  return s.trim().split(/[\n,，、;；。\s]+/).map((x) => x.trim()).filter(Boolean);
}

/** 从材料卡里随机抽若干结构线索词，让本地脑洞更贴设定 */
function localHint(mat: Card[], n: number): string[] {
  const out: string[] = [];
  const txt = mat.map((c) => cardText(c)).filter((x) => x && x !== '（空白卡）');
  for (let k = 0; k < n; k++) if (txt.length) out.push(pick(txt));
  return out;
}

/** 长度约束：决定尾巴细节数 */
function tailByLen(rule: PlayRules): number {
  return rule.len === '金句' ? 1 : rule.len === '小段' ? 3 : 5;
}
/** 语风对应本地措辞倾向的“呈现微调”（仅影响少量词，不重写文案） */
function voiceFlavor(rule: PlayRules): string {
  return rule.voice === '华丽修辞' ? '，多一分意象与画面感'
    : rule.voice === '冷幽默短句' ? '，用短句带一点冷幽默的机锋'
    : rule.voice === '留白含蓄' ? '，话别说满，点到为止留余味'
    : '';
}

/** 检查一段本地结果是否踩到“绕开元素”，踩到则返回 true */
function hitAvoid(text: string, rule: PlayRules): boolean {
  return splitRuleWords(rule.avoid).some((w) => text.includes(w));
}
/** 检查一段结果是否漏掉了“必保留元素”，漏则返回 true */
function missMust(text: string, rule: PlayRules): boolean {
  const ws = splitRuleWords(rule.must);
  return !!ws.length && !ws.every((w) => text.includes(w));
}

/** 生成一条“专业规则简报”，AI system 与展示都能用 */
function genRulesBrief(rule: PlayRules): string {
  const dev = rule.device.join('、') || '（未指定，可自由发挥）';
  const tone = rule.tone.join('、') || '中性';
  const lines = [
    `🎯题材：${rule.genre}`,
    `🎞视角：${rule.pov}`,
    `🧩叙事装置：${dev}`,
    `🌈基调：${tone}`,
    `✍️语风：${rule.voice}`,
    splitRuleWords(rule.must).length ? `🔒必保留：${rule.must}` : '',
    splitRuleWords(rule.avoid).length ? `🚫禁区：${rule.avoid}` : '',
  ].filter(Boolean);
  return lines.join('｜');
}

/** 把“必保留元素”织回本地结果（尽力而为，织不上就原样返回） */
function weaveMust(lines: string[], rule: PlayRules): string[] {
  const words = splitRuleWords(rule.must);
  if (!words.length) return lines;
  const joined = lines.join('\n');
  const uncovered = words.filter((w) => !joined.includes(w));
  if (!uncovered.length) return lines;
  // 在尾行自然带出未覆盖词（作为延续线索，不破坏原有结构）
  const ev = uncovered.map((w) => `「${w}」`).join('与');
  return [...lines, `→ 让${ev}也在暗处发力，别只是背景板。`];
}

/** 1) 本地碰撞台（按 题材/装置/视角 编排，非模板式套话） */
function localMix(materials: Card[], rule: PlayRules): string[] {
  if (!materials.length) return [];
  const A = cardText(materials[0]);
  if (materials.length === 1) return [`把「${A}」单独拎出来当引子——从它最没被讲透的一句往下挖，能长出支线吗？`];
  const B = cardText(materials[1]);
  const rest = materials.slice(2);
  const K = localHint(materials, 2);
  const vf = voiceFlavor(rule);
  const lines: string[] = [`💥 碰撞脑洞：「${A}」撞上「${B}」`];

  // —— 按叙事装置出招（优先用户勾选的装置）——
  const has = (d: DeviceId) => rule.device.includes(d);
  const beats: string[] = [];
  if (has('反转')) beats.push(`→ 反转：最先认定「${A}」是凶手/源头的直觉是错的，真正的局在别处。`);
  if (has('伏笔回收')) beats.push(`→ 伏笔：让 ${A} 里一句曾被忽略的细节，在撞上 ${B} 后被回收到明处。`);
  if (has('双线并行')) beats.push(`→ 双线：${A} 的故事与 ${B} 的故事本不在同一条时间线上，交点一出现，真相被重写。`);
  if (has('倒叙')) beats.push(`→ 倒叙：先从结局的某个“第二次”开始写，倒回去看两人第一次见面埋了什么雷。`);
  if (has('身份错位')) beats.push(`→ 身份：其中一个真正要藏的，恰恰是被对方一眼看轻的那个身份。`);
  if (has('误会错过')) beats.push(`→ 错过：两边都只差一句话就能解开，却都在等对方先开口。`);
  if (has('倒计时')) beats.push(`→ 倒计时：这个选择有个硬期限，错过节点就永远补不回来。`);
  if (has('反讽')) beats.push(`→ 反讽：A 想守住「${B}」的方式，恰恰在亲手把 ${B} 推远。`);
  // 无指定装置时补两记通用推进
  if (!beats.length) {
    beats.push(`→ A 想要的恰好把 B 在乎的堵死；B 不明着拦，而是让第三方去试 A。`);
    if (rest.length) beats.push(`→ 把「${cardText(rest[0])}」也搅进来——真相永远比眼前多一层。`);
    if (K.length && rule.tone.some((t) => t === '浓烈' || t === '温情')) beats.push(`→ 而这一切的底色，藏着对「${K[0]}」没说出口的在意。`);
  }

  const want = tailByLen(rule) + 1;
  for (let i = 0; i < want && i < beats.length; i++) lines.push(beats[i]);
  // 题材开调味（仅加一句别具一格的推进）
  if (rule.genre === '悬疑推理' && rest.length && !rule.device.includes('反转')) lines.push(`→ 把「${cardText(rest[0])}」的证词也对一对——总有一个在撒谎。`);
  if (rule.genre === '玄幻仙侠' || rule.genre === '科幻奇想') lines.push(`→ 这一撞若发生在${rule.genre === '玄幻仙侠' ? '天地灵气失衡的关口' : '系统重启的前一夜'}，因果会如何偏移？`);
  const out = weaveMust(lines, rule);
  const bIdx = out.findIndex((l) => l.startsWith('→'));
  if (vf && bIdx >= 0) out[bIdx] = out[bIdx] + vf;
  return out;
}

/** 2) 本地换皮 */
function localReskin(materials: Card[], skin: string, rule: PlayRules): string[] {
  if (!materials.length) materials = [{ title: '素材', content: null } as Card];
  const fr = (s: Card) => cardText(s).slice(0, rule.len === '金句' ? 18 : 30);
  const body = materials.map(fr).join('；');
  const hero = fr(materials[0]);
  const second = materials[1] ? fr(materials[1]) : 'ta';
  if (skin === 'rpg') {
    return [
      '🎮 RPG 旁白 · ' + (rule.len === '金句' ? '一句' : '预览'),
      `【系统】附近出现了一股未名的执念……\n> ${body}`,
      `【提示】这股执念需要一个选择，它将改写你与「${hero}」的关系。`,
    ];
  }
  const rev = rule.device.includes('反转');
  const mis = rule.device.includes('误会错过');
  if (skin === 'gal') {
    const lines = [
      '💘 GAL 选项 · ' + (rule.len === '金句' ? '一句' : '预览'),
      `（你面前是 ${body}）`,
      `◆ Ａ：直接问「${second}」到底想要什么。`,
      `◆ Ｂ：先装没看见，去打听「${second}」真正的顾虑。`,
    ];
    if (rev) lines.push(`◆ Ｃ：把一切摊牌——却发现「${second}」等的正是这一刻。`);
    else if (mis) lines.push(`◆ Ｃ：干脆不再试探，把话放到桌面上——可彼此都慢了半拍。`);
    else lines.push(`◆ Ｃ：把这一切摊牌，赌一把真心。`);
    if (rule.pov === '群像多线') lines.splice(1, 0, `（另一条线里，有人正从旁看完这一切。）`);
    return weaveMust(lines, rule);
  }
  const lines = [
    '🎬 分镜脚本 · ' + (rule.len === '金句' ? '一句' : '预览'),
    `【场景】${body}`,
    `【镜头1】特写「${hero}」犹豫的眼神。`,
    `【镜头2】闪回某句没说出口的约定。`,
    `【镜头3】她抬头直视：『你听见我了吗？』`,
  ];
  if (rev) lines.push(`【跳切】一个此前从未给过正脸的旁观者，突然成了画面的中心。`);
  if (rule.pov === '主角限知')
    return weaveMust(lines.map((l) => (l.startsWith('【镜头3】') ? `【镜头3】我从她眼神里读出一个她不会承认的答案。` : l)), rule);
  if (rule.pov === '群像多线')
    return weaveMust(lines.map((l) => (l.startsWith('【镜头3】') ? `【镜头3】(切另一条线)有人在她看不见处，轻轻合上了一本笔记。` : l)), rule);
  return weaveMust(lines, rule);
}

/** 3) 本地点子骰子 */
const WHAT_IFS = [
  '如果今天的某个决定整盘推翻重来，故事会少掉或多长出什么？',
  '如果这两个设定其实是同一件事的两种说法？',
  '如果最稳的那个角色忽然失控一整天？',
  '如果这段剧情搬到相反地点重演，张力会不会更足？',
  '如果主角一开始就误会了目标，会一路怎么错下去？',
  '如果把这个伏笔现在就引爆（非留到终章）？',
  '如果换个阵营视角，谁会觉得理直气壮？',
  '如果这个世界从无「巧合」、偶遇全是安排？',
  '如果把时间轴倒着推（先结局再倒推），会挖出什么缺口？',
  '如果外来规则撞上你的设定，谁先崩？',
];
const DEVICE_IFS: Record<DeviceId, string[]> = {
  反转: ['如果让“真相”在最后才翻面，前面哪句误导最见效？', '如果最无辜的那个才是操盘者？'],
  伏笔回收: ['如果现在就把这条伏笔的引信点燃，会牵连几件事？', '哪句“随口一提”最可能是被埋下的钩子？'],
  双线并行: ['如果两条时间线其实早已连在一起，谁先发现？', '把这段拆给两个视角分别讲，哪半更难写？'],
  倒叙: ['如果先给结局，再倒着交代，观众会先误会谁？', '从“最后一次”写起，回到“第一次”时惊喜在哪？'],
  身份错位: ['如果ta一直顶着的身份是借来的，什么场合会崩？', '让最被低估的一个人亮出真实身份，谁最慌？'],
  误会错过: ['如果这场误会再多拖一集，还收得回来吗？', '把那句没说出口的话放在最不该说的时刻说出口？'],
  倒计时: ['如果给这个决定加上一个硬期限，会逼出什么？', '倒计时的尽头是救赎还是又一次告别？'],
  反讽: ['如果ta为守护而做的一切，正把想留的人推远？', '用最在意的人逼出最不情愿的选择？'],
};
function localDice(materials: Card[], rule: PlayRules): string[] {
  const sel = materials.filter((c) => c.evType === 'seed'); // 优先伏笔
  if (!materials.length) materials = sel;
  const pool = (materials.length ? materials : sel).map((c) => truncate(cardText(c), 30)).filter(Boolean);
  if (!pool.length) pool.push('画布上现存的内容');
  const need = Math.min(randInt(1, 2), pool.length);
  const got: string[] = [];
  while (got.length < need) got.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const out: string[] = ['🎲 掷到「' + got.join('、') + '」'];
  // 命中的装置优先给对应“如果”，没有再随机
  const tilts = rule.device.map((d) => (DEVICE_IFS[d] || []).filter((x) => !out.join('\n').includes(x))).flat();
  out.push('🪄 如果……会怎样：', '　　' + (tilts.length ? pick(tilts) : pick(WHAT_IFS)));
  if (rule.genre === '悬疑推理') out.push('　　（当心：这枚点子若接不住，就把它“留到终章再翻”。）');
  return weaveMust(out, rule);
}

/* ============================================================
 * AI prompt 组装
 * ============================================================ */
/** 把规则编译成专业 system 提示（题材/视角/装置/基调/语风/长度/约束全注入） */
function buildAISystem(rule: PlayRules): string {
  const lenTip = rule.len === '金句' ? '只给一两句有力金句。' : rule.len === '小段' ? '给一小段（3~6 句）。' : '给成段但克制、可起稿的一段。';
  const brief = genRulesBrief(rule);
  const must = splitRuleWords(rule.must);
  const avoid = splitRuleWords(rule.avoid);
  return [
    '你是网文/影视创作者的脑洞文案搭档。请“读懂”用户给出的画布素材，再按玩法要求在里面找化学反应，严格照“专业规则”产出：贴设定、有细节、可直接当种子落地。',
    '铁律：1) 不得违背素材已有设定；2) 除非确有必要并标注“可新增”，不擅造新人物/地名；3) 素材里标过“伏笔回收点”的，别提前剧透引爆（除非该玩法本就要你引爆）；4) 具体、像真人推演，别空话套话。',
    '【专业规则】' + brief,
    `【篇幅】${lenTip}`,
    must.length ? '【硬性必保留】以下元素必须在结果里出现/被准确体现，一条都不能漏：' + must.join('、') : '',
    avoid.length ? '【禁区】绝不引入这些元素：' + avoid.join('、') : '',
  ].filter(Boolean).join('\n');
}

/* ============================================================
 * 组件
 * ============================================================ */
const SKINS = [
  { id: 'rpg', label: '🎮 RPG 旁白' },
  { id: 'gal', label: '💘 GAL 选项' },
  { id: 'film', label: '🎬 分镜脚本' },
];
type TabId = 'mix' | 'skin' | 'dice' | 'spark';
/** 娱乐场玩法视图（tab 切换） */
type PgView = 'mix' | 'skin' | 'dice' | 'spark';
/** 可展开收起的工具面板（全屏独占主体区）：规则 / 素材，null = 显示玩法 */
type PgPane = 'rules' | 'mat' | null;
const GENRES: GenreId[] = ['悬疑推理', '都市情感', '古风权谋', '科幻奇想', '玄幻仙侠', '现实成长', '轻喜甜系', '惊悚暗黑'];
const DEVICES: DeviceId[] = ['反转', '伏笔回收', '双线并行', '倒叙', '身份错位', '误会错过', '倒计时', '反讽'];
const TONES: ToneId[] = ['轻盈', '浓烈', '冷峻', '温情', '黑色幽默', '治愈'];
const POVS: PovId[] = ['上帝全知', '主角限知', '群像多线'];
const LENS: LenId[] = ['金句', '小段', '成段'];
const VOICES: VoiceId[] = ['平实', '华丽修辞', '冷幽默短句', '留白含蓄'];

export default function Playground() {
  const modal = useStudio((s) => s.modal);
  const setModal = useStudio((s) => s.setModal);
  const cards = useStudio((s) => s.cards);
  const sections = useStudio((s) => s.sections);
  const secName = (id: string) => (sections.find((x) => x.id === id)?.name || '');
  const aiSet = useStudio((s) => s.settings.ai);
  const aiEnabled = aiSet.enabled && !!aiSet.endpoint.trim();
  const projectType = useStudio((s) => s.meta?.type || 'custom');

  // —— 灵感 点子伪卡（可勾选素材，不入画布直到点保存）——
  const [sparks, setSparks] = useState<Card[]>([]);

  const [view, setView] = useState<PgView>('mix');
  const [pane, setPane] = useState<PgPane>(null);          // 工具面板展开（规则/素材），null=玩法
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<TabId | null>(null);      // 正在生成（AI 在跑）
  const [mode, setMode] = useState<'auto' | 'local'>('auto'); // auto=AI优先; local=只本地
  const [rules, setRules] = useState<PlayRules>(DEFAULT_RULES);
  const [mixOut, setMixOut] = useState<string[] | null>(null);
  const [mixSrc, setMixSrc] = useState<'ai' | 'local' | null>(null);
  const [skinIdx, setSkinIdx] = useState('rpg');
  const [skinOut, setSkinOut] = useState<string[] | null>(null);
  const [skinSrc, setSkinSrc] = useState<'ai' | 'local' | null>(null);
  const [diceOut, setDiceOut] = useState<string[] | null>(null);
  const [diceSrc, setDiceSrc] = useState<'ai' | 'local' | null>(null);
  const [savedN, setSavedN] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // —— 画布素材列表：搜索 + 分区折叠（素材多时更好操作）——
  const [matQ, setMatQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // 已折叠的分区（默认全部展开）

  const matEntries = useMemo(
    () =>
      Object.values(cards)
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        .map((c) => ({ c, label: truncate(cardText(c), 22) })),
    [cards],
  );
  const sparkEntries = useMemo(
    () => [...sparks].reverse().map((c) => ({ c, label: truncate(cardText(c), 26) })),
    [sparks],
  );

  // —— 素材多时的可操作视图：按关键词过滤 + 按分区聚合 ——
  const q = matQ.trim().toLocaleLowerCase();
  const secOf = (c: Card) => sections.find((x) => x.id === c.sectionId)?.name || '未分区';
  const matPool = matEntries.filter((e) => !q || e.label.toLocaleLowerCase().includes(q) || e.c.title.toLocaleLowerCase().includes(q) || secOf(e.c).toLocaleLowerCase().includes(q));
  const secGroups: { name: string; items: typeof matEntries }[] = [];
  {
    const order: string[] = [];
    const map = new Map<string, typeof matEntries>();
    for (const e of matPool) {
      const n = secOf(e.c);
      if (!map.has(n)) { map.set(n, []); order.push(n); }
      map.get(n)!.push(e);
    }
    for (const n of order) secGroups.push({ name: n, items: map.get(n)! });
  }
  const toggleSec = (name: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const matClearFilter = () => setMatQ('');

  if (modal !== 'playground') return null;

  const toggle = (id: string) =>
    setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** 全部可行素材 = 画布卡 + 灵感点子（共用同一份 sel / 引擎） */
  const candidates = (): Card[] => [...Object.values(cards), ...sparks];

  /** 取当前玩法会用到的素材集：优先勾选，否则画布文字卡 + 灵感点子 */
  const pickMat = () => {
    const chosen = candidates().filter((c) => sel.has(c.id));
    if (chosen.length) return chosen.slice(0, 6);
    return candidates().filter((c) => c.kind !== 'image' || (c as { imageSrc?: string }).imageSrc).slice(0, 6);
  };

  // —— 灵感：点子生成后收纳为“左侧可勾选素材”（点在子卡上点保存 才真正上画布）——
  const pushSpark = (label: string, text: string) => setSparks((prev) => [sparkCard(label, text), ...prev].slice(0, 30));
  const genByType = (label: string, make: () => string) => {
    let text: string;
    try { text = make(); } catch { text = '（再点一次试试）'; }
    pushSpark(label, text);
  };
  const genNameDir = (dir: string) => {
    let text: string;
    try {
      const g = dir === '随机' ? genName() : genName(dir);
      text = `${g.name}（${g.culture}方向）`;
    } catch { text = '（再点一次试试）'; }
    pushSpark(dir, text);
  };
  const dropSpark = (id: string) => setSparks((prev) => prev.filter((x) => x.id !== id));
  const clearSparks = () => {
    setSparks([]);
    setSel((prev) => { const n = new Set(prev); sparks.forEach((s) => n.delete(s.id)); return n; });
  };
  const saveSpark = (c: Card) => { persistSpark(c); dropSpark(c.id); setSavedN((n) => n + 1); };

  /** 统一执行：能 AI 就用 AI，否则本地 */
  const doGen = async (
    which: TabId,
    kind: 'mix' | 'skin' | 'dice',
    aiPrompt: string,
    local: () => string[],
    setOut: (l: string[]) => void,
    setSrc: (s: 'ai' | 'local') => void,
    needSel = 2,
  ) => {
    if (busy) return;
    if (kind === 'mix') {
      const cands = candidates();
      const avail = (sel.size ? cands.filter((c) => sel.has(c.id)) : cands).filter((c) => c.kind !== 'image').length;
      if (avail < needSel) return; // 素材不足 2 张，无法碰撞
    }
    setBusy(which);
    setOut([]);
    if (mode === 'auto') {
      // AI 先来，最多两次：绕过禁区/漏必保都判不合格并重试，之后落到本地
      let aim: string | null = null;
      let tries = 0;
      while (tries++ < 2) {
        const r = await aiChatOnce(buildAISystem(rules), aiPrompt, { timeoutMs: 90_000 });
        if (r && !hitAvoid(r, rules) && !missMust(r, rules)) { aim = r; break; }
      }
      if (aim) { setOut(aim.split('\n')); setSrc('ai'); setBusy(null); return; }
    }
    // —— 本地兜底（尺寸/禁区重试；必保由各玩法 weaveMust 尽力织入）——
    let res = local();
    let guard = 0;
    while ((hitAvoid(res.join('\n'), rules) || missMust(res.join('\n'), rules)) && guard++ < 4) res = local();
    setOut(AIutils.truncateLines(res, rules));
    setSrc('local');
    setBusy(null);
  };

  const runMix = () => doGen('mix', 'mix', mkMixAI(), () => localMix(pickMat(), rules), setMixOut, setMixSrc, 2);
  const runSkin = () => doGen('skin', 'skin', mkSkinAI(), () => localReskin(pickMat(), skinIdx, rules), setSkinOut, setSkinSrc, 0);
  const runDice = () => doGen('dice', 'dice', mkDiceAI(), () => localDice(pickMat(), rules), setDiceOut, setDiceSrc, 0);

  // ---- AI 描述构造 ----
  function mkMixAI(): string {
    const all = candidates();
    const mat = all.filter((c) => sel.has(c.id));
    const use = mat.length >= 2 ? mat : all.slice(0, 5);
    return `玩法：碰撞台。请选 2~4 张最有张力的卡片，碰撞出一条能当“剧情脑洞种子”的推演（可含冲突、伏笔、反转设问）。\n\n素材：\n${dossier(use, secName)}`;
  }
  function mkSkinAI(): string {
    const labels: Record<string, string> = { rpg: 'RPG 旁白', gal: 'GAL 恋爱选项', film: '电影分镜脚本' };
    const mat = pickMat();
    return `玩法：换皮预览。把下面这一点素材，用「${labels[skinIdx] || skinIdx}」的形式重写一版（保留设定骨架、可变体裁容器），看我适不适合往这个方向追。\n\n素材：\n${dossier(mat, secName)}`;
  }
  function mkDiceAI(): string {
    const all = candidates();
    const mat = all.filter((c) => sel.has(c.id));
    const use = mat.length ? mat : all;
    return `玩法：点子骰子。随机挑 1~2 个设定（优先伏笔/事件），再挑一句“如果…会怎样”抛出一个干净的灵感，点到为止、宁缺毋滥。\n\n素材池：\n${dossier(use, secName)}`;
  }

  const TabBtn = ({ id, l }: { id: PgView; l: React.ReactNode }) => (
    <button className={'pg-tab' + (view === id && !pane ? ' active' : '')} onClick={() => { setView(id); setPane(null); setBusy(null); }}>
      {l}
    </button>
  );
  /** 工具面板按钮：展开/收起 规则、素材（全屏独占主体区，可收起回玩法） */
  const PaneBtn = ({ id, l }: { id: PgPane; l: React.ReactNode }) => (
    <button className={'pg-tab' + (pane === id ? ' active' : '')} onClick={() => { setPane((p) => (p === id ? null : id)); setBusy(null); }}>
      {l}
    </button>
  );

  const busyLbl = (which: TabId) => (busy === which ? (mode === 'auto' ? '✨ 让 AI 想一下…' : '本地在想…') : '');

  return (
    <ModalShell
      title={<><FlaskIcon /> 娱乐场 · Playground</>}
      onClose={() => setModal(null)}
      className="pg-modal"
      headExtra={
        <div className="pg-tabs">
          <TabBtn id="mix" l={<><BoxIcon /> 碰撞台</>} />
          <TabBtn id="skin" l={<><PaintbrushIcon /> 换皮预览</>} />
          <TabBtn id="dice" l={<><DiceIcon /> 点子骰子</>} />
          <TabBtn id="spark" l={<><SparkleIcon /> 灵感</>} />
          <span className="pg-tabs-sep" />
          <PaneBtn id="rules" l={<><GearColorIcon /> 设置规则</>} />
          <PaneBtn id="mat" l={<><FolderIcon /> 选素材</>} />
        </div>
      }
    >
      <div className="pg-topbar">
        <span className={'pg-ai-badge' + (aiEnabled ? ' on' : '')}>
          {aiEnabled ? <><RobotIcon /> AI已就绪</> : <><ExclaimIcon /> 未配 AI（走本地规则引擎，仍可生成）</>}
        </span>
        <label className="pg-inline">
          <input type="checkbox" checked={mode === 'auto'} onChange={(e) => setMode(e.target.checked ? 'auto' : 'local')} />
          AI 优先
        </label>
        <span className="pg-hint">切换玩法 · 设置规则/选素材可收起</span>
      </div>

      <div className="pg-body">

      {pane === 'rules' && (
        <div className="pg-rules">
          <div className="pg-pane-head">
            <span className="pg-pane-title"><GearColorIcon /> 设置规则</span>
            <button className="pg-link" onClick={() => setPane(null)}>收起规则</button>
          </div>
          <div className="pg-rules-grid">
            <fieldset className="pg-fs">
              <legend><PinColorIcon /> 主打题材（单选）</legend>
              <div className="pg-opts">
                {GENRES.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.genre === x ? ' on' : '')}>
                    <input type="radio" name="pg-genre" checked={rules.genre === x} onChange={() => setRules((r) => ({ ...r, genre: x }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs">
              <legend><PuzzleIcon /> 叙事装置 · 钩子（可多选）</legend>
              <div className="pg-opts">
                {DEVICES.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.device.includes(x) ? ' on' : '')}>
                    <input type="checkbox" checked={rules.device.includes(x)} onChange={() =>
                      setRules((r) => ({ ...r, device: r.device.includes(x) ? r.device.filter((v) => v !== x) : [...r.device, x] }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs">
              <legend><EyeIcon /> 叙述视角（单选）</legend>
              <div className="pg-opts">
                {POVS.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.pov === x ? ' on' : '')}>
                    <input type="radio" name="pg-pov" checked={rules.pov === x} onChange={() => setRules((r) => ({ ...r, pov: x }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs">
              <legend><PaintbrushIcon /> 情绪基调（可多选）</legend>
              <div className="pg-opts">
                {TONES.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.tone.includes(x) ? ' on' : '')}>
                    <input type="checkbox" checked={rules.tone.includes(x)} onChange={() =>
                      setRules((r) => ({ ...r, tone: r.tone.includes(x) ? r.tone.filter((v) => v !== x) : [...r.tone, x] }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs">
              <legend><PencilIcon /> 语风（单选）</legend>
              <div className="pg-opts">
                {VOICES.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.voice === x ? ' on' : '')}>
                    <input type="radio" name="pg-voice" checked={rules.voice === x} onChange={() => setRules((r) => ({ ...r, voice: x }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs">
              <legend><TalkIcon /> 篇幅密度（单选）</legend>
              <div className="pg-opts">
                {LENS.map((x) => (
                  <label key={x} className={'pg-opt' + (rules.len === x ? ' on' : '')}>
                    <input type="radio" name="pg-len" checked={rules.len === x} onChange={() => setRules((r) => ({ ...r, len: x }))} />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pg-fs pg-fs-wide">
              <legend><PencilIcon /> 文字约束</legend>
              <div className="pg-constraint">
                <label className="pg-c-label"><LockColorIcon /> 必保留（须体现的元素）</label>
                <input className="pg-avoid" placeholder="如：那座钟楼 / 母亲的木匣 / 没有说出口的那句告别" value={rules.must}
                  onChange={(e) => setRules((r) => ({ ...r, must: e.target.value }))} />
              </div>
              <div className="pg-constraint">
                <label className="pg-c-label"><ExclaimIcon /> 禁区（绝不引入）</label>
                <input className="pg-avoid" placeholder="如：别写死某角色 …（多个用空格/逗号分隔）" value={rules.avoid}
                  onChange={(e) => setRules((r) => ({ ...r, avoid: e.target.value }))} />
              </div>
            </fieldset>
          </div>
          <div className="pg-rules-foot">
            <span className="pg-hint">规则同时约束 AI 与本地兜底 · 高亮 = 已勾选</span>
            <button className="pg-link" onClick={() => setRules(DEFAULT_RULES)}>恢复默认</button>
          </div>
        </div>
      )}

      {pane === 'mat' && (
        <div className="pg-shelf">
          <div className="pg-pane-head">
            <span className="pg-pane-title"><FolderIcon /> 选素材</span>
            <button className="pg-link" onClick={() => setPane(null)}>收起素材</button>
          </div>
          <div className="pg-group">
            <h4><BoxIcon /> 画布素材 <span className="pg-cnt">{matEntries.length}</span></h4>
            <div className="pg-matbar">
              <input className="pg-mat-search" value={matQ} placeholder="搜标题 / 分区…" onChange={(e) => setMatQ(e.target.value)} />
              {matEntries.length > 0 && !q && secGroups.length > 1 && (
                <button className="pg-link" onClick={() => {
                  setCollapsed(collapsed.size ? new Set() : new Set(secGroups.map((g) => g.name)));
                }}>{collapsed.size ? '全部展开' : '全部收起'}</button>
              )}
            </div>
            {matEntries.length === 0 && <div className="pg-empty">画布还没卡片，先加几张再玩～</div>}
            {matEntries.length > 0 && (
              <div className="pg-mat-secs">
                {q && (
                  <div className="pg-matbar2">
                    <span className="pg-hint">{q ? `共 ${matPool.length} 命中` : ''}</span>
                    <button className="pg-link" onClick={matClearFilter}>清除筛选</button>
                    {secGroups.length === 0 && <div className="pg-empty">没搜到“{matQ.trim()}”的素材</div>}
                  </div>
                )}
                {secGroups.map((g) => (
                  <div key={g.name} className="pg-sec">
                    <button
                      className="pg-sec-h"
                      onClick={() => toggleSec(g.name)}
                      title={collapsed.has(g.name) ? '展开此分区' : '收起此分区'}
                    >
                      <span className={'pg-sec-caret' + (collapsed.has(g.name) ? ' off' : '')}>▾</span>
                      <span className="pg-sec-name">{g.name}</span>
                      <span className="pg-cnt">{g.items.length}</span>
                    </button>
                    {!collapsed.has(g.name) && (
                      <div className="pg-shelf-list pg-sec-list">
                        {g.items.map(({ c, label }) => (
                          <button key={c.id} className={'pg-chip' + (sel.has(c.id) ? ' on' : '')} onClick={() => toggle(c.id)} title={cardText(c)}>
                            <span className="pg-chip-tick">{sel.has(c.id) ? '✓' : ''}</span>
                            <span className="pg-chip-label">{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pg-group pg-group-spark">
            <h4><SparkleIcon /> 灵感点子 <span className="pg-cnt">{sparkEntries.length}</span>
              {sparkEntries.length > 0 && (
                <button className="pg-link-inline" onClick={clearSparks} title="清空全部点子">清空</button>
              )}
            </h4>
            {sparkEntries.length === 0 ? (
              <div className="pg-sub pg-spark-hint">在 <b>⚡灵感</b> 页滚几枚点子，会落到这里当可勾选素材，喂给碰撞/换皮/骰子。</div>
            ) : (
              <>
                <div className="pg-shelf-list">
                  {sparkEntries.map(({ c, label }) => (
                    <div key={c.id} className={'pg-chip pg-chiprow' + (sel.has(c.id) ? ' on' : '')} onClick={() => toggle(c.id)} title={cardText(c)}>
                      <span className="pg-chip-tick">{sel.has(c.id) ? '✓' : ''}</span>
                      <span className="pg-chip-label">{label}</span>
                      <span className="pg-chip-act" onClick={(e) => e.stopPropagation()}>
                        <button className="pg-mini" onClick={() => saveSpark(c)} title="存为画布便签"><SaveIcon /></button>
                        <button className="pg-mini" onClick={() => dropSpark(c.id)} title="丢弃"><CloseIcon /></button>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pg-shelf-foot">
                  <span className="pg-hint">点子可与画布素材混勾，一起参与三种玩法</span>
                  <button className="pg-link" onClick={() => setSel(new Set())}>清空勾选</button>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {pane === null && (
        <div className="pg-stage" ref={boxRef}>
          {view === 'mix' && (
            <div className="pg-card">
              <h4><BoxIcon /> 碰撞台 <span className="pg-tip">2+ 张素材撞剧情脑洞</span></h4>
              <span className="pg-hint">{busy ? '' : ''}{busyLbl('mix')}</span>
              <button className="pg-go" disabled={!!busy || candidates().filter((c) => c.kind !== 'image').length < 2} onClick={runMix}>
                {busy === 'mix' ? '⋯' : (mode === 'auto' && aiEnabled ? <><SparkleIcon /> AI 碰撞</> : <><FlashIcon /> 本地碰撞</>)}{busy === 'mix' ? ' 想一下' : ''}
              </button>
              {mixOut && (
                <ResultBox
                  title={mixSrc === 'ai' ? '✨ AI 碰撞脑洞' : '💥 本地碰撞脑洞'}
                  lines={mixOut}
                  onSave={() => { saveAsNote('碰撞脑洞', mixOut); setSavedN((n) => n + 1); }}
                />
              )}
            </div>
          )}
          {view === 'skin' && (
            <div className="pg-card">
              <h4><PaintbrushIcon /> 换皮预览 <span className="pg-tip">同一坨设定换容器，看值不值得追</span></h4>
              <div className="pg-skins">
                {SKINS.map((s) => (
                  <button key={s.id} className={'pg-skin' + (skinIdx === s.id ? ' on' : '')} onClick={() => setSkinIdx(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button className="pg-go" disabled={!!busy} onClick={runSkin}>
                {busy === 'skin' ? '⋯ 想一下' : (mode === 'auto' && aiEnabled ? <><SparkleIcon /> AI 渲染</> : <><PaintbrushIcon /> 本地渲染</>)}
              </button>
              {skinOut && (
                <ResultBox
                  title={'🌸 ' + (SKINS.find((s) => s.id === skinIdx)?.label || '预览') + (skinSrc === 'ai' ? '(AI)' : '(本地)')}
                  lines={skinOut}
                  onSave={() => { saveAsNote('换皮预览', skinOut); setSavedN((n) => n + 1); }}
                />
              )}
            </div>
          )}
          {view === 'dice' && (
            <div className="pg-card">
              <h4><DiceIcon /> 点子骰子 <span className="pg-tip">随机抽设定 + 「如果…会怎样」，纯抛灵感</span></h4>
              <button className="pg-go" disabled={!!busy} onClick={runDice}>
                {busy === 'dice' ? '⋯ 想一下' : (mode === 'auto' && aiEnabled ? <><DiceIcon /><SparkleIcon /> AI 掷骰</> : <><DiceIcon /> 本地掷骰</>)}
              </button>
              {diceOut && (
                <ResultBox
                  title={diceSrc === 'ai' ? '✨ AI 骰子灵感' : '🎯 本地骰子灵感'}
                  lines={diceOut}
                  onSave={() => { saveAsNote('骰子灵感', diceOut); setSavedN((n) => n + 1); }}
                />
              )}
            </div>
          )}
          {view === 'spark' && (
            <div className="pg-card">
              <h4><SparkleIcon /> 灵感 <span className="pg-tip">{({ novel: '小说', rpg: '游戏', gal: '恋爱', film: '剧本', custom: '自由' } as Record<ProjectType, string>)[projectType]} · 点按钮滚点子 → 自动进左边「✨灵感点子」当素材</span></h4>
              <div className="spark-kind">
                <span className="spark-kind-label">带方向的人名</span>
                <div className="spark-dirs">
                  {SPARK_DIRECTIONS.map((d) => (
                    <button key={d} className="spark-dir" onClick={() => genNameDir(d)}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="spark-grid">
                {(SPARK_BUTTONS[projectType as ProjectType] || SPARK_BUTTONS.custom).map((b) => (
                  <button key={b.label} className="spark-btn" onClick={() => genByType(b.label, b.make)}>
                    <span className="spark-emoji">{b.emoji || '✨'}</span>
                    <span className="spark-name">{b.label}</span>
                  </button>
                ))}
              </div>
              <div className="pg-hint">已攒 {sparks.length} 枚点子 · 去「选素材」页勾选后即可丢进 1️⃣碰撞台 / 2️⃣换皮 / 3️⃣骰子</div>
              {sparks.length > 5 && <div className="pg-empty">点太多只会保留最近 30 枚，够当下用就好～</div>}
            </div>
          )}
          {savedN > 0 && <p className="pg-saved-note">✅ 已另存 {savedN} 张便签回画布</p>}
        </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- 局部小工具（放模块尾部，使用方在其下方） ---------- */
const AIutils = {
  truncateLines(res: string[], rule: PlayRules): string[] {
    const max = rule.len === '金句' ? 8 : rule.len === '小段' ? 12 : 100;
    return res.length > max ? res.slice(0, max) : res;
  },
};

/* —— 「灵感」点子：生成成一枚“可勾选素材”的伪卡（不入画布，直到点保存 才落地）—— */
let _spkSeq = 0;
function sparkCard(label: string, text: string): Card {
  _spkSeq++;
  return {
    id: 'spk-' + _spkSeq,
    kind: 'note',
    title: '⚡' + label,
    content: textToDoc([text]),
    x: 0, y: 0, w: 170, h: 240, z: 0, sectionId: '',
    createdAt: Date.now(), updatedAt: Date.now(),
  } as Card;
}
/** 把一枚点子伪卡真正落到画布中心（成为可复用的便签） */
function persistSpark(c: Card) {
  const s = useStudio.getState();
  const taken = new Set(Object.values(s.cards).map((x) => x.title));
  let ft = c.title, i = 1;
  while (taken.has(ft)) ft = `${c.title} •${i++}`;
  s.addCard({ kind: 'note', title: ft, content: c.content }, { center: true });
}

function saveAsNote(title: string, lines: string[]) {
  const text = lines
    .filter((l) => !/^（/.test(l.trim()) && !/^——/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return;
  const s = useStudio.getState();
  const taken = new Set(Object.values(s.cards).map((c) => c.title));
  let ft = title, i = 1;
  while (taken.has(ft)) ft = `${title} •副本${i++}`;
  s.addCard({ kind: 'note', title: ft, content: textToDoc(text.split('\n')) });
}

function ResultBox({ title, lines, onSave }: { title: string; lines: string[]; onSave: () => void }) {
  return (
    <div className="pg-result">
      <div className="pg-result-head">
        <b>{title}</b>
        <button className="pg-go sm" onClick={onSave}><SaveIcon /> 另存为画布便签</button>
      </div>
      <pre className="pg-pre">{lines.join('\n')}</pre>
    </div>
  );
}