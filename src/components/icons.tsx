/**
 * ============ 轻量内联 SVG 图标 ============
 * 应用内图标集（TrashIcon / DeleteIcon 等），内联 SVG 避免引入图标库体积。
 * 新图标直接按同模式追加即可（stroke 当前色、可配 size）。
 */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function DeleteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* =====================================================================
   Bubble 风格内置图标集（内联 SVG，随 currentColor 变色，可配 size）
   统一：圆角端点、细描边、Bubble 轻量线条感，不依赖系统 emoji。
   ===================================================================== */
interface IconProps { size?: number; color?: string }

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style: { display: 'inline-block', verticalAlign: 'middle' as const },
  };
}

/* 随机骰子（模板随机）—— 彩色实物风，圆角骰子填充 + 白点 */
export function DiceIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.2" fill="#f4b860" />
      <path d="M7.4 3.2h-4.2a4 4 0 0 1 4.2-0z" fill="#ffd79a" opacity="0" />
      <circle cx="8.4" cy="8.4" r="1.4" fill="#fff" />
      <circle cx="15.6" cy="8.4" r="1.4" fill="#fff" />
      <circle cx="8.4" cy="15.6" r="1.4" fill="#fff" />
      <circle cx="15.6" cy="15.6" r="1.4" fill="#fff" />
      <circle cx="12" cy="12" r="1.5" fill="#fff" />
      <path d="M6 4.5a3.4 3.4 0 0 1 2.6-1.2c1.2 0 2 .5 2.5 1.2z" fill="#ffecce" />
    </svg>
  );
}

/* 标签（卡片翻面/便签）—— 彩色标签牌 */
export function TagIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M20.4 13.5l-6.9 6.9a2 2 0 0 1-2.8 0L3.4 13.1V3.4h9.7l7.3 7.3a2 2 0 0 1 0 2.8z" fill="#8f9bb3" />
      <path d="M20.4 13.5l-2.2 2.2-8-8V3.4h3.2l7.3 7.3a2 2 0 0 1 0 2.8z" fill="#6b7a96" />
      <circle cx="7.6" cy="7.6" r="1.4" fill="#fff" />
    </svg>
  );
}

/* 图片（图片卡）—— 彩色相片 */
export function ImageIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="2.8" y="4" width="18.4" height="16" rx="3" fill="#5b8def" />
      <circle cx="8.2" cy="9.6" r="1.8" fill="#ffe08a" />
      <path d="M4.5 17.5l4.8-5 3.6 3.4 3.4-3.4 4.9 5-1.2 2.5H6z" fill="#fff" opacity="0.9" />
      <path d="M5 12a3 3 0 0 1 2.8-1.9c1.2 0 2 .6 2.4 1.4z" fill="#cfe0fb" opacity="0.7" />
    </svg>
  );
}

/* 眼睛（预览）—— 彩色眼睛 */
export function EyeIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="#a8c4e8" />
      <circle cx="12" cy="12" r="4.4" fill="#fff" />
      <circle cx="12" cy="12" r="3" fill="#4a7fc1" />
      <circle cx="12" cy="12" r="1.4" fill="#20344f" />
      <circle cx="13.2" cy="9.6" r="0.9" fill="#fff" />
    </svg>
  );
}

/* 书本（预览模式/文档）—— 彩色书本 */
export function BookIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M6.5 2h13.5v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="#7c6bd6" />
      <path d="M6.5 2H12v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="#9c8fe8" />
      <path d="M6 8.5h4M6 12h4" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 锁（锁定） */
export function LockIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* 节点（思维导图节点） */
export function NodeIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M10.5 7h2a3 3 0 0 1 3 3v3.5" />
    </svg>
  );
}

/* 链接/连线 */
export function LinkIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M9.5 14.5l5-5" />
      <path d="M11 6.5l1.5-1.5a4 4 0 0 1 5.7 5.7L16.5 12.5" />
      <path d="M13 17.5l-1.5 1.5a4 4 0 0 1-5.7-5.7L7.5 11.5" />
    </svg>
  );
}

/* 设置（齿轮） */
export function GearIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  );
}

/* =====================================================================
   统一彩色内置图标集（全应用界面图标通用）
   设计语言：彩色圆角实物风（与卡片顶部 Dice/Tag/Image 一致），
   统一 viewBox=24、彩色硬编码填充，内置不依赖系统 emoji。
   ===================================================================== */

/* 菜单（三横线） */
export function MenuIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="#5b8def" stroke="#fff" strokeWidth="2" strokeLinecap="round">
      <rect x="2.5" y="3.5" width="19" height="17" rx="4" fill="#5b8def" stroke="none" />
      <path d="M6.5 8h11M6.5 12h11M6.5 16h7" />
    </svg>
  );
}

