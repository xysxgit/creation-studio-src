/**
 * ============ 共享「灵感生成按钮」= 按作品类型给一批可生成的点子 ============
 * 原定义在 RightPanel 内部；抽成共享模块后，右栏与娱乐场 Playground 的“灵感”共用同一份，
 * 保证“把灵感库并进娱乐场”后两边口径一致、不重复维护。
 * 仅依赖 defaults 里的纯生成函数，无 UI 依赖。
 */
import { genName, genPlace, genTitle, genEvent, genCharacter, genItem, genQuest, genDialogue } from './defaults';
import type { ProjectType } from './types';

export type SparkButton = { label: string; make: () => string; emoji?: string };

/** 按作品类型给“灵感想点”的生成清单（原 TYPE_GEN_BUTTONS 全量迁移） */
export const SPARK_BUTTONS: Record<ProjectType, SparkButton[]> = {
  novel: [
    { label: '名字', emoji: '🪪', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '标题', emoji: '🏷️', make: () => genTitle() },
    { label: '地名', emoji: '🗺️', make: () => genPlace() },
    { label: '事件', emoji: '🔱', make: () => genEvent() },
    { label: '人物', emoji: '🧑', make: () => genCharacter().join('；') },
  ],
  rpg: [
    { label: '任务', emoji: '🎯', make: () => genQuest() },
    { label: '装备', emoji: '🗡️', make: () => `装备：${genItem()}｜属性：攻击+3｜特效：待定` },
    { label: '技能', emoji: '✨', make: () => `技能：${genCharacter()[0].replace('姓名：', '')}｜效果：待定｜消耗：待定` },
    { label: '地名', emoji: '🗺️', make: () => genPlace() },
    { label: '事件', emoji: '🔱', make: () => genEvent() },
  ],
  gal: [
    { label: '对白', emoji: '💬', make: () => genDialogue() },
    { label: '分支', emoji: '🔀', make: () => `选项A：继续当前路线｜选项B：进入隐藏路线｜选项C：拒绝（好感-1）` },
    { label: '名字', emoji: '🪪', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '事件', emoji: '🔱', make: () => genEvent() },
    { label: '标题', emoji: '🏷️', make: () => genTitle() },
  ],
  film: [
    { label: '场景', emoji: '🎬', make: () => `场景：${genPlace()}｜时间：日/夜｜氛围：待定` },
    { label: '对白', emoji: '💬', make: () => genDialogue() },
    { label: '事件', emoji: '🔱', make: () => genEvent() },
    { label: '标题', emoji: '🏷️', make: () => genTitle() },
    { label: '人物', emoji: '🧑', make: () => genCharacter().join('；') },
  ],
  custom: [
    { label: '名字', emoji: '🪪', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '标题', emoji: '🏷️', make: () => genTitle() },
    { label: '地名', emoji: '🗺️', make: () => genPlace() },
    { label: '事件', emoji: '🔱', make: () => genEvent() },
    { label: '人物', emoji: '🧑', make: () => genCharacter().join('；') },
  ],
};

/** 名字 / 地名 / 标题 三类的方向（供“随机生成取名字方向”弹层） */
export const SPARK_NAME_KINDS = ['名字', '地名', '标题'];
export const SPARK_DIRECTIONS = ['中式', '日式', '西式', '奇幻', '古风', '赛博', '甜宠', '随机'];
