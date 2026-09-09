/**
 * ============ 右侧属性面板 ============
 *  · 未选中：项目信息/统计/操作入口
 *  · 单卡选中：属性编辑（标题/分区/状态/尺寸/图片/备注/样式…）
 *  · 多选：批量操作栏（统一样式/移动到卷/上移下移/删除/全选…）
 * 移动端折叠为抽屉。
 */
import { csConfirm, csPrompt } from './SystemDialog';
// ============ 右侧面板：检查器 / 灵感 ============
import { useState, type ReactNode } from 'react';
import { useStudio } from '../store';
import { pickImage, isNative as isNativeEnv } from '../native/nativeActions';
import { cardTemplates, TEMPLATE_BOARD_KEYS, genName, genPlace, genTitle, inspirationSamples, templateToCard, genHook, genWorld, genCharacter, genEvent, genItem, genQuest, genDialogue } from '../defaults';
import type { ProjectType } from '../types';


import { customTemplateToCard, deleteTemplate, loadTemplates } from '../templates';
import { deleteInspiration, loadInspirations, type CustomInspiration } from '../inspiration';
import { canvasViewCenter, copyText, PALETTE, toast, compressImageDataUrl } from '../util';
import { TrashIcon, LinkColorIcon, ScissorsIcon, ImageIcon, DocIcon, BoxIcon, UngroupIcon, HandIcon, TrashColorIcon, FolderIcon, GroupIcon, CopyIcon, WandIcon, TemplateIcon, InspectorIcon, PuzzleIcon, TreeIcon, PinIcon, StarColorIcon, PencilIcon, SparkleIcon, CardIcon, ArchitectureIcon, PaletteIcon, GearColorIcon, SectionIcon } from './icons';
import { exportCard } from '../export/export';
import MindTree from './MindTree';
import { useFocusCard } from './LeftSidebar';


// 板块模板映射（10.3）：通用 10 类 + 板块专属；自由创作 = 全部
const TYPE_TEMPLATE_KEYS: Record<ProjectType, string[]> = TEMPLATE_BOARD_KEYS;

const TYPE_GEN_BUTTONS: Record<ProjectType, { label: string; make: () => string }[]> = {
  novel: [
    { label: '名字', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '标题', make: () => genTitle() },
    { label: '地名', make: () => genPlace() },
    { label: '事件', make: () => genEvent() },
    { label: '人物', make: () => genCharacter().join('；') },
  ],
  rpg: [
    { label: '任务', make: () => genQuest() },
    { label: '装备', make: () => `装备：${genItem()}｜属性：攻击+3｜特效：待定` },
    { label: '技能', make: () => `技能：${genCharacter()[0].replace('姓名：', '')}｜效果：待定｜消耗：待定` },
    { label: '地名', make: () => genPlace() },
    { label: '事件', make: () => genEvent() },
  ],
  gal: [
    { label: '对白', make: () => genDialogue() },
    { label: '分支', make: () => `选项A：继续当前路线｜选项B：进入隐藏路线｜选项C：拒绝（好感-1）` },
    { label: '名字', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '事件', make: () => genEvent() },
    { label: '标题', make: () => genTitle() },
  ],
  film: [
    { label: '场景', make: () => `场景：${genPlace()}｜时间：日/夜｜氛围：待定` },
    { label: '对白', make: () => genDialogue() },
    { label: '事件', make: () => genEvent() },
    { label: '标题', make: () => genTitle() },
    { label: '人物', make: () => genCharacter().join('；') },
  ],
  custom: [
    { label: '名字', make: () => { const g = genName(); return `${g.name}（${g.culture}风格）`; } },
    { label: '标题', make: () => genTitle() },
    { label: '地名', make: () => genPlace() },
    { label: '事件', make: () => genEvent() },
    { label: '人物', make: () => genCharacter().join('；') },
  ],
};

