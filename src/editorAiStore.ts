/**
 * ============ 富文本编辑器 ↔ 悬浮 AI 桥 ============
 * 富文本编辑器（卡片/正文/全屏）挂载时注册 EditorAIBridge，
 * 全局悬浮 AI 助手通过它读取/替换当前文档内容。
 * 无编辑器挂载时为 null（悬浮 AI 自动降级为整卡操作）。
 */
import { create } from 'zustand';

export interface EditorAIBridge {
  id: string;
  label: string;
  /** 读取当前富文本选中的文字（无选中返回空串） */
  getSelection: () => string;
  /** 读取当前编辑的整篇正文纯文本（写完自查等用；无则返回空串） */
  getDocPlain?: () => string;
  /** 把文本写回正文：replace=替换选中；after=插入到选中之后。aiId 为该次应用生成唯一 id（写入正文标记 data-ai，用于恢复/清除） */
  insertResult: (text: string, mode: 'replace' | 'after', aiId?: string) => void;
  /** 按 aiId 找到正文中 AI 应用的内容：恢复原文（insert=删除插入；replace=替换回原文），成功返回 true */
  applyAiRevert?: (aiId: string, orig: string, mode: 'replace' | 'after') => boolean;
  /** 按 aiId 清除该段文字的 AI 标记（保留文字本身），成功返回 true */
  clearAiMark?: (aiId: string) => boolean;
  /** 切换编辑器只读（只读=不可编辑不可弹输入法，但仍可长按选中文字） */
  setReadonly?: (readonly: boolean) => void;
}

interface EditorAIState {
  bridge: EditorAIBridge | null;
}

export const useEditorAI = create<EditorAIState>((set) => ({
  bridge: null,
}));

export function setEditorBridge(b: EditorAIBridge | null) {
  useEditorAI.setState({ bridge: b });
}
