/**
 * annotate-sections.mjs —— 为核心大文件补充「分区注释」
 * 运行：node scripts/annotate-sections.mjs
 * 原则：按唯一文本锚点，在其上一行插入分区注释；纯注释操作，不改代码。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** {文件: [{锚点文本, 要插入的注释}]} */
const PLAN = {
  'src/store.ts': [
    { anchor: 'projects: ProjectMeta[];', insert: '  // ---------- 状态字段（持久化数据：项目/画布/设置） ----------' },
    { anchor: 'setModal: (m: string | null) => void;', insert: '  // ---------- UI / 视图控制（弹窗/面板/工具/视口等交互态） ----------' },
    { anchor: 'createProject: (type', insert: '  // ---------- 项目管理（新建/打开/关闭/删除/回收站） ----------' },
    { anchor: 'trashCards: Card[];', insert: '  // ---------- 回收站（画布卡回收 / 写作模式卡回收） ----------' },
    { anchor: 'addPage: (name', insert: '  // ---------- 多页面（分区内再分页） ----------' },
    { anchor: 'addCard: (partial', insert: '  // ---------- 画布对象操作（卡片/连线/分组/分区） ----------' },
    { anchor: 'pushHistory: (desc', insert: '  // ---------- 历史快照（撤销/重做） ----------' },
    { anchor: 'applyRemoteOps: (ops: Op[]) => void;', insert: '  // ---------- 协同（远端 op 应用 / 远端项目拉取） ----------' },
    { anchor: 'persistNow: () => void;', insert: '  // ---------- 持久化 / 手动保存 / 云同步 ----------' },
  ],
  'src/components/Modals.tsx': [
    { anchor: 'function ModalShell(', insert: '// ---------- 弹窗通用外壳（标题/关闭/遮罩） ----------' },
    { anchor: 'function NewProjectModal', insert: '// ---------- 弹窗：新建项目（类型/名称/样例） ----------' },
    { anchor: 'function OpenProjectModal', insert: '// ---------- 弹窗：打开项目（本地/文件夹/搜索） ----------' },
    { anchor: 'function SettingsModal', insert: '// ---------- 弹窗：全局设置（主题/AI/协作/方向） ----------' },
    { anchor: 'function ProjectSettingsModal', insert: '// ---------- 弹窗：项目设置（封面/描述/时段） ----------' },
    { anchor: 'function TrashModal', insert: '// ---------- 弹窗：项目回收站 ----------' },
    { anchor: 'function CardTrashModal', insert: '// ---------- 弹窗：卡片回收站 ----------' },
    { anchor: 'function ExportPreview', insert: '// ---------- 弹窗：导出预览（格式切换/内容预览） ----------' },
    { anchor: 'function ExportModal', insert: '// ---------- 弹窗：导入/导出项目 ----------' },
    { anchor: 'function SyncModal', insert: '// ---------- 弹窗：局域网协同（服务器/连接/成员） ----------' },
  ],
};

let total = 0;
for (const [rel, items] of Object.entries(PLAN)) {
  const p = join(root, rel);
  const lines = readFileSync(p, 'utf8').split('\n');
  for (const { anchor, insert } of items) {
    const idx = lines.findIndex((l) => l.includes(anchor));
    if (idx === -1) { console.log('⚠️ 未找到锚点:', rel, anchor); continue; }
    // 若上一行已是同样的分区注释则跳过（幂等）
    if (idx > 0 && lines[idx - 1].includes('----------')) continue;
    lines.splice(idx, 0, insert);
    total++;
  }
  writeFileSync(p, lines.join('\n'));
  console.log('✅', rel);
}
console.log(`已插入 ${total} 处分区注释`);