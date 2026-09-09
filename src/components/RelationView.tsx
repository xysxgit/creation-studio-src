/**
 * ============ 关系位置视图（右栏 · 选中卡片为中心）============
 * · 归属/排序：分区 → 编组文件夹 → 组内/区内第 i/n；
 * · 上下级不再用「父/子」叫法，改为统一的「层号」：
 *     所在延伸枝的最顶层=第 1 层，往下每走一级 +1；同一层的卡片共用同一个层号。
 *   思维树就按层号自顶向下陈列，选中卡所在层高亮。
 * 检查器用它做 compact(可折叠)；思维树用它做 tall(树型)。
 */
import type { ReactNode } from 'react';
import { useStudio } from '../store';
import { analyzeRelation } from '../relation';
import type { Card } from '../types';
import { BrainIcon, ImageIcon, DocIcon, BoxIcon } from './icons';

function kindIcon(c: Card) {
  return c.mode === 'node' ? <BrainIcon size={13} /> : c.kind === 'image' ? <ImageIcon size={13} /> : <DocIcon size={13} />;
}

export function useRelation(cardId: string | null) {
  const cards = useStudio((s) => s.cards);
  const edges = useStudio((s) => s.edges);
  const groups = useStudio((s) => s.groups);
  const sections = useStudio((s) => s.sections);
  if (!cardId) return null;
  return analyzeRelation(cardId, { cards, edges: Object.values(edges), groups, sections });
}

/** 一行卡片项：可在最左带“层N”号，可点击定位 */
function Row({
  card,
  self,
  focus,
  lvl,
  note,
}: {
  card: Card;
  self?: boolean;
  focus: (id: string) => void;
  /** 可选层号提示，代替父/子叫法 */
  lvl?: number;
  note?: ReactNode;
}) {
  return (
    <div
      className={`rel-row ${self ? 'rel-self' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        focus(card.id);
      }}
      title={card.title || '未命名卡片'}
    >
      {lvl !== undefined ? <span className="rel-lvl">层{lvl}</span> : <span className="rel-lvl rel-lvl--blank" />}
      <span className="rel-kind">{kindIcon(card)}</span>
      <span className="rel-title">{card.title || '未命名卡片'}</span>
      {note}
    </div>
  );
}

export default function RelationView({
  cardId,
  top = false,
  onFocus,
}: {
  cardId: string | null;
  top?: boolean;
  onFocus?: (id: string) => void;
}) {
  const focusCard = onFocus || (() => {});
  const info = useRelation(cardId);
  if (!info?.ok) return null;

  const { card, groupLoc, ancestors, children, siblings } = info;
  const group = groupLoc.group;

  // 本卡所在层号 = 自顶下数到本卡的深度（顶上为第 1 层）
  const selfLvl = ancestors.chain.length + 1;

  if (!top) {
    // —— 紧凑摘要（用于检查器顶部，可折叠由外层控制）——
    const sup =
      ancestors.chain.length > 0
        ? ` ← 再上 ${ancestors.chain.length} 层`
        : children.direct.length > 0
          ? ` ↓ ${children.direct.length} 张下一层`
          : siblings.byParent.length > 0
            ? ` · 同层还有 ${siblings.byParent.length} 张`
            : ' · 无上下级连线';
    return (
      <div className="rel-band" style={{ borderTop: 'none' }}>
        <div className="rel-line">
          <span className="rel-lvl rel-lvl--chip">层 {selfLvl}</span>
          <b style={{ color: 'var(--accent)' }}>{card.title || '本卡'}</b>
          <span className="rel-dim">{sup}</span>
          {group && (
            <span className="rel-chip" style={{ background: group.color + '22', color: group.color || 'var(--text)' }}>
              <BoxIcon size={13} /> {group.name}
            </span>
          )}
        </div>
        {groupLoc.members.length > 1 && <div className="rel-line rel-dim">组内第 {groupLoc.index + 1}/{groupLoc.members.length} 张</div>}
      </div>
    );
  }

  // ===== 完整树型（思维树）：按「层号」自顶向下陈列 =====
  const hasRel = ancestors.chain.length > 0 || siblings.byParent.length > 0 || children.direct.length > 0 || siblings.peers.length > 0;

  return (
    <div className="rel-tall">
      <p className="muted layers-hint" style={{ marginBottom: 4 }}>
        选中卡处于<span className="rel-lvl rel-lvl--chip">层 {selfLvl}</span> · 以下按层级陈列
      </p>
      <div className="rel-tree">
        {!hasRel && group && (
          <div className="rel-none">
            <p className="muted">此卡没有纵向连线，仅属于编组「{group.name}」（组内第 {groupLoc.index + 1}/{groupLoc.members.length} 张）。</p>
          </div>
        )}
        {/* 向上各层：最顶=层1，往下逐层递增到本卡上一层 */}
        {ancestors.chain.length > 0 && (
          <div className="rel-anchors">
            <span className="rel-dim--sec">向上 · 逐层而上</span>
            {ancestors.chain.map((a, i) => (
              <Row key={a.id} card={a} focus={focusCard} lvl={i + 1} />
            ))}
          </div>
        )}
        {/* 本层：本卡 + 同层并排者 */}
        <div className="rel-self-layer">
          <Row
            self
            card={card}
            focus={focusCard}
            lvl={selfLvl}
            note={group ? <span className="rel-chip-sm"><BoxIcon size={12} /> {group.name}</span> : <span className="rel-badge rel-badge-self">本卡</span>}
          />
        </div>
        {siblings.byParent.length > 0 && (
          <div className="rel-sib">
            <span className="rel-dim--sec">本层并列（层号 {selfLvl}）</span>
            {siblings.byParent.map((k) => (
              <Row key={k.id} card={k} focus={focusCard} lvl={selfLvl} />
            ))}
          </div>
        )}
        {/* 下一层：本卡的直接下级 */}
        {children.direct.length > 0 && (
          <div className="rel-kids-row">
            <span className="rel-dim--sec">下一层（层号 {selfLvl + 1}）</span>
            {children.direct.map((k) => (
              <Row key={k.id} card={k} focus={focusCard} lvl={selfLvl + 1} />
            ))}
          </div>
        )}
        {siblings.peers.length > 0 && (
          <div className="rel-sib">
            <span className="rel-dim--sec">旁挂同级连线</span>
            {siblings.peers.map((k) => (
              <Row key={k.id} card={k} focus={focusCard} lvl={selfLvl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}