/* 文件夹 */
export function FolderIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M2.5 6.5a2 2 0 0 1 2-2H9l2 2h8.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2z" fill="#f4b860" />
      <path d="M2.5 9.5h19v5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2z" fill="#e8a24a" />
    </svg>
  );
}

/* 保存 */
export function SaveIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#5b8def" />
      <path d="M7 3v5h8V3z" fill="#fff" opacity="0.9" />
      <path d="M7 17h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 删除（垃圾桶，彩色） */
export function TrashColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 6.5h14l-1 12a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8z" fill="#8a9bb0" />
      <path d="M8 6.5V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5z" fill="#98a8bc" />
      <path d="M3 6.5h18" stroke="#e8836a" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.5 10v6M13.5 10v6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 加号（新增） */
export function AddIcon({ size = 16, color }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill={color || '#00b894'} />
      <path d="M12 8v8M8 12h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 确认（对勾） */
export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#00b894" />
      <path d="M8 12.5l2.6 2.6L16 9.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 关闭（叉） */
export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#e8836a" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 导入（下载/入） */
export function ImportIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#5b8def" />
      <path d="M12 6v7M9 10.5l3 3 3-3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 导出（上传/出） */
export function ExportIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#00b894" />
      <path d="M12 14V7M9 10.5l3-3 3 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 设置（齿轮，彩色） */
export function GearColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 2l2 2.4h2.9l-.7 2.9 2 2-.9 2.7-2.4.9v2.6l2.4.9.9 2.7-2 2 .7 2.9h-2.9L12 21l-2-2.4H7.1l.7-2.9-2-2 .9-2.7 2.4-.9V8.1l-2.4-.9-.9-2.7 2-2L7.1 2H12z" fill="#94a0b6" stroke="none" />
      <circle cx="12" cy="13" r="3.2" fill="#fff" />
      <circle cx="12" cy="13" r="2.2" fill="#6a5cf5" />
    </svg>
  );
}

/* 时间（时钟） */
export function ClockIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#f4b860" />
      <path d="M12 7v5l3.2 2.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 日历 */
export function CalendarColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#5b8def" strokeWidth="1.6" />
      <path d="M3 8.5h18" stroke="#5b8def" strokeWidth="1.6" />
      <path d="M8 2v4M16 2v4" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="13" r="1.4" fill="#e8836a" />
      <circle cx="12" cy="13" r="1.4" fill="#00b894" />
      <circle cx="16" cy="13" r="1.4" fill="#f4b860" />
    </svg>
  );
}

/* 文档/编辑（纸笔） */
export function DocIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M6 2.5h7.5L18 7v13a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5z" fill="#fff" stroke="#b8c2d4" strokeWidth="1.4" />
      <path d="M13 2.5V7h5" fill="#dfe6f2" />
      <path d="M7.5 11h6M7.5 14.5h6M7.5 18h4" stroke="#5b8def" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 画笔（绘制/创作） */
export function BrushIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 20c1-4 3-8 6-11l5 5c-3 3-7 5-11 6z" fill="#f4b860" />
      <path d="M12.5 6.5L14 4a2.5 2.5 0 0 1 3.5 0l2.5 2.5a2.5 2.5 0 0 1 0 3.5l-2.5 1.5z" fill="#e8836a" />
      <path d="M12.5 6.5l5 5" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/* 闪电（快捷/灵感） */
export function FlashIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M13 2L4 13.5h6L10 22l9-11.5h-6z" fill="#f4c542" />
    </svg>
  );
}

/* 大脑（AI 思考）—— 彩色大脑 */
export function BrainIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M9.5 3a3.5 3.5 0 0 0-3.4 2.6A3.8 3.8 0 0 0 4 9.2a3.6 3.6 0 0 0 .6 2A3.6 3.6 0 0 0 4.5 15A3.6 3.6 0 0 0 7 17.5 3.5 3.5 0 0 0 9.5 19.6 3.4 3.4 0 0 0 12 17.3V6.4A3.4 3.4 0 0 0 9.5 3z" fill="#a56ee8" />
      <path d="M14.5 3a3.5 3.5 0 0 1 3.4 2.6 3.8 3.8 0 0 1 2.1 3.6 3.6 3.6 0 0 1-.6 2 3.6 3.6 0 0 1-.5 3.8 3.6 3.6 0 0 1-2.5 2.5A3.5 3.5 0 0 1 14.5 19.6 3.4 3.4 0 0 1 12 17.3V6.4A3.4 3.4 0 0 1 14.5 3z" fill="#8b4fc8" />
      <path d="M12 7.5c-1.5 2.5-1.5 6 0 8.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      <circle cx="8.5" cy="10" r="1" fill="#fff" opacity="0.7" />
      <circle cx="15.5" cy="10" r="1" fill="#fff" opacity="0.7" />
      <circle cx="8.5" cy="14" r="1" fill="#fff" opacity="0.7" />
      <circle cx="15.5" cy="14" r="1" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/* 调色盘 */