// ================= 检查器 =================
function Inspector() {
  const selection = useStudio((s) => s.selection);
  const selectedGroupId = useStudio((s) => s.selectedGroupId);
  const edgeSelection = useStudio((s) => s.edgeSelection);
  const sections = useStudio((s) => s.sections);
  const cards = useStudio((s) => s.cards);
  const edges = useStudio((s) => s.edges);
  const groups = useStudio((s) => s.groups);
  const meta = useStudio((s) => s.meta);

  const card = selection.length === 1 ? cards[selection[0]] : null;
  const edge = edgeSelection.length === 1 ? edges[edgeSelection[0]] : null;
  const s = useStudio.getState;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    rel: false,
    basic: true,
    appearance: false,
    behavior: false,
    actions: false,
  });
  const toggleGroup = (key: string) => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const focusCard = useFocusCard();

  if (edge) {
    return (
      <div className="inspector">
        <h4><LinkColorIcon size={15} /> 连线设置</h4>
        <div className="fld">
          <span>关系类型</span>
          <div className="btn-row">
            {([['peer', '＝ 同级'], ['parent', '◡ 父子']] as const).map(([k, lab]) => (
              <button key={k} className={`btn small ${(edge.kind ?? 'peer') === k ? 'active' : ''}`} onClick={() => s().updateEdge(edge.id, { kind: k, ...(k === 'parent' ? { arrow: 'end' } : {}) })}>
                {lab}
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '-2px 0 6px' }}>
          {edge.kind === 'parent' ? '父子：拖出端为父、落点端为子，可向下扩散层级、并整枝收纳。' : '同级：两端并列，不产生父子层级。'}
        </p>
        {edge.kind === 'parent' && (
          <label className="fld">
            <span>父 → 子</span>
            <button className="btn small" onClick={() => s().updateEdge(edge.id, { from: edge.to, to: edge.from })}>⇅ 反转父子方向</button>
          </label>
        )}
        <label className="fld">
          <span>标签（可换行）</span>
          <textarea rows={2} value={edge.label || ''} placeholder="如：师徒 / 敌对 / 线索" onChange={(e) => s().updateEdge(edge.id, { label: e.target.value })} />
        </label>
        <label className="fld">
          <span>线宽</span>
          <input type="range" min={1} max={6} step={0.2} value={edge.width ?? 2.2} onChange={(e) => s().updateEdge(edge.id, { width: Number(e.target.value) })} />
          <em className="edge-w-val">{(edge.width ?? 2.2).toFixed(1)}</em>
        </label>
        <label className="fld">
          <span>弯曲度（仅曲线）</span>
          <input type="range" min={0} max={1} step={0.05} value={edge.curve ?? 0.25} onChange={(e) => s().updateEdge(edge.id, { curve: Number(e.target.value) })} />
        </label>
        <div className="fld">
          <span>线型</span>
          <div className="btn-row">
            {(['curve', 'straight', 'elbow'] as const).map((ls) => (
              <button key={ls} className={`btn small ${(edge.lineStyle ?? 'curve') === ls ? 'active' : ''}`} onClick={() => s().updateEdge(edge.id, { lineStyle: ls })}>
                {ls === 'curve' ? '曲线' : ls === 'straight' ? '直线' : '折线'}
              </button>
            ))}
          </div>
        </div>
        <label className="fld row">
          <span>虚线</span>
          <input type="checkbox" checked={!!edge.dashed} onChange={(e) => s().updateEdge(edge.id, { dashed: e.target.checked })} />
        </label>
        <div className="fld">
          <span>箭头方向</span>
          <div className="btn-row">
            {(['end', 'start', 'both', 'none'] as const).map((a) => (
              <button key={a} className={`btn small ${(edge.arrow ?? 'end') === a ? 'active' : ''}`} onClick={() => s().updateEdge(edge.id, { arrow: a })}>
                {a === 'end' ? '➤ 尾箭' : a === 'start' ? '↞ 头箭' : a === 'both' ? '⇄ 双向' : '— 无'}
              </button>
            ))}
          </div>
        </div>
        <div className="fld">
          <span>颜色</span>
          <div className="palette">
            {PALETTE.slice(0, 10).map((c) => (
              <button key={c} className={edge.color === c ? 'on' : ''} style={{ background: c }} onClick={() => s().updateEdge(edge.id, { color: c })} />
            ))}
            <button className={!edge.color ? 'on' : ''} title="默认" onClick={() => s().updateEdge(edge.id, { color: '' })}>◯</button>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn danger" onClick={() => s().deleteEdges([edge.id])}><ScissorsIcon size={14} /> 断开连线</button>
        </div>
      </div>
    );
  }

  if (card) {
    const sec = sections.find((x) => x.id === card.sectionId);
    const Group = ({ k, icon, title, children }: { k: string; icon: ReactNode; title: string; children: ReactNode }) => (
      <div className={`inspector-group ${openGroups[k] ? 'open' : ''}`}>
        <button type="button" className="inspector-group-head" onClick={() => toggleGroup(k)} aria-expanded={openGroups[k]}>
          <span>{icon} {title}</span>
          <span className="inspector-group-arrow">▾</span>
        </button>
        {openGroups[k] && <div className="inspector-group-body">{children}</div>}
      </div>
    );
    return (
      <div className="inspector">
        <h4>{card.kind === 'image' ? <><ImageIcon size={15} /> 图片卡设置</> : <><CardIcon size={15} /> 卡片设置</>}</h4>
        <div className="inspector-groups">
          <Group k="basic" icon={<DocIcon size={14} />} title="基础">
            <label className="fld">
              <span>标题</span>
              <input value={card.title} onChange={(e) => s().updateCard(card.id, { title: e.target.value })} />
            </label>
            <label className="fld">
              <span>分区</span>
              <select value={card.sectionId} onChange={(e) => s().updateCard(card.id, { sectionId: e.target.value })}>
                <option value="">（未分区）</option>
                {sections.map((x) => (
                  <option key={x.id} value={x.id}>{x.emoji} {x.name}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              <span>序号</span>
              <input type="number" min={0} value={card.order ?? ''} placeholder="大纲排序用" onChange={(e) => s().updateCard(card.id, { order: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
          </Group>

          {card.kind === 'image' && (
            <Group k="image" icon={<ImageIcon size={14} />} title="图片">
              <div className="fld">
                <span>替换图片</span>
                {isNativeEnv() ? (
                  <button className="btn small" onClick={async () => {
                    const r = await pickImage();
                    if (r?.dataUrl) s().updateCard(card.id, { imageSrc: r.dataUrl });
                  }}><ImageIcon size={13} /> 从相册选择</button>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = async () => {
                        const dataUrl = String(r.result || '');
                        const finalSrc = await compressImageDataUrl(dataUrl);
                        s().updateCard(card.id, { imageSrc: finalSrc });
                      };
                      r.readAsDataURL(f);
                    }}
                  />
                )}
              </div>
              <div className="fld">
                <span>显示方式</span>
                <div className="btn-row">
                  <button className={`btn small ${(card.imageFit || 'contain') === 'contain' ? 'active' : ''}`} onClick={() => s().updateCard(card.id, { imageFit: 'contain' })}>完整显示</button>
                  <button className={`btn small ${card.imageFit === 'fill' ? 'active' : ''}`} onClick={() => s().updateCard(card.id, { imageFit: 'fill' })}>铺满卡片</button>
                </div>
              </div>
            </Group>
          )}

          <Group k="appearance" icon={<PaletteIcon size={14} />} title="外观">
            <div className="fld">
              <span>字体缩放</span>
              <div className="btn-row" style={{ flexWrap: 'wrap' }}>
                {[8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 42].map((fs) => (
                  <button
                    key={fs}
                    className={'btn small ' + ((card.fontSize ?? 14) === fs ? 'active' : '')}
                    style={{ fontSize: fs === 24 ? 12 : 11, minWidth: 30 }}
                    onClick={() => s().updateCard(card.id, { fontSize: fs })}
                  >
                    {fs}
                  </button>
                ))}
              </div>
              <em className="edge-w-val">当前 {(card.fontSize ?? 14)}px（默认 14）</em>
            </div>
            <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>这是正文的缩放档位（8-24），画布缩放时随画布一同放缩；富文本里单独设置的文字字号/字体会原样同步显示。</p>
          </Group>

          <Group k="behavior" icon={<GearColorIcon size={14} />} title="行为">
            <label className="fld row">
              <span>折叠内容</span>
              <input type="checkbox" checked={!!card.collapsed} onChange={(e) => s().updateCard(card.id, { collapsed: e.target.checked })} />
            </label>
            <label className="fld row">
              <span>锁定卡片</span>
              <input type="checkbox" checked={!!card.locked} onChange={(e) => s().updateCard(card.id, { locked: e.target.checked })} />
            </label>
          </Group>

        </div>
      </div>
    );
  }

  if (selectedGroupId && groups[selectedGroupId]) {
    const group = groups[selectedGroupId];
    return (
      <div className="inspector">
        <h4><BoxIcon size={15} /> 已选编组「{group.name}」</h4>
        <div className="inspector-group open">
          <div className="inspector-group-head"><BoxIcon size={14} /> 编组设置</div>
          <div className="inspector-group-body group-edit">
            <label className="fld">
              <span>组名</span>
              <input value={group.name} onChange={(e) => s().updateGroupName(group.id, e.target.value)} />
            </label>
            <div className="fld">
              <span>组颜色</span>
              <div className="palette">
                {PALETTE.map((c) => (
                  <button key={c} className={group.color === c ? 'on' : ''} style={{ background: c }} onClick={() => s().updateGroup(group.id, { color: c })} />
                ))}
              </div>
            </div>
            <label className="fld row">
              <span>固定位置（锁定组）</span>
              <input type="checkbox" checked={Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).every((c) => c.locked)} onChange={() => { const allLocked = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).every((c) => c.locked); s().lockGroup(group.id, !allLocked); }} />
            </label>
            <div className="btn-grid">
              <button className="btn small" onClick={() => s().setSelection(Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).map((c) => c.id))}><HandIcon size={13} /> 选中组内全部</button>
              <button className="btn small" onClick={() => s().dissolveGroup(group.id)}><UngroupIcon size={13} /> 解散编组</button>
              <button className="btn small danger" style={{ gridColumn: '1 / -1' }} onClick={async () => { const ids = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).map((c) => c.id); if (await csConfirm(`删除编组及组内 ${ids.length} 张卡片？`)) { s().deleteCards(ids); s().dissolveGroup(group.id); } }}><TrashColorIcon size={13} /> 删除组及内容</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (selection.length > 1) {
    const align = (m: Parameters<ReturnType<typeof useStudio.getState>['alignCards']>[0]) => () => s().alignCards(m);
    const sameGroup = s().groupIdsOf(selection).length === 1;
    const gid = sameGroup ? s().groupIdsOf(selection)[0] : null;
    const group = gid ? groups[gid] : null;
    return (
      <div className="inspector">
        <h4><FolderIcon size={15} /> 已选 {selection.length} 张卡片</h4>
        {sameGroup && group && (
          <div className="inspector-group open">
            <div className="inspector-group-head"><BoxIcon size={14} /> 编组设置</div>
            <div className="inspector-group-body group-edit">
              <label className="fld">
                <span>组名</span>
                <input value={group.name} onChange={(e) => s().updateGroupName(group.id, e.target.value)} />
              </label>
              <div className="fld">
                <span>组颜色</span>
                <div className="palette">
                  {PALETTE.map((c) => (
                    <button key={c} className={group.color === c ? 'on' : ''} style={{ background: c }} onClick={() => s().updateGroup(group.id, { color: c })} />
                  ))}
                </div>
              </div>
              <label className="fld row">
                <span>固定位置（锁定组）</span>
                <input type="checkbox" checked={Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).every((c) => c.locked)} onChange={() => { const allLocked = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).every((c) => c.locked); s().lockGroup(group.id, !allLocked); }} />
              </label>
              <div className="btn-grid">
                <button className="btn small" onClick={() => s().setSelection(Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).map((c) => c.id))}><HandIcon size={13} /> 选中组内全部</button>
                <button className="btn small" onClick={() => s().dissolveGroup(group.id)}><UngroupIcon size={13} /> 解散编组</button>
                <button className="btn small danger" style={{ gridColumn: '1 / -1' }} onClick={async () => { const ids = Object.values(cards).filter((c) => !c.writingOnly && c.groupId === group.id).map((c) => c.id); if (await csConfirm(`删除编组及组内 ${ids.length} 张卡片？`)) { s().deleteCards(ids); s().dissolveGroup(group.id); } }}><TrashColorIcon size={13} /> 删除组及内容</button>
              </div>
            </div>
          </div>
        )}
        <div className="btn-grid">
          <button className="btn primary" onClick={() => s().createGroup(selection)}><GroupIcon size={14} /> 编组所选</button>
          {sameGroup && <button className="btn" onClick={() => s().dissolveGroup(s().groupIdsOf(selection)[0])}><UngroupIcon size={14} /> 解散编组</button>}
          <button className="btn" onClick={align('left')}>左对齐</button>
          <button className="btn" onClick={align('hcenter')}>水平居中</button>
          <button className="btn" onClick={align('right')}>右对齐</button>
          <button className="btn" onClick={align('top')}>顶对齐</button>
          <button className="btn" onClick={align('vcenter')}>垂直居中</button>
          <button className="btn" onClick={align('bottom')}>底对齐</button>
          <button className="btn" onClick={align('hspace')}>水平等距</button>
          <button className="btn" onClick={align('vspace')}>垂直等距</button>
          <button className="btn" onClick={() => s().duplicateCards(selection)}><CopyIcon size={14} /> 复制全部</button>
          <button className="btn danger" onClick={() => s().deleteCards(selection)}><TrashIcon size={14} /> 删除全部</button>
        </div>
      </div>
    );
  }

  return (
    <div className="inspector muted">
      <h4><WandIcon size={15} /> 创作助手</h4>
      <p>· 双击空白处新建便签卡</p>
      <p>· 选中卡片拖动 ● 锚点可连线</p>
      <p>· 双击卡片进入富文本编辑</p>
      <p>· 拖动卡片四角任意缩放</p>
      <p>· 右键卡片有更多操作</p>
      <p>· 选中卡片或连线后，这里会出现详细设置</p>
      <p className="mt">当前项目：{meta?.name}</p>
      <p>卡片 {Object.keys(cards).length} 张 · 连线 {Object.keys(edges).length} 条</p>
    </div>
  );
}

