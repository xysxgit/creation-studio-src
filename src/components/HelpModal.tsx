/**
 * ============ 操作说明弹窗 ============
 * 展示应用操作指南（新建/拖动/连线/协同/导出…）。
 * showHelpOnce：首次进入项目自动展示一次（localStorage 标记/可重置）。
 * 布局：卡片式 + 折叠 —— 每个功能区块一张 .help-card，
 *       默认仅第一张展开，点击标题行展开/收起。
 */
import { useState } from 'react';
import { useStudio } from '../store';
import { ModalShell } from './Modals';
import { FlashIcon, CursorIcon, BrainIcon, HandIcon, SparkleIcon, BoxIcon, AlignIcon, NodeIcon, WandIcon, GlobeIcon, DocIcon, PaintbrushIcon, MapIcon, BookIcon } from './icons';

const K_HELP_SEEN = 'cs.helpSeen';

export function showHelpOnce() {
  try {
    if (!localStorage.getItem(K_HELP_SEEN)) {
      localStorage.setItem(K_HELP_SEEN, '1');
      useStudio.getState().setModal('help');
    }
  } catch { /* ignore */ }
}

/** 可折叠卡片：标题行点击展开/收起 */
function Card({ title, defaultOpen, children }: { title: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={'help-card' + (open ? ' open' : '')}>
      <div className="help-card-head" onClick={() => setOpen(!open)}>
        <h4>{title}</h4>
      </div>
      {open && <div className="help-card-body">{children}</div>}
    </div>
  );
}