export function PaletteIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.6-2.2-.3-1 0-2 1-2.3H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" fill="#f4b860" />
      <circle cx="8" cy="10" r="1.4" fill="#e8836a" />
      <circle cx="12" cy="7.5" r="1.4" fill="#5b8def" />
      <circle cx="16" cy="10" r="1.4" fill="#00b894" />
      <circle cx="7" cy="14.5" r="1.4" fill="#a56ee8" />
    </svg>
  );
}

/* 星星（收藏/高亮）—— 金色五角星 + 高光 */
export function StarColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3 1.2-6.5L2.5 9.3l6.6-.9z" fill="#f4c542" />
      <path d="M12 2.5l1.6 3.3-1.6 4-1.6-4z" fill="#ffe08a" opacity="0.8" />
      <circle cx="12" cy="14.5" r="0.9" fill="#d99e2b" opacity="0.7" />
    </svg>
  );
}

/* 链接/连线（彩色） */
export function LinkColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M10 14a4 4 0 0 1 0-5.7l3-3A4 4 0 0 1 18.7 10l-1.5 1.5M14 10a4 4 0 0 1 0 5.7l-3 3A4 4 0 0 1 5.3 14l1.5-1.5" fill="none" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="17" r="2.6" fill="#00b894" />
    </svg>
  );
}

/* 性能（柱状图） */
export function ChartIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#5b8def" />
      <rect x="6.5" y="12" width="2.6" height="6" rx="1" fill="#fff" />
      <rect x="10.7" y="8" width="2.6" height="10" rx="1" fill="#ffe08a" />
      <rect x="14.9" y="5" width="2.6" height="13" rx="1" fill="#fff" />
    </svg>
  );
}

/* 恢复（返回箭） */
export function RestoreIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 12a8 8 0 1 1 2 5.3" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12l-1.6-4M4 12l4-1.6" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 实验/烧瓶（娱乐场） */
export function FlaskIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M10 3h4M11 3v6l-5 8.5A2 2 0 0 0 7.8 21h8.4a2 2 0 0 0 1.8-3.5L13 9V3z" fill="#a56ee8" />
      <path d="M8 17h8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <circle cx="11" cy="14" r="1.2" fill="#ffe08a" />
    </svg>
  );
}

/* 搜索/放大镜 */
export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="10.5" cy="10.5" r="6.5" fill="#fff" stroke="#8a9bb0" strokeWidth="1.8" />
      <path d="M15.5 15.5L21 21" stroke="#8a9bb0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 灯泡（灵感/提示） */
export function BulbIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 2a6.5 6.5 0 0 0-3.6 11.9c.8.6 1.1 1.4 1.1 2.1h5c0-.7.3-1.5 1.1-2.1A6.5 6.5 0 0 0 12 2z" fill="#f4c542" />
      <path d="M10 18.5h4M10.8 21h2.4" stroke="#8a9bb0" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 节点/思维导图（树） */
export function TreeIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="9.2" y="2.5" width="5.6" height="4.6" rx="1.6" fill="#5b8def" />
      <rect x="2.5" y="10" width="5.6" height="4.6" rx="1.6" fill="#00b894" />
      <rect x="15.9" y="10" width="5.6" height="4.6" rx="1.6" fill="#f4b860" />
      <rect x="9.2" y="16.5" width="5.6" height="4.6" rx="1.6" fill="#e8836a" />
      <path d="M12 7v2M6.3 14.5L9.2 14M17.7 14.5L14.8 14M12 16.5v-2.7" stroke="#b8c2d4" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/* 对齐（直角尺，彩色） */
export function AlignIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 3v17h17v-3H7V3z" fill="#5b8def" />
      <path d="M8 7h12v3H8z" fill="#00b894" />
      <path d="M4 20l3-3" stroke="#f4b860" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 协同/地球（彩色） */
export function GlobeIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#5b8def" />
      <path d="M12 3v18" stroke="#fff" strokeWidth="1.6" />
      <path d="M4 12h16" stroke="#fff" strokeWidth="1.6" />
      <path d="M5.5 6.5c3 2 4 2.5 4 5.5s-1.5 4-4 5.5M18.5 6.5c-3 2-4 2.5-4 5.5s1.5 4 4 5.5" fill="none" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/* 铅笔（重命名/编辑，彩色） */
