/**
 * ====== 全局元素数量 / 规模上限（稳定性地基）======
 * 给整套画布/编组/连线/收纳的规模设一个“创作够用但绝不失控”的上限，
 * 从根上挡住极端数据把渲染、收纳折叠、层级树等打崩。
 * 数字取「偏宽松、足够多数创作场景又安全」的量级。
 */
export const LIMITS = {
  /** 单项目卡片总数上限（每张卡都是画布上一个元素/渲染节点，给足但设界） */
  MAX_CARDS: 5000,
  /** 单项目编组总数上限 */
  MAX_GROUPS: 800,
  /** 单项目父子/同级连线总数上限 */
  MAX_EDGES: 8000,
  /** 单个编组最多承载的直属成员卡数量（组框/整组移动都随其规模放大） */
  MAX_MEMBERS_PER_GROUP: 1200,
  /** 备注/便签内容块等上下文提示文案用到的——保留位，勿删 */
} as const;

/**
 * 安全上限：因数据形状的不同，这里统一提供一个“能否再新增”的判定。
 * @param kind 元素种类：'card' | 'group' | 'edge' | 'groupMember'
 * @param count 当前数量
 * @returns 若放行返回 null；若已达上限返回一段中文提示
 */
export function exceedMsg(kind: 'card' | 'group' | 'edge' | 'groupMember', count: number, extra?: { groupName?: string }): string | null {
  switch (kind) {
    case 'card':
      if (count >= LIMITS.MAX_CARDS) return `已达卡片总数上限（${LIMITS.MAX_CARDS}），无法再新建卡片`;
      return null;
    case 'group':
      if (count >= LIMITS.MAX_GROUPS) return `已达编组总数上限（${LIMITS.MAX_GROUPS}），无法再新建编组`;
      return null;
    case 'edge':
      if (count >= LIMITS.MAX_EDGES) return `已达连线总数上限（${LIMITS.MAX_EDGES}），无法再新增连线`;
      return null;
    case 'groupMember': {
      if (count >= LIMITS.MAX_MEMBERS_PER_GROUP) {
        const n = extra?.groupName ? `「${extra.groupName}」` : '';
        return `${n}已达单组承载上限（${LIMITS.MAX_MEMBERS_PER_GROUP}），无法再放入更多卡片`;
      }
      return null;
    }
  }
}