// ================= 灵感面板 =================
interface GenItem {
  kind: string;
  text: string;
}

function Ideas() {
  const [gens, setGens] = useState<GenItem[]>([]);
  const [aiTab, setAiTab] = useState<'gen' | 'lib'>('gen');
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const projectType = useStudio((s) => s.meta?.type || 'custom');
  const s = useStudio.getState;

  const insertAtCenter = (makeCard: () => { section: string; card: ReturnType<typeof templateToCard> }) => {
    const st = s();
    const vp = st.viewport;
    const center = canvasViewCenter(vp);
    const cx = center.x;
    const cy = center.y;
    const { section, card } = makeCard();
    let sectionId = st.sections.find((x) => x.name === section)?.id;
    if (!sectionId) {
      sectionId = st.addSection(section, '📦');
    }
    const c = { ...card, sectionId, x: cx - card.w / 2, y: cy - card.h / 2, z: st.zTop + 1 };
    st.addCardsAt([c]);
    st.setSelection([c.id]);
    toast(`已插入「${c.title}」`, 'ok');
  };

  const NAME_KINDS = ['名字', '地名', '标题'];
  const DIRECTIONS = ['中式', '日式', '西式', '奇幻', '古风', '赛博', '甜宠', '随机'];

  const buildNameItems = (kind: string, direction: string, count: number): string[] => {
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      if (kind === '名字') {
        const g = genName(direction);
        items.push(`${g.name}（${g.culture}风格）`);
      } else if (kind === '地名') {
        items.push(genPlace());
      } else if (kind === '标题') {
        items.push(genTitle());
      }
    }
    return items;
  };

  const applyGeneration = (kind: string, direction: string) => {
    const items = buildNameItems(kind, direction, 5);
    setGens((prev) => [...items.map((text) => ({ kind, text })), ...prev].slice(0, 50));
  };

  const applyTypeGen = (btn: { label: string; make: () => string }) => {
    setGens((prev) => [{ kind: btn.label, text: btn.make() }, ...prev].slice(0, 50));
  };

  const genBtn = (k: string) => <button className="gen-btn" onClick={() => setPendingKind(k)}>{k}</button>;

  return (
    <div className="ideas">
      <div className="lib-h" style={{ margin: '6px 2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span><ArchitectureIcon size={14} /> 模板</span>
      </div>
      <TemplateLibrary />
    </div>
  );
}


export default function RightPanel() {
  const tab = useStudio((s) => s.rightTab);
  const setTab = useStudio((s) => s.setRightTab);
  const mobilePanel = useStudio((s) => s.mobilePanel);
  return (
    <div className={`sidebar-right ${mobilePanel === 'right' ? 'open' : ''}`}>
      <div className="sb-tabs">
        <button className={tab === 'inspector' ? 'active' : ''} onClick={() => setTab('inspector')}><InspectorIcon size={14} /> 检查器</button>
        <button className={tab === 'ideas' ? 'active' : ''} onClick={() => setTab('ideas')}><TemplateIcon size={14} /> 模板</button>
        <button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}><TreeIcon size={14} /> 思维</button>
      </div>
      {tab === 'inspector' && <Inspector />}
      {tab === 'ideas' && <Ideas />}
      {tab === 'tree' && <MindTree />}
    </div>
  );
}