export function PencilIcon({ size = 16, color }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M3 21l1.2-4.5L15.5 5.2a2.2 2.2 0 0 1 3.1 0l.2.2a2.2 2.2 0 0 1 0 3.1L7.5 19.8z" fill={color || '#f4b860'} />
      <path d="M13.5 7.2l3.3 3.3" stroke="#fff" strokeWidth="1.4" />
      <path d="M3 21l1.2-4.5" stroke={color ? 'rgba(0,0,0,.25)' : '#e8a24a'} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 魔杖（默认项目徽标/正文创作） */
export function WandIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 20L15 9l2.5 2.5L6.5 22.5z" fill="#f4b860" />
      <path d="M20 3l1.5 1.5L20.8 8l2.2.7-2.2.7.7 3.5-1.5-1.6-1.5 1.6.7-3.5-2.2-.7 2.2-.7z" fill="#a56ee8" />
    </svg>
  );
}

/* 项目类型徽标（novel/rpg/gal/film/custom）—— 统一彩色 SVG */
export function ProjectTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  switch (type) {
    case 'novel':
      return (
        <svg {...svgProps(size)} fill="none" stroke="none">
          <path d="M5.5 2.5h13.5v19H5.5A2.5 2.5 0 0 1 3 19V5a2.5 2.5 0 0 1 2.5-2.5z" fill="#7c6bd6" />
          <path d="M5.5 2.5H11v19H5.5A2.5 2.5 0 0 1 3 19V5a2.5 2.5 0 0 1 2.5-2.5z" fill="#9c8fe8" />
          <path d="M5.5 8h3.5M5.5 12h3.5M5.5 16h3.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'rpg':
      return (
        <svg {...svgProps(size)} fill="none" stroke="none">
          <path d="M13 2l3 5 5.8.8-4.2 4 1 5.7L13 15l-5.2 2.5 1-5.7-4.2-4L10.4 7z" fill="#8a9bb0" />
          <path d="M6.5 18.5L3 21" stroke="#f4b860" strokeWidth="2" strokeLinecap="round" />
          <path d="M17.5 18.5L21 21" stroke="#f4b860" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'gal':
      return (
        <svg {...svgProps(size)} fill="none" stroke="none">
          <path d="M12 20S3 14.5 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 14.5 12 20 12 20z" fill="#e8836a" />
          <path d="M12 20S4 15 4 9.4A4 4 0 0 1 8 5.4 4 4 0 0 1 11 6.8a4 4 0 0 1 .5.9z" fill="#f39c8a" opacity="0.7" />
        </svg>
      );
    case 'film':
      return (
        <svg {...svgProps(size)} fill="none" stroke="none">
          <rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="#5b8def" />
          <path d="M7 4v16M17 4v16" stroke="#fff" strokeWidth="1.4" opacity="0.6" />
          <path d="M10.2 8.5l5 3.5-5 3.5z" fill="#ffe08a" />
        </svg>
      );
    case 'custom':
    default:
      return (
        <svg {...svgProps(size)} fill="none" stroke="none">
          <path d="M12 2l1.8 3.4 3.8.6-2.8 2.7.7 3.8L12 10.5l-3.5 2 .7-3.8-2.8-2.7 3.8-.6z" fill="#f4c542" />
          <path d="M5 17l1.2 2.2 2.5-.4-1.8 1.8.4 2.4L5 21.8l-2.3 1.2.4-2.4L1.3 18.8l2.5.4z" fill="#a56ee8" />
        </svg>
      );
  }
}

/* 魔法书（正文创作入口） */
export function MagicBookIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 3h11l3 3v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#7c6bd6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M18 6h3v14a2 2 0 0 1-2 2" fill="none" stroke="#f4b860" strokeWidth="1.6" />
    </svg>
  );
}

/* 便签（笔记卡）—— 彩色便签 */
export function NoteIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 2.5h10l4 4v15H5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z" fill="#ffe08a" />
      <path d="M15 2.5v4h4" fill="#f4c542" />
      <path d="M6.5 10h7M6.5 14h5" stroke="#8a7326" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 背包（道具）—— 彩色背包 */
export function BackpackIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M6 8V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3a4 4 0 0 1 4 4v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a4 4 0 0 1 4-4z" fill="#e8836a" />
      <path d="M9 2h6v3H9z" fill="#d96f5b" />
      <rect x="4" y="12" width="16" height="8" fill="#f2a08e" />
      <path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.6" />
    </svg>
  );
}

/* 对话气泡（对白/注释）—— 彩色对话 */
export function TalkIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#5b8def" />
      <path d="M7 8h10M7 12h7" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 复制—— 彩色复制 */