export default function HelpModal() {
  const modal = useStudio((s) => s.modal);
  const setModal = useStudio((s) => s.setModal);
  const [tab, setTab] = useState<'start' | 'keys' | 'mind' | 'mobile' | 'features'>('start');

  if (modal !== 'help') return null;

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="help-row">
      <code>{k}</code>
      <span>{v}</span>
    </div>
  );

  return (
    <ModalShell title={<><BookIcon /> 操作说明</>} onClose={() => setModal(null)} className="help-modal" headExtra={
      <div className="help-tabs">
        <button className={tab === 'start' ? 'active' : ''} onClick={() => setTab('start')}><FlashIcon /> 快速上手</button>
        <button className={tab === 'keys' ? 'active' : ''} onClick={() => setTab('keys')}><CursorIcon /> 快捷键</button>
        <button className={tab === 'mind' ? 'active' : ''} onClick={() => setTab('mind')}><BrainIcon /> 思维导图</button>
        <button className={tab === 'mobile' ? 'active' : ''} onClick={() => setTab('mobile')}><HandIcon /> 手机手势</button>
        <button className={tab === 'features' ? 'active' : ''} onClick={() => setTab('features')}><SparkleIcon /> 功能速查</button>
      </div>
    }>
      {tab === 'start' && (
        <div className="help-body">
          <Card title={<><BoxIcon /> 搭积木：建卡片</>} defaultOpen>
            <p>双击空白处 = 新建便签卡；顶栏「📝 便签 / 🖼 图片 / 🧩 模板」；右侧「灵感 → 模板」一键插入带字段的角色卡、世界观卡、章节卡等。</p>
          </Card>
          <Card title={<><AlignIcon /> 排布局：拖与放</>}>
            <p>拖动卡片任意摆放，拖四角手柄任意缩放；选中后「🎛 检查器」可对齐、等距、换分区颜色；右上角 ⛶ 进入全屏写作。</p>
          </Card>
          <Card title={<><NodeIcon /> 连起来：思维导图</>}>
            <p>选中卡片，拖边缘 ● 锚点到另一张卡片即连线；<b>拖动连线中段的小圆点</b>可拉出分支节点（可选手角色/事件等模板创建）；连线右键/长按可加注释、改样式、断开。</p>
          </Card>
          <Card title={<><WandIcon /> 一键整理</>}>
            <p>顶栏「🌳 思维导图 / 🕸 径向 / ▦ 网格」自动布局；「⛶ 适配」让所有内容回到视野。</p>
          </Card>
          <Card title={<><GlobeIcon /> 协同与导出</>}>
            <p>🌐 局域网实时共创；⤓ 导出 Word / Markdown / JSON 备份。</p>
          </Card>
        </div>
      )}
      {tab === 'keys' && (
        <div className="help-body">
          <Card title={<><CursorIcon /> 快捷键一览</>} defaultOpen>
            <Row k="Ctrl+Z / Ctrl+Y" v="撤销 / 重做" />
            <Row k="Ctrl+C / Ctrl+V" v="复制 / 粘贴卡片" />
            <Row k="Ctrl+D" v="复制所选卡片" />
            <Row k="Ctrl+A" v="全选卡片" />
            <Row k="Delete" v="删除所选卡片 / 连线" />
            <Row k="V / M / E / P" v="切换工具：框选 / 移动 / 选择 / 画笔" />
            <Row k="F" v="适配视图" />
            <Row k="+ / - / 0" v="放大 / 缩小 / 恢复 100%" />
            <Row k="?" v="打开操作说明" />
            <Row k="双击卡片" v="进入富文本编辑（标题/表格/图片/颜色）" />
            <Row k="双击连线" v="添加连线注释" />
            <Row k="双击空白" v="新建便签卡" />
            <Row k="空格+拖拽 / 中键" v="平移画布" />
            <Row k="滚轮 / Ctrl+滚轮" v="缩放画布（以鼠标为锚点，0.2~3 倍）" />
            <Row k="Esc" v="退出编辑 / 取消选择" />
          </Card>
        </div>
      )}
      {tab === 'mind' && (
        <div className="help-body">
          <Card title={<><BrainIcon /> 思维导图功能</>} defaultOpen>
            <Row k="选中卡 → 拖 ● 锚点" v="与另一张卡片连线" />
            <Row k="拖动连线中段圆点" v="拉出分支节点，可选模板创建，自动接上两端" />
            <Row k="连线右键 / 长按" v="加注释、改虚线/箭头/颜色、断开连线" />
            <Row k="🌳 思维导图布局" v="按连线自动整理为思维导图树" />
            <Row k="🕸 径向布局" v="以中心节点环绕展开" />
            <Row k="▦ 网格整理" v="整齐网格排列" />
            <Row k="右键卡片 → 以此卡为根" v="以选中卡为根做思维导图布局" />
            <Row k="卡片 🧠 节点模式" v="卡片切换为紧凑节点样式，更适合导图展示" />
          </Card>
        </div>
      )}
      {tab === 'mobile' && (
        <div className="help-body">
          <Card title={<><HandIcon /> 手机 / 触屏手势</>} defaultOpen>
            <Row k="单指拖动空白" v="平移画布" />
            <Row k="双指捏合" v="缩放画布" />
            <Row k="单指拖动卡片" v="移动卡片（拖四角缩放）" />
            <Row k="轻点卡片" v="选中，边缘出现 ● 锚点与缩放柄" />
            <Row k="拖动 ● 锚点" v="连线" />
            <Row k="拖动连线中段圆点" v="新建分支节点" />
            <Row k="长按卡片 / 连线 / 空白" v="弹出操作菜单" />
            <Row k="双击卡片" v="编辑正文 / 全屏写作（⛶ 按钮）" />
            <Row k="☰ / 💡" v="打开分区大纲 / 灵感检查器抽屉" />
            <Row k="🖐 移动工具" v="顶栏切换：拖动画布更顺手" />
          </Card>
        </div>
      )}
      {tab === 'features' && (
        <div className="help-body">
          <Card title={<><DocIcon /> 文本编辑</>} defaultOpen>
            <Row k="加粗 / 斜体 / 下划线 / 删除线" v="仅作用于选中的文字；未选中时作用于当前输入位置" />
            <Row k="H1 / H2 / H3" v="把选中段落设为标题层级" />
            <Row k="无序 / 有序列表" v="把选中段落转为列表" />
            <Row k="引用 / 代码块" v="把选中段落转为引用或代码块" />
            <Row k="左 / 中 / 右对齐" v="只改变选中段落的对齐方式" />
            <Row k="文字颜色 / 荧光笔" v="只给选中的文字上色或高亮" />
            <Row k="链接 / 图片 / 表格" v="在光标处或选中范围内插入" />
            <Row k="清格式 / 清空行 / 首行缩进 / 去空格 / 转正文" v="只处理选中的文字或段落，未选中时处理当前段落" />
          </Card>
          <Card title={<><PaintbrushIcon /> 画布与卡片</>}>
            <Row k="双击空白" v="新建便签卡" />
            <Row k="双击卡片" v="进入全屏写作" />
            <Row k="拖动卡片 / 四角手柄" v="移动 / 缩放卡片" />
            <Row k="拖动 ● 锚点" v="在卡片之间连线" />
            <Row k="拖动连线中段圆点" v="从连线拉出分支节点" />
            <Row k="右键 / 长按卡片" v="复制、删除、置顶、锁定、存为模板等" />
            <Row k="右键 / 长按连线" v="加注释、改线型/箭头/颜色、断开" />
          </Card>
          <Card title={<><MapIcon /> 视图与导航</>}>
            <Row k="空格 + 拖拽 / 中键" v="平移画布" />
            <Row k="Ctrl + 滚轮 / 双指捏合" v="以光标/手指为中心缩放" />
            <Row k="+ / - / 0" v="放大 / 缩小 / 恢复 100%" />
            <Row k="F" v="一键适配视图" />
            <Row k="迷你地图" v="点击跳转到对应位置" />
          </Card>
          <Card title={<><BoxIcon /> 项目与协同</>}>
            <Row k="💾 保存 / Ctrl+S" v="手动保存当前项目" />
            <Row k="🌐 局域网协同" v="多人实时编辑同一项目" />
            <Row k="☁️ 云盘同步" v="通过 WebDAV 自动备份到云盘" />
            <Row k="🗑 回收站" v="恢复误删的项目或卡片" />
          </Card>
        </div>
      )}
    </ModalShell>
  );
}