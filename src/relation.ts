/**
 * ====== 「层级排序编组关系」纯计算 ======
 * 以选中卡片为中心，汇总三套定位信息：
 *  1) 归属分区
 *  2) 编组文件夹 + 组内排序（第 i/n，前后卡）
 *  3) 父子层级（kind==='parent' 的有向边：父链上溯到顶 + 直接子枝 + 同一父下的兄弟）
 * 纯函数，不含 React，供右栏思维树/检查器共用，避免两处口径分叉。
 */
import type { Card, CardGroup, Edge, Section } from './types';

export interface RelGroupLoc {
  /** 该卡所在分区（可能为空=未分区） */
  sectionId: string;
  section: Section | null;
  /** 编组文件夹 */
  groupId?: string;
  group: CardGroup | null;
  /** 组内成员（按默认序：order → createdAt），含本卡；用于得到"第 i/n + 前后" */
  members: Card[];
  index: number;      // 本卡在 members 中下标（0 基）
}

export interface RelAncestorsChain {
  /** 自顶向下到父卡的链（不含本卡自身） */
  chain: Card[];
  /** 每条父边 */
  parents: Edge[];
}
export interface RelChildren {
  direct: Card[];       // 直接子卡（kind=parent 且 e.from==id）
  foldDescCount: number; // 若外层有收纳态统计可填，默认下发后由组件补充
}
export interface RelSiblings {
  /** 同一父下的兄弟（kind=parent 且除自身外的 e.to） */
  byParent: Card[];
  /** 与自身直接相连的同级卡（kind=peer 或同一条未定向另一端） */
  peers: Card[];
}

export type RelationInfo =
  | { ok: false }
  | {
      ok: true;
      card: Card;
      groupLoc: RelGroupLoc;
      ancestors: RelAncestorsChain;
      children: RelChildren;
      siblings: RelSiblings;
      /** 是否无可归属(既不在组也不带父子边、也没连线的孤立卡) */
    };

interface EdgeIndexes {
  byToParent: Map<string, Edge[]>; // subId -> edges that make it a child (e.to==subId & kind parent)
  kidsOf: Map<string, Edge[]>;     // parentId -> edges with e.from==parentId & kind parent
  peerOf: Map<string, Edge[]>;     // id -> edges kind peer / 无 kind
  idToCard: Record<string, Card>;
}

function buildIndexes(cards: Record<string, Card>, edges: Edge[]): EdgeIndexes {
  const byToParent = new Map<string, Edge[]>();
  const kidsOf = new Map<string, Edge[]>();
  const peerOf = new Map<string, Edge[]>();
  const map = cards;
  for (const e of edges) {
    if (!map[e.from] || !map[e.to]) continue;
    if (e.kind === 'parent') {
      const arrK = kidsOf.get(e.from) || [];
      arrK.push(e);
      kidsOf.set(e.from, arrK);
      const arrT = byToParent.get(e.to) || [];
      arrT.push(e);
      byToParent.set(e.to, arrT);
    } else {
      const arr = peerOf.get(e.from) || [];
      arr.push(e);
      peerOf.set(e.from, arr);
      const arr2 = peerOf.get(e.to) || [];
      arr2.push(e);
      peerOf.set(e.to, arr2);
    }
  }
  return { byToParent, kidsOf, peerOf, idToCard: map };
}

/** 默认组内/区内排序依据（与左侧编组列表一致）：order 优先，其次 createdAt */
function byOrder(a: Card, b: Card): number {
  return (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt;
}

export function analyzeRelation(
  cardId: string,
  all: { cards: Record<string, Card>; edges: Edge[]; groups: Record<string, CardGroup>; sections: Section[] },
): RelationInfo {
  const card = all.cards[cardId];
  if (!card) return { ok: false };

  const idx = buildIndexes(all.cards, all.edges);
  const groupId = card.groupId;
  const group = groupId ? all.groups[groupId] || null : null;

  // 编组成员（含未编组但在同分区？）——编组文件夹是横向收纳，取该 group 下全部非 writing 成员即可
  // 若卡未编组，则"位置"退化为"所属分区内排位"更直观。
  let members: Card[] = [];
  if (group) {
    members = Object.values(all.cards)
      .filter((c) => !c.writingOnly && c.groupId === group.id)
      .sort(byOrder);
  } else {
    // 未编组：按同分区排位显示
    members = Object.values(all.cards)
      .filter((c) => !c.writingOnly && !c.groupId && c.sectionId === card.sectionId)
      .sort(byOrder);
  }
  const index = Math.max(0, members.findIndex((c) => c.id === card.id));

  // 父链：向上到顶
  const chain: Card[] = [];
  const parents: Edge[] = [];
  {
    let cur: string | null = card.id;
    const guard = new Set<string>();
    while (cur) {
      if (guard.has(cur)) break;
      guard.add(cur);
      const pe: Edge | undefined = (idx.byToParent.get(cur) || [])[0];
      if (!pe) break;
      const par: Card | undefined = all.cards[pe.from];
      if (!par || guard.has(par.id)) break;
      parents.unshift(pe);
      chain.unshift(par);
      cur = par.id;
    }
  }

  // 直接子卡
  const directKids: Card[] = (idx.kidsOf.get(card.id) || [])
    .map((e) => all.cards[e.to])
    .filter((c): c is Card => !!c && !c.writingOnly)
    .sort(byOrder);

  // 同父兄弟 + 同级 peer
  const parentIds = new Set(chain.map((c) => c.id));
  const byParent: Card[] = [];
  for (const pid of parentIds) {
    for (const e of idx.kidsOf.get(pid) || []) {
      if (e.to !== card.id && all.cards[e.to]) byParent.push(all.cards[e.to]);
    }
  }
  const peers: Card[] = (idx.peerOf.get(card.id) || [])
    .map((e) => all.cards[e.from === card.id ? e.to : e.from])
    .filter((c): c is Card => !!c && !c.writingOnly);

  return {
    ok: true,
    card,
    groupLoc: {
      sectionId: card.sectionId,
      section: all.sections.find((s) => s.id === card.sectionId) || null,
      groupId,
      group,
      members,
      index,
    },
    ancestors: { chain, parents },
    children: { direct: directKids, foldDescCount: 0 },
    siblings: { byParent, peers },
  };
}