export function CopyIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="#8a9bb0" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 13h5M13.5 10.5v5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 拼图（模板）—— 彩色拼图块 */
export function PuzzleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M6 8a2.5 2.5 0 0 1 2.5-2.5c.3 0 .5-.2.5-.5V4a1.5 1.5 0 0 1 3 0v1.5c0 .3.2.5.5.5H15a2.5 2.5 0 0 1 2.5 2.5v2.5c0 .3.2.5.5.5h1a1.5 1.5 0 0 1 0 3h-1c-.3 0-.5.2-.5.5V15a2.5 2.5 0 0 1-2.5 2.5h-2.5a2.5 2.5 0 0 1-2.5-2.5c0-.3-.2-.5-.5-.5H6A2.5 2.5 0 0 1 6 12c.3 0 .5-.2.5-.5V9z" fill="#a56ee8" />
      <path d="M8.5 8a1.5 1.5 0 0 1 1.5-1.5c.3 0 .5-.2.5-.5V6" fill="none" stroke="#c39be8" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
      <path d="M13.5 9.5h2.5c.3 0 .5.2.5.5v1" fill="none" stroke="#c39be8" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
      <path d="M10.5 17.5h-1c-.3 0-.5-.2-.5-.5V16" fill="none" stroke="#c39be8" strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/* 锁（彩色） */
export function LockColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#8a9bb0" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="#f4b860" />
      <circle cx="12" cy="15" r="1.5" fill="#fff" />
      <path d="M12 15.5v2.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 解锁（彩色） */
export function UnlockIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M7 10V7a5 5 0 0 1 9.5-2" fill="none" stroke="#00b894" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="#00b894" />
      <circle cx="12" cy="15" r="1.5" fill="#fff" />
      <path d="M12 15.5v2.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 编组（方框+）—— 彩色编组 */
export function GroupIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="#5b8def" strokeWidth="1.8" />
      <path d="M8 8l3 3-3 3M16 8l-3 3 3 3" fill="none" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1.6" fill="#00b894" />
      <circle cx="17" cy="17" r="1.6" fill="#e8836a" />
    </svg>
  );
}

/* 适配视图（全屏）—— 彩色适配 */
export function FitViewIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" fill="none" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" fill="#f4b860" />
    </svg>
  );
}

/* 橡皮擦 —— 彩色橡皮 */
export function EraserIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M14 4l6 6a2 2 0 0 1 0 3l-7 7H8l-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0z" fill="#f4b860" />
      <path d="M13 6l5 5" stroke="#fff" strokeWidth="1.4" />
      <path d="M8 20h9" stroke="#8a9bb0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 手（移动）—— 彩色手 */
export function HandIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M7 11V5a1.5 1.5 0 0 1 3 0v5M10 11V4a1.5 1.5 0 0 1 3 0v6M13 11V5a1.5 1.5 0 0 1 3 0v7M16 11V7a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7 6 6 0 0 1-5-2.5l-3-4a1.5 1.5 0 0 1 2.4-2L7 12" fill="none" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 返回箭头 —— 彩色返回 */
export function ArrowBackIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 剪刀（断开连线）—— 彩色剪刀 */
export function ScissorsIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="5" cy="18" r="3" fill="#8a9bb0" />
      <circle cx="5" cy="6" r="3" fill="#8a9bb0" />
      <path d="M7.5 7.5L21 19M7.5 16.5L21 5" stroke="#5b8def" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* 图钉（模板/收藏）—— 彩色图钉 */
export function PinIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M14 3l7 7-1.5 1.5-7-7z" fill="#e8836a" />
      <path d="M9 8l7 7-4 4a1.5 1.5 0 0 1-1.5.4L8.5 21 3 15.5l1.6-3.9a1.5 1.5 0 0 1 .4-1z" fill="#a56ee8" />
      <circle cx="12" cy="12" r="2" fill="#fff" opacity="0.8" />
      <path d="M8 16l-3 5" stroke="#8a9bb0" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 解散编组 —— 彩色解散 */
export function UngroupIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="3" width="8" height="8" rx="2" fill="#5b8def" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill="#00b894" />
      <path d="M11 20h2M12 8v8" stroke="#e8836a" strokeWidth="1.8" strokeDasharray="2 2" strokeLinecap="round" />
    </svg>
  );
}

/* 箭头（选中/连线）—— 彩色箭头 */
export function ArrowIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 19L17 7M17 7h-6M17 7v6" fill="none" stroke="#f4b860" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 框选/多选（方框选框）—— 彩色框选 */
export function SelectIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill="rgba(91,141,239,0.18)" stroke="#5b8def" strokeWidth="2" strokeDasharray="3.5 2.5" strokeLinejoin="round" />
      <path d="M4.5 4.5L8.5 4.5M4.5 4.5L4.5 8.5M19.5 4.5L15.5 4.5M19.5 4.5L19.5 8.5M4.5 19.5L8.5 19.5M4.5 19.5L4.5 15.5M19.5 19.5L15.5 19.5M19.5 19.5L19.5 15.5" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 剪贴板（卡片/复制）—— 彩色剪贴板 */
