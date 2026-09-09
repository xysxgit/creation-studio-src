/**
 * ============ 卡片故事状态常量 ============
 * 卡片状态标签与颜色圆点定义（未开始/连载中/已完结/待修改/搁置 等），
 * 供画布卡片角标与故事日历状态标记共用。
 */
export const CAL_STATUS: Record<string, { label: string; dot: string }> = {
  todo: { label: '📌 待定', dot: '#9aa0a6' },
  doing: { label: '▶️ 推进中', dot: '#5a67f2' },
  done: { label: '✅ 已完成', dot: '#34c759' },
  hold: { label: '⏸ 搁置', dot: '#ff9f0a' },
};