// ============ 我的模板（自定义）============
function MyTemplates({ insertAtCenter }: { insertAtCenter: (fn: () => { section: string; card: ReturnType<typeof templateToCard> }) => void }) {
  const [tpls, setTpls] = useState(loadTemplates());
  const st = useStudio.getState;

  const refresh = () => setTpls(loadTemplates());

  if (!tpls.length) {
    return <div className="muted pad" style={{ fontSize: 12 }}>还没有自定义模板。选中画布上的卡片 → 右键「⭐ 存为模板」，之后就能在这里一键复用。</div>;
  }

  return (
    <div className="tpl-list" style={{ marginBottom: 10 }}>
      {tpls.map((t) => (
        <div key={t.id} className="my-tpl-row">
          <button
            className="tpl-item"
            style={{ flex: 1, margin: 0 }}
            onClick={() => {
              const s = st();
              const vp = s.viewport;
              const center = canvasViewCenter(vp);
              const cx = center.x;
              const cy = center.y;
              const secId = s.sections.find((x) => x.name === '便签')?.id || s.sections[0]?.id || '';
              const card = customTemplateToCard(t, secId, { x: cx - 150, y: cy - 100 });
              s.addCardsAt([card]);
              s.setSelection([card.id]);
              toast(`已插入模板「${t.title}」`, 'ok');
            }}
          >
            <span className="tpl-emoji"><PinIcon size={15} /></span>
            <span className="tpl-main">
              <b>{t.title}</b>
              <em>{t.kind === 'image' ? '图片模板' : `自建于 ${new Date(t.createdAt).toLocaleDateString()}`}</em>
            </span>
          </button>
          <button
            className="btn small danger"
            title="删除模板"
            onClick={() => {
              deleteTemplate(t.id);
              refresh();
              toast('已删除模板', 'ok');
            }}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}


// ============ 模板库（我的模板 + 推荐 + 内置模板 + 搜索）============
function TemplateLibrary() {
  const [kw, setKw] = useState('');
  const [myTpls, setMyTpls] = useState(loadTemplates());
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ my: true, rec: false, builtin: false });
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups((prev) => ({ ...prev, [k]: !prev[k] }));
  const toggleSec = (k: string) => setOpenSecs((prev) => ({ ...prev, [k]: prev[k] === false ? true : false }));
  const st = useStudio.getState;
  const setMobilePanel = useStudio((s) => s.setMobilePanel);
  const projectType = useStudio((s) => s.meta?.type || 'custom');
  const recommendedKeys = TYPE_TEMPLATE_KEYS[projectType];
  const recommendedTemplates = cardTemplates.filter((t) => recommendedKeys.includes(t.key));
  const insertAt = (make: () => { section: string; card: ReturnType<typeof templateToCard> }) => {
    const ss = st();
    const vp = ss.viewport;
    const center = canvasViewCenter(vp);
    const cx = center.x;
    const cy = center.y;
    const { section, card } = make();
    let sectionId = ss.sections.find((x) => x.name === section)?.id;
    if (!sectionId) sectionId = ss.addSection(section, '📦');
    const c = { ...card, sectionId, x: cx - card.w / 2, y: cy - card.h / 2, z: ss.zTop + 1 };
    ss.addCardsAt([c]);
    ss.setSelection([c.id]);
    toast(`已插入「${c.title}」`, 'ok');
  };
  const insertCustom = (t: ReturnType<typeof loadTemplates>[number]) => {
    const ss = st();
    const vp = ss.viewport;
    const center = canvasViewCenter(vp);
    const cx = center.x;
    const cy = center.y;
    const secId = ss.sections.find((x) => x.name === '便签')?.id || ss.sections[0]?.id || '';
    const card = customTemplateToCard(t, secId, { x: cx - 150, y: cy - 100 });
    ss.addCardsAt([card]);
    ss.setSelection([card.id]);
    toast(`已插入模板「${t.title}」`, 'ok');
  };
  const filtered = cardTemplates.filter(
    (t) => !kw.trim() || t.title.includes(kw.trim()) || t.section.includes(kw.trim()) || t.desc.includes(kw.trim())
  );
  const bySection: { section: string; items: typeof cardTemplates }[] = [];
  for (const t of filtered) {
    const g = bySection.find((x) => x.section === t.section);
    if (g) g.items.push(t);
    else bySection.push({ section: t.section, items: [t] });
  }
  const SecHead = ({ k, title }: { k: string; title: string }) => (
    <button type="button" className="tpl-sec-head" onClick={() => toggleSec(k)} aria-expanded={openSecs[k] !== false}>
      <span>{title}</span>
      <span className="tpl-sec-arrow">▾</span>
    </button>
  );
  return (
    <div className="ideas-body">
      <div className={`tpl-group ${openGroups.my ? 'open' : ''}`}>
        <button type="button" className="tpl-group-head" onClick={() => toggleGroup('my')} aria-expanded={openGroups.my}>
          <span><StarColorIcon size={14} /> 我的模板（右键卡片可存为模板）</span>
          <span className="tpl-group-arrow">▾</span>
        </button>
        {openGroups.my && (
          <div className="tpl-group-body">
            {myTpls.length ? (
              <div className="tpl-list" style={{ marginBottom: 10 }}>
                {myTpls.map((t) => (
                  <div key={t.id} className="my-tpl-row">
                    <button className="tpl-item" style={{ flex: 1, margin: 0 }} onClick={() => insertCustom(t)}>
                      <span className="tpl-emoji"><PinIcon size={15} /></span>
                      <span className="tpl-main">
                        <b>{t.title}</b>
                        <em>{t.kind === 'image' ? '图片模板' : `自建 ${new Date(t.createdAt).toLocaleDateString()}`}</em>
                      </span>
                    </button>
                    <button className="btn small" title="重命名" onClick={async () => {
                      const name = await csPrompt('模板名称：', t.title);
                      if (name !== null && name.trim()) {
                        const list = loadTemplates().map((x) => (x.id === t.id ? { ...x, title: name.trim() } : x));
                        localStorage.setItem('cs.templates', JSON.stringify(list));
                        setMyTpls(loadTemplates());
                      }
                    }}><PencilIcon size={15} /></button>
                    <button className="btn small danger" title="删除模板" onClick={() => {
                      deleteTemplate(t.id);
                      setMyTpls(loadTemplates());
                      toast('已删除模板', 'ok');
                    }}><TrashIcon size={14} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted pad" style={{ fontSize: 12 }}>还没有自定义模板。选中画布上的卡片 → 右键「⭐ 存为模板」即可复用。</div>
            )}
          </div>
        )}
      </div>
      {projectType !== 'custom' && (
        <div className={`tpl-group ${openGroups.rec ? 'open' : ''}`}>
          <button type="button" className="tpl-group-head" onClick={() => toggleGroup('rec')} aria-expanded={openGroups.rec}>
            <span><SparkleIcon size={14} /> 推荐模板（适配当前项目类型）</span>
            <span className="tpl-group-arrow">▾</span>
          </button>
          {openGroups.rec && (
            <div className="tpl-group-body">
              <div className="tpl-list" style={{ marginBottom: 10 }}>
                {recommendedTemplates.map((tpl) => (
                  <button key={tpl.key} className="tpl-item" onClick={() => insertAt(() => ({ section: tpl.section, card: templateToCard(tpl, '', { x: 0, y: 0 }) }))}>
                    <span className="tpl-emoji"><SectionIcon emoji={tpl.emoji} size={17} /></span>
                    <span className="tpl-main">
                      <b>{tpl.title}</b>
                      <em>{tpl.desc}</em>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className={`tpl-group ${openGroups.builtin ? 'open' : ''}`}>
        <button type="button" className="tpl-group-head" onClick={() => toggleGroup('builtin')} aria-expanded={openGroups.builtin}>
          <span><PuzzleIcon size={14} /> 内置模板</span>
          <span className="tpl-group-arrow">▾</span>
        </button>
        {openGroups.builtin && (
          <div className="tpl-group-body">
            <input className="tpl-search" placeholder="搜索模板…" value={kw} onChange={(e) => setKw(e.target.value)} />
            {bySection.map((g) => (
              <div key={g.section} style={{ marginBottom: 8 }}>
                <SecHead k={`sec-${g.section}`} title={g.section} />
                {openSecs[`sec-${g.section}`] !== false && (
                  <div className="tpl-list" style={{ marginBottom: 6 }}>
                    {g.items.map((tpl) => (
                      <button key={tpl.key} className="tpl-item" onClick={() => insertAt(() => ({ section: tpl.section, card: templateToCard(tpl, '', { x: 0, y: 0 }) }))}>
                        <span className="tpl-emoji"><SectionIcon emoji={tpl.emoji} size={17} /></span>
                        <span className="tpl-main">
                          <b>{tpl.title}</b>
                          <em>{tpl.desc}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!filtered.length && <div className="muted pad">没有匹配的模板</div>}
          </div>
        )}
      </div>
    </div>
  );
}