export function ClipboardIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="4" y="4" width="16" height="18" rx="2.5" fill="#5b8def" />
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" fill="#f4b860" />
      <path d="M8 10h8M8 13.5h8M8 17h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 鼠标指针（选择工具）—— 彩色指针 */
export function CursorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M6 3l11 9.4-5 1 3 5.4-3.2 1.7-3-5.4L5 19z" fill="#5b8def" />
      <path d="M6 3l11 9.4-5 1-3.5 5.9" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 画笔工具（钢笔笔杆）—— 彩色画笔 */
export function PaintbrushIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M20.5 3.5c1 .5 1 2 0 2.5L8 18.5 4.5 20l1.5-3.5L18.5 4c.6-.5 1.4-.7 2-.5z" fill="#5b8def" />
      <path d="M8 16l4 4-5 1a1 1 0 0 1-1.2-1.2z" fill="#f4b860" />
      <path d="M5.5 15.5v4.5M20.5 3.5c-1.5.5-3 2-4 3.5" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="5.5" cy="20" r="0.8" fill="#e8836a" />
    </svg>
  );
}

/* 图层（叠层）—— 彩色图层 */
export function LayersIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 3l9 4.5L12 12 3 7.5z" fill="#5b8def" />
      <path d="M3 12l9 4.5 9-4.5" fill="none" stroke="#8e7cf0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 16.5L12 21l9-4.5" fill="none" stroke="#a99df2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 纸箱/编组（纸箱）—— 彩色纸箱 */
export function BoxIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" fill="#f4b860" />
      <path d="M3 7.5L12 12l9-4.5M12 12v9" fill="none" stroke="#c98d2b" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.5 5.2L16.5 9.7" stroke="#c98d2b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 收件箱/未编组（收件箱）—— 彩色收件箱 */
export function InboxIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 5h16l-1.5 10a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z" fill="#8e7cf0" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 5l4.5 3h2L17.5 5" fill="none" stroke="#6a5cf5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 单选（单选圆点）—— 彩色单选 */
export function SingleSelectIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#5b8def" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="#5b8def" />
    </svg>
  );
}

/* 多选（多选方块）—— 彩色多选 */
export function MultiSelectIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="#00b894" strokeWidth="2" />
      <path d="M5.5 7l1.6 1.6L10.3 5.4" fill="none" stroke="#00b894" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="#8e7cf0" strokeWidth="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="#8e7cf0" strokeWidth="2" />
      <path d="M15.5 17l1.6 1.6 3.2-3.2" fill="none" stroke="#00b894" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 上移/下移（箭头上下）—— 彩色箭头 */
export function ArrowUpIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="#5b8def" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function ArrowDownIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="#5b8def" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function ArrowRightIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="#5b8def" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 检查器（仪表盘/滑块）—— 彩色检查器 */
export function InspectorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 4h16v16H4z" fill="none" stroke="#8e7cf0" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16.5" cy="9" r="1.6" fill="#f4b860" />
      <circle cx="13" cy="13" r="1.6" fill="#e8836a" />
    </svg>
  );
}

/* 卡片（设置标题）—— 彩色卡片 */
export function CardIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" fill="#5b8def" />
      <path d="M3.5 4.5h17v3H3.5z" fill="#f4b860" />
      <path d="M6.5 11h8M6.5 14h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 框架/建筑（模板）—— 彩色框架 */
export function ArchitectureIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M3 9l9-5 9 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#8e7cf0" />
      <path d="M3 9l9-5 9 5" fill="none" stroke="#6a5cf5" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 12v7M12 11v8M17 12v7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 火花/推荐（四角星）—— 彩色火花带高光 */
export function SparkleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" fill="#f4b860" />
      <path d="M12 2.5l1.2 3.4-1.2 4-1.2-4z" fill="#ffe08a" opacity="0.7" />
      <path d="M19.5 15l.75 2.1 2.1.75-2.1.75-.75 2.1-.75-2.1-2.1-.75 2.1-.75z" fill="#8e7cf0" />
      <circle cx="5" cy="16.5" r="1" fill="#8e7cf0" opacity="0.8" />
    </svg>
  );
}

/* 模板（拼图块）—— 彩色模板 */
export function TemplateIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="#5b8def" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="#f4b860" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="#8e7cf0" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="#00b894" />
      <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 协同（地球）—— 彩色地球 */
export function SyncIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#5b8def" />
      <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="#fff" strokeWidth="1.4" />
      <path d="M3.5 9h17M3.5 15h17" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/* 刷新（循环箭头）—— 彩色刷新 */
