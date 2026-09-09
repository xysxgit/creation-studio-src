/**
 * ============ 思维树面板（右栏思维 tab）============
 * 以「选中卡片」为中心，展示它的层级排序编组关系：
 * · 深 parent-kind 连线构成的多级父链 / 子枝（可收纳）；
 * · 序与编组文件夹归属；
 * · 选中则整树围绕它呈现在其上下位。
 * （原“重置根 / 应用思维导图布局”已按需求移除）
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useStudio } from '../store';
import { useFocusCard } from './LeftSidebar';
import { BoxIcon, DocIcon } from './icons';
import { analyzeRelation } from '../relation';
import type { Card } from '../types';

export default function MindTree() {
  const cards = useStudio((s) => s.cards);
  const groups = useStudio((s) => s.groups);
  const sections = useStudio((s) => s.sections);
  const edges = useStudio((s) => s.edges);
  const selection = useStudio((s) => s.selection);
  const selectedGroupId = useStudio((s) => s.selectedGroupId);
  const focusCard = useFocusCard();

  const selected = selection.length === 1 ? cards[selection[0]] : null;
  // 显式选中的编组（点组框/组名时 selectGroup 置 selectedGroupId）
  const explicitGroup = selectedGroupId && groups[selectedGroupId] ? groups[selectedGroupId] : null;
  // 隐式整组：移动工具下「点组内任意一张卡」是把该组成员全部选中（不置 selectedGroupId）。
  // 若当前多选恰好 = 某个编组的全部成员卡，则把它当作“整组已选”处理，让思维树也可见该编组。
  const implicitGroup = useMemo(() => {
    if (explicitGroup) return null;
    if (!selection.length) return null;
    // 命中候选：存在一张卡属于某组，且该组的非 writing 成员集与当前 selection 完全重合
    for (const gid of Object.keys(groups)) {
      const members = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === gid);
      if (!members.length) continue;
      const memIds = members.map((c) => c.id);
      if (memIds.length === selection.length && memIds.every((id) => selection.includes(id))) return groups[gid];
    }
    return null;
  }, [explicitGroup, selection, cards, groups]);

  const focusGroup = explicitGroup || implicitGroup;

  const snapshot = useMemo(
    () => (selected ? analyzeRelation(selected.id, { cards, edges: Object.values(edges), groups, sections }) : null),
    [selected, cards, edges, groups, sections],
  );

  // ===== 编组作为“一张大卡片”的层级透视 =====
  // 以当前选中的编组为中心，展示：其上父节点（若有 parent 边指向它）、它本身、以及它直属的成员卡 + 嵌套子编组。
  // 编组即使未套任何小卡，也能作为森林里的一环被看到（配合卡片↔编组同层连线）。
  const groupTree = useMemo(() => {
    if (!focusGroup) return null;
    const edgeArr = Object.values(edges);
    // 直接子节点（父边 e.from===该组 → e.to 可为卡片或编组）
    const kids = edgeArr.filter((e) => e.kind === 'parent' && e.from === focusGroup.id);
    const directCards = kids.map((e) => cards[e.to]).filter(Boolean).filter((c) => !c.writingOnly);
    const directGroups = kids.map((e) => groups[e.to]).filter((g): g is NonNullable<typeof g> => !!g);
    directGroups.sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    // 它的直属成员卡（flat：cards.groupId===该组）
    const members = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === focusGroup.id);
    members.sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    // 上层父节点（编组作为“大卡片”，也可能挂到某个卡片/编组之下）——只取最近一级，足够表达“它在什么里面”
    const parentEdge = edgeArr.find((e) => e.kind === 'parent' && e.to === focusGroup.id);
    const parentRef = parentEdge
      ? { isGroup: !!groups[parentEdge.from], id: parentEdge.from, card: cards[parentEdge.from], group: groups[parentEdge.from] }
      : null;
    return { directCards, directGroups, members, parentRef, group: focusGroup, outerCount: directCards.length + directGroups.length + members.length };
  }, [focusGroup, cards, groups, edges]);

  // ===== 统一节点树递归（卡片/编组都可作为“大节点”，风格一致、无层号）=====
  // 节点=卡片或编组。children 来源：kind==='parent' 的有向边（from=父 → to=子，子可为卡或组）。
  // 编组额外把“框内内容卡”（groupId 归属）当作其内容层；卡片没有框内容，仅看连出的父子线。
  const childIds = (nid: string): string[] => {
    const res: string[] = [];
    for (const e of Object.values(edges)) {
      if (e.kind === 'parent' && e.from === nid && e.to && e.to !== nid) {
        if (cards[e.to] && !cards[e.to].writingOnly) res.push(e.to);
        else if (groups[e.to]) res.push(e.to);
      }
    }
    return res;
  };
  const cardNode = (c: Card, d: number, self: boolean, linked: boolean) => (
    <div key={c.id} className="gt-branch" style={{ marginLeft: d ? 12 : 0 }}>
      <div
        className={`gt-node gt-card ${self ? 'gt-self' : ''} ${linked ? 'gt-linked' : ''}`}
        role="button"
        tabIndex={0}
        title={c.title || '未命名卡片'}
        onClick={(e) => { e.stopPropagation(); const el = document.querySelector(`[data-cid="${c.id}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); focusCard(c.id); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusCard(c.id); } }}
      >
        <span className="rel-kind"><DocIcon size={13} /></span>
        <span className="rel-title">{c.title || '未命名卡片'}</span>
      </div>
      {d < 8 && childIds(c.id).length > 0 && (
        <div className="gt-children">
          {childIds(c.id).map((k) => (groups[k] ? renderNode(k, d + 1, false, true) : cardNode(cards[k]!, d + 1, false, true)))}
        </div>
      )}
    </div>
  );
  const renderNode = (nid: string, depth: number, isSelf: boolean, linked = false): ReactNode => {
    if (depth > 8) return null; // 套娃深度上限，兜底稳定
    const g = groups[nid];
    const c = cards[nid];
    if (c) return cardNode(c, depth, isSelf, linked);
    if (!g) return null;
    // 编组：框内内容卡（内容层）+ 连接的子级（parent 边，卡片/子编组）
    const boxCards = Object.values(cards).filter((x) => !x.writingOnly && x.groupId === nid).sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    const linkedKids = childIds(nid);
    const content = boxCards.filter((x) => !linkedKids.includes(x.id));
    return (
      <div key={nid} className="gt-branch" style={{ marginLeft: depth ? 12 : 0 }}>
        <div
          className={`gt-node gt-group ${isSelf ? 'gt-self' : ''} ${linked ? 'gt-linked' : ''}`}
          role="button"
          tabIndex={0}
          title="点选此编组，画布居中定位/显示其框"
          onClick={(e) => { e.stopPropagation(); useStudio.getState().selectGroup(nid); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useStudio.getState().selectGroup(nid); } }}
        >
          <span className="rel-kind" style={{ color: g.color }}><BoxIcon size={13} /></span>
          <span className="rel-title">{g.name || '组'}</span>
          {(boxCards.length + linkedKids.length) > 1 && (
            <span className="gt-count chip">{boxCards.length}卡{childIds(nid).filter((k) => groups[k]).length ? `·${childIds(nid).filter((k) => groups[k]).length}子组` : ''}</span>
          )}
        </div>
        {depth < 8 && (content.length || linkedKids.length) > 0 && (
          <div className="gt-children">
            {/* 组内内容卡：平级（编组框直接装的） */}
            {content.map((x) => cardNode(x, depth + 1, false, false))}
            {/* 连接的子级：parent 连线挂进来的卡/子编组，再缩进一层、加 ⤷ 标记区分 */}
            {linkedKids.length > 0 && (
              <div className="gt-children" style={{ marginLeft: 12 }}>
                {linkedKids.map((k) => (groups[k] ? renderNode(k, depth + 1, false, true) : cardNode(cards[k]!, depth + 1, false, true)))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sb-body mind-body">
      <div className="mind-toolbar">
        <p className="muted layers-hint">
          {selected
            ? '以下是选中卡所处的关系位置 · 点任一卡回画布定位'
            : focusGroup
              ? '编组作为“大卡片”的层级透视 · 点组定位、点卡回画布'
              : '点选画布/左栏的一张卡（或选中一个编组），这里会展示它的层级、排序与编组关系'}
        </p>
      </div>
      {selected ? (
        <div className="rel-tree-inner">
          {snapshot && snapshot.ok && snapshot.groupLoc.members.length > 1 && (
            <p className="muted rel-body-pad" style={{ fontSize: 12, margin: '2px 0 4px' }}>
              {snapshot.groupLoc.group
                ? <><BoxIcon size={13} /> 编组「{snapshot.groupLoc.group.name}」· 第 {snapshot.groupLoc.index + 1}/{snapshot.groupLoc.members.length} 张</>
                : <>所在分区未编组 · 区内第 {snapshot.groupLoc.index + 1}/{snapshot.groupLoc.members.length} 张</>}
            </p>
          )}
          {snapshot && snapshot.ok && snapshot.ancestors.chain.length > 0 && (
            <div className="gt-parent-hint muted" style={{ fontSize: 12, marginBottom: 6 }}>
              {snapshot.ancestors.chain.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ' → '}
                  <button className="linklike" onClick={() => focusCard(a.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}>{a.title || '父卡'}</button>
                </span>
              ))}
              {snapshot.ancestors.chain.length > 0 && '（上层）'}
            </div>
          )}
          <div className="gt-tree-root">{renderNode(selected.id, 0, true)}</div>
        </div>
      ) : focusGroup && groupTree ? (
        <div className="rel-tree-inner">
          {groupTree.parentRef && (
            <div className="gt-parent-hint muted" style={{ fontSize: 12, marginBottom: 6 }}>
              {groupTree.parentRef.isGroup ? (
                <>上层=编组：<button className="linklike" onClick={() => useStudio.getState().selectGroup(groupTree.parentRef!.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}>{groupTree.parentRef.group!.name}</button></>
              ) : (
                <>上层=卡片：<button className="linklike" onClick={() => focusCard(groupTree.parentRef!.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}>{groupTree.parentRef.card!.title || '父卡'}</button></>
              )}
            </div>
          )}
          {renderNode(groupTree.group.id, 0, true)}
          {groupTree.outerCount === 0 && (
            <p className="muted pad">此编组暂未套卡片 / 未建立下层级；可直接拖小卡进组，或在画布里给它连一条 ◡父子 线来挂下级。</p>
          )}
        </div>
      ) : (
        <p className="muted pad">{focusGroup ? '（该编组信息加载中…）' : '（未选中单张卡片）'}</p>
      )}
    </div>
  );
}
