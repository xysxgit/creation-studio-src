/**
 * ============ AI 创作技能（Skill）系统 ============
 * 兼容 goink-skills 社区格式（Markdown + YAML frontmatter）：
 *  · parseSkillMd：frontmatter 解析（名称/描述/分类/图标）
 *  · loadSkills / saveSkills：localStorage 持久化
 *  · makeSkill：创建技能（写入本地库）
 */
import { uid } from './util';

export interface AISkill {
  id: string;
  name: string;
  description: string;
  category: string;
  /** always=每次请求自动常驻；auto=AI 按上下文应自动遵守（这里手动注入）；manual=仅手动触发 */
  mode: 'auto' | 'manual' | 'always';
  author?: string;
  version?: number;
  /** Markdown 正文：作为系统提示片段注入 */
  content: string;
  /** always 技能的总开关；auto/manual 用「注入到对话」控制 */
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'cs.aiSkills';

function builtins(): AISkill[] {
  const now = Date.now();
  return [
    {
      id: uid('sk'), name: '去AI味·词频熔断', description: '当用户要求润色、改写或正式落笔正文时，检查并消除 AI 高频空泛腔词，改用具体名词与动词。', category: '文笔', mode: 'auto', version: 1, enabled: true, createdAt: now, updatedAt: now,
      content: '## 去 AI 味 · 词频熔断\n\n写作/润色时严格遵守：\n1. 停用腔词清单（同一段落出现即视为警报）：仿佛、似乎、缓缓、微微、轻轻、不禁、不由、瞬间、刹那、眼底、嘴角、喉咙一紧、一股暖流、某种说不清的情绪。\n2. 每 300 字内，抽象情绪词（温柔、复杂、莫名）不超过 1 次；情绪必须落在具体动作、感官或细节上。\n3. 优先具体名词与动作动词：不用「他仿佛很伤心」，用「他攥着伞柄没松，指节发白」。\n4. 删形容词堆叠：一段里修饰词超过 3 个就精简，留最锋利的一个。\n5. 输出润色结果时，另起一行用「——已熔断的词：」列出被替换的腔词。',
    },
    {
      id: uid('sk'), name: '英雄之旅·节拍表', description: '当用户设计长篇小说、章节大纲或需要结构化的冒险/成长主线时，用英雄之旅 12 步校准结构。', category: '结构', mode: 'auto', version: 1, enabled: true, createdAt: now, updatedAt: now,
      content: '## 英雄之旅 · 节拍表\n\n用 12 步校准长线结构，标注当前素材落在哪个节拍：\n1 平凡世界 2 冒险召唤 3 拒绝召唤 4 遇见导师 5 跨过第一道门槛 6 考验/盟友/敌人 7 逼近最深洞穴 8 磨难（至暗） 9 获得奖赏 10 回归之路 11 复活（蜕变） 12 携灵药归来。\n\n应用规则：\n- 给出大纲时，逐章标注对应节拍；同一步可跨多章，但顺序不能乱。\n- 检查用户素材：若连续多章停在 5~6，提示推进到 7；若 8 缺乏「代价」，指出磨难必须有不可逆损失。\n- 章节结尾钩子优先落在「下一步节拍的入口」。',
    },
    {
      id: uid('sk'), name: '情感弧线·单场戏', description: '当用户说情绪太平、转折太硬、没感觉、要虐/要燃，或设计单场关键戏时，按弧线起伏重排这场戏。', category: '技法', mode: 'auto', version: 1, enabled: true, createdAt: now, updatedAt: now,
      content: '## 情感弧线 · 单场戏\n\n任何单场关键戏都应呈弧线而非直线，按五段检查/重排：\n1 锚点（稳定态）：用 1~2 个日常细节建立「此刻原本正常」。\n2 扰动：一件小事打破稳定，角色开始失重（不说破情绪）。\n3 升级：三次小波折，每次波折都比前一次更贴身（对话回合 1-2-3 递增）。\n4 顶点：情绪真正爆发的瞬间——用动作或留白代替呐喊；爆发后接一个「反常安静」的节拍。\n5 余韵：收束在一个具象细节上（窗外的雨、没喝完的茶），让读者自己回味。\n\n禁止：开头就情绪满格；转折前无铺垫直接翻脸；爆发用大段心理描写直说。\n输出时给出五段节奏标注与改写示范。',
    },
  ];
}

/** 读取技能库；首次使用（无本地数据）时写入内置示例 */
export function loadSkills(): AISkill[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const valid = arr.filter((x: AISkill) => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.content === 'string');
        if (valid.length) return valid as AISkill[];
      }
    }
  } catch { /* ignore */ }
  const b = builtins();
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ }
  return b;
}

export function saveSkills(list: AISkill[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** 解析一行 YAML key: value */
function parseHead(head: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const line of head.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    v = v.replace(/^["']|["']$/g, '');
    if (k) o[k] = v;
  }
  return o;
}

/** 从 goink-skills 风格 Markdown 解析技能 */
export function parseSkillMd(txt: string): { skill?: Pick<AISkill, 'name' | 'description' | 'category' | 'mode' | 'author' | 'version' | 'content'>; error?: string } {
  if (!txt || !txt.trim()) return { error: '内容为空' };
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { error: '缺少 --- frontmatter 头（需以 --- 开头并包含 name/description/mode）' };
  const head = parseHead(m[1]);
  const body = (m[2] || '').trim();
  const name = (head.name || '').trim();
  if (!name) return { error: 'frontmatter 缺少 name 字段' };
  if (!body) return { error: 'frontmatter 之后缺少正文内容' };
  const modeRaw = (head.mode || 'auto').trim().toLowerCase();
  const mode: AISkill['mode'] = modeRaw === 'always' || modeRaw === 'manual' ? modeRaw : 'auto';
  const ver = parseInt((head.version || '').trim(), 10);
  return {
    skill: {
      name,
      description: (head.description || '').trim(),
      category: (head.category || '自定义').trim(),
      mode,
      author: (head.author || '').trim(),
      version: Number.isFinite(ver) && ver > 0 ? ver : 1,
      content: body,
    },
  };
}

/** 把 goink frontmatter 技能转成完整 AISkill（编辑保存时调用） */
export function makeSkill(partial: { id?: string; name: string; description?: string; category?: string; mode: AISkill['mode']; author?: string; version?: number; content: string; enabled?: boolean }): AISkill {
  const now = Date.now();
  return {
    id: partial.id || uid('sk'),
    name: partial.name.trim() || '未命名技能',
    description: (partial.description || '').trim(),
    category: (partial.category || '自定义').trim() || '自定义',
    mode: partial.mode,
    author: (partial.author || '').trim(),
    version: partial.version || 1,
    content: partial.content.trim(),
    enabled: partial.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}