export function ReloadIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M20 7v5h-5M4 17v-5h5" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.3 9.9A7 7 0 0 1 18.6 8M17.7 14.1A7 7 0 0 1 5.4 17" fill="none" stroke="#8e7cf0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 机器人（AI助手）—— 彩色机器人 */
export function RobotIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="4" y="7" width="16" height="12" rx="3" fill="#5b8def" />
      <path d="M12 3v4" stroke="#8e7cf0" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 3l2.2 2.2M12 3l-2.2 2.2" stroke="#8e7cf0" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="1.8" fill="#fff" />
      <circle cx="15" cy="12.5" r="1.8" fill="#fff" />
      <path d="M8 17h8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 提示/灵感（灯泡）—— 彩色灯泡 */
export function AskIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 3a5 5 0 0 1 5 5c0 2-1 3.5-2.2 4.4-.6.5-1 1-1 1.8h-3.6c0-.8-.4-1.3-1-1.8A5 5 0 0 1 12 3z" fill="#f4b860" />
      <path d="M14 14c0 .3.3.6.5.8.5.4.7 1 .7 1.5h-6.4c0-.5.2-1.1.7-1.5.2-.2.5-.5.5-.8" fill="#e8836a" />
      <path d="M10.5 19h3M11 21h2" stroke="#5b8def" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 警告（三角叹号）—— 彩色警告 */
export function ExclaimIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 3l9 16H3z" fill="#f4b860" />
      <path d="M12 10v4.5M12 17.5v.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 完成勾（绿圈勾）—— 彩色完成 */
export function CheckCircleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#00b894" />
      <path d="M7.5 12.5l2.8 2.8L16.8 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 太阳（白天）—— 彩色太阳 */
export function SunIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="4.5" fill="#f4b860" />
      <path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" stroke="#f4b860" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* 月亮（夜晚）—— 彩色月亮 */
export function MoonIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="#8e7cf0" />
      <path d="M17 5l.6 1.6L19.2 7l-1.6.6L17 9.2l-.6-1.6L14.8 7l1.6-.6z" fill="#f4b860" />
    </svg>
  );
}

/* 清晨（日出）—— 彩色日出 */
export function MorningIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 10a4 4 0 0 1 4 4h-8a4 4 0 0 1 4-4z" fill="#f4b860" />
      <path d="M12 5v2M6 6l1.5 1.5M18 6l-1.5 1.5M3 12h2M19 12h2" stroke="#f4b860" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 18h18" stroke="#e8836a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* 地图（小地图）—— 灰地图轮廓 + 彩色定位点 */
export function MapIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" fill="#b2bec3" />
      <path d="M9 3v15M15 6v15" stroke="#dfe4ea" strokeWidth="1.4" />
      <circle cx="12" cy="11" r="3.2" fill="#fff" />
      <circle cx="12" cy="11" r="2" fill="#6a5cf5" />
    </svg>
  );
}

/* 铅笔手写（确认定稿提示）—— 彩色铅笔 */
export function PenIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M4 20l1-4L16 5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z" fill="#5b8def" />
      <path d="M15 6l3 3" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/* 图钉（伏笔）—— 彩色图钉 */
export function PinColorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M9 4h6l1 7 2 3H6l2-3z" fill="#e8836a" />
      <path d="M12 14v6" stroke="#f4b860" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.5" fill="#f4b860" />
    </svg>
  );
}

/* 时钟数字（时间设定）—— 彩色时钟 */
export function ClockNumericIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="4" width="18" height="16" rx="3" fill="#5b8def" />
      <path d="M3 8.5h18" stroke="#f4b860" strokeWidth="1.6" />
      <path d="M12 9.2a3.3 3.3 0 1 0 3.3 3.3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 9.2V12l2 1.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 时间设置（齿轮时钟）—— 彩色设置 */
export function TimeSettingIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#8e7cf0" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="#5b8def" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4L17 17M7 7L5.6 5.6" stroke="#f4b860" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* 目标/任务（靶心）—— 彩色目标 */
export function TargetIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#e8836a" />
      <circle cx="12" cy="12" r="5.5" fill="#fff" />
      <circle cx="12" cy="12" r="2.6" fill="#e8836a" />
    </svg>
  );
}

/* 装备（交叉刀剑）—— 彩色剑 */
export function SwordIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M19 3l-2 2-9 9 2 2 9-9 2-2-2-2zM7 13l-4 4v2h2l4-4" fill="#a56ee8" />
      <path d="M5 15l-2 2 3 2 2-2" fill="#8b4fc8" />
      <circle cx="9" cy="17" r="1.6" fill="#f4b860" />
    </svg>
  );
}

/* 结局（旗帜）—— 彩色旗 */
export function FlagIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M5 3v18" stroke="#8a9bb0" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 4h11l-2.5 3.5L17 11H6z" fill="#e8836a" />
      <path d="M6 4v7" fill="none" stroke="#c9614a" strokeWidth="1.2" />
    </svg>
  );
}

/* 好感度（爱心）—— 彩色心 */
export function HeartIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" fill="#f783ac" />
      <path d="M12 8.5a3 3 0 0 1 5 2" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/* 次要角色（普通人物）—— 人物轮廓 */
export function UserIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="7.5" r="3.6" fill="#5b8def" />
      <path d="M5 19a7 7 0 0 1 14 0z" fill="#5b8def" />
      <path d="M12 7.5a1.8 1.8 0 1 1-.01 0" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.85" />
    </svg>
  );
}

/* 重要角色（重点人物）—— 与次要角色同轮廓，头顶加星标 */
export function ImportantUserIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <path d="M12 1.2l1.1 2.2 2.5.36-1.8 1.76.42 2.46L12 6.87l-2.22 1.11.42-2.46-1.8-1.76 2.5-.36z" fill="#f4c542" />
      <circle cx="12" cy="11" r="3.4" fill="#e8836a" />
      <path d="M6 20.5a6.5 6.5 0 0 1 12 0z" fill="#e8836a" />
      <path d="M12 11a1.7 1.7 0 1 1-.01 0" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.85" />
    </svg>
  );
}

/* 场景（场记板/电影）—— 彩色场记板 */
export function SceneIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <rect x="3" y="6" width="18" height="14" rx="2.5" fill="#5b8def" />
      <path d="M3 6l1.5-2.5 3 2 1.5-2.5 3 2 1.5-2.5 3 2 1.5-2.5" fill="#f4b860" />
      <path d="M6.5 11h7M6.5 14.5h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* 伏笔（漩涡/坑）—— 彩色漩涡 */
export function HoleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="12" cy="12" r="9" fill="#8e7cf0" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="#6a5cf5" strokeWidth="1.6" />
      <path d="M8 10a4 4 0 1 0 4 4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="10" r="1.2" fill="#fff" opacity="0.8" />
    </svg>
  );
}

/* 分支（分叉）—— 彩色分支 */
export function BranchIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="none" stroke="none">
      <circle cx="5" cy="19" r="2.2" fill="#00b894" />
      <circle cx="19" cy="5" r="2.2" fill="#f4b860" />
      <circle cx="12" cy="12" r="2.2" fill="#e8836a" />
      <path d="M5 16.8V12a7 7 0 0 1 7-7h4.8M12 12L6 16.8M12 12l6-5.2" fill="none" stroke="#b8c2d4" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ===== 分区/模板 emoji → 彩色 SVG 映射（渲染层统一图标）=====
   把常见分区/模板 emoji 映射为内置彩色图标；未识别的 emoji 返回 null（调用方按数据原样显示）。
   仅用于界面渲染，不改动底层数据（数据仍存 emoji，向后兼容）。 */
const sectionEmojiMap: Record<string, (size: number) => ReturnType<typeof GlobeIcon>> = {
  '🌍': (s) => <GlobeIcon size={s} />,
  '📋': (s) => <DocIcon size={s} />,
  '📖': (s) => <BookIcon size={s} />,
  '📜': (s) => <DocIcon size={s} />,
  '📚': (s) => <BookIcon size={s} />,
  '📄': (s) => <DocIcon size={s} />,
  '⭐': (s) => <ImportantUserIcon size={s} />,
  '👤': (s) => <UserIcon size={s} />,
  '🧩': (s) => <PuzzleIcon size={s} />,
  '⚡': (s) => <FlashIcon size={s} />,
  '💥': (s) => <FlashIcon size={s} />,
  '🎯': (s) => <TargetIcon size={s} />,
  '🎒': (s) => <BackpackIcon size={s} />,
  '🎁': (s) => <BoxIcon size={s} />,
  '⚔️': (s) => <SwordIcon size={s} />,
  '✨': (s) => <SparkleIcon size={s} />,
  '📈': (s) => <ChartIcon size={s} />,
  '🗺️': (s) => <MapIcon size={s} />,
  '🕳️': (s) => <HoleIcon size={s} />,
  '🌿': (s) => <BranchIcon size={s} />,
  '🎬': (s) => <SceneIcon size={s} />,
  '💬': (s) => <TalkIcon size={s} />,
  '💗': (s) => <HeartIcon size={s} />,
  '🚩': (s) => <FlagIcon size={s} />,
  '📝': (s) => <NoteIcon size={s} />,
  '📦': (s) => <BoxIcon size={s} />,
};

/** 渲染分区/模板 emoji 为彩色 SVG 图标；未识别的 emoji 回退显示原 emoji 文本。 */
export function SectionIcon({ emoji, size = 16 }: { emoji: string; size?: number }) {
  const mk = sectionEmojiMap[emoji];
  if (mk) return mk(size);
  return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
